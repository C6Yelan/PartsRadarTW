// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon-cycle.test.ts
// 驗證 scheduled CoolPC crawler 單輪執行的 external fetch lock、retry、backoff 與新商品圖片補圖協調。

import { describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
} from "../../../src/coolpc/crawl-run";
import { runScheduledCycle } from "../../../src/scripts/ops/crawl-coolpc-daemon";
import { createDaemonOptions } from "./crawl-coolpc-daemon-support";

describe("CoolPC scheduled crawler daemon cycle", () => {
  it("releases the external fetch lock before non-crawl follow-up work", async () => {
    const calls: string[] = [];
    const fakeLock = {
      lockDir: "/tmp/external-fetch.lock",
      owner: "crawler-daemon",
      async release() {
        calls.push("release-lock");
      },
    };

    const result = await runScheduledCycle({} as never, createDaemonOptions(), {
      acquireLock: async () => {
        calls.push("acquire-lock");
        return fakeLock;
      },
      crawlCategories: async () => {
        calls.push("crawl-categories");
        return {
          crawlRunId: "crawl-run-1",
          status: CRAWL_RUN_STATUSES.SUCCESS_CHANGED,
          stoppedBySuspectedBlock: false,
          categoryResults: [
            {
              sourceCategoryId: "category-4",
              igrp: 4,
              status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
              rawSnapshotId: "raw-snapshot-1",
              errorMessage: null,
              productWriteSummary: {
                processedItemCount: 1,
                createdProductCount: 1,
                createdProductIds: ["product-1"],
                updatedProductCount: 0,
                priceSnapshotCreatedCount: 1,
                priceUnchangedCount: 0,
                missingProductUpdatedCount: 0,
                markedInactiveProductCount: 0,
              },
            },
          ],
        };
      },
      backfillNewProductImages: async ({ productIds }) => {
        expect(productIds).toEqual(["product-1"]);
        calls.push("backfill-new-product-images");
      },
    });

    expect(result).toEqual({ shouldBackoff: false });
    expect(calls).toEqual([
      "acquire-lock",
      "crawl-categories",
      "release-lock",
      "backfill-new-product-images",
    ]);
  });

  it("retries soon without crawling when another process holds the lock", async () => {
    const calls: string[] = [];

    const result = await runScheduledCycle({} as never, createDaemonOptions(), {
      acquireLock: async () => null,
      crawlCategories: async () => {
        calls.push("crawl-categories");
        throw new Error("should not crawl without lock");
      },
    });

    expect(result).toEqual({ shouldBackoff: false, retryAfterSeconds: 120 });
    expect(calls).toEqual([]);
  });

  it("skips new product image backfill when the crawl result should back off", async () => {
    const calls: string[] = [];
    const fakeLock = {
      lockDir: "/tmp/external-fetch.lock",
      owner: "crawler-daemon",
      async release() {
        calls.push("release-lock");
      },
    };

    const result = await runScheduledCycle({} as never, createDaemonOptions(), {
      acquireLock: async () => fakeLock,
      crawlCategories: async () => ({
        crawlRunId: "crawl-run-1",
        status: CRAWL_RUN_STATUSES.SUSPECTED_BLOCK,
        stoppedBySuspectedBlock: true,
        categoryResults: [
          {
            sourceCategoryId: "category-4",
            igrp: 4,
            status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
            rawSnapshotId: "raw-snapshot-1",
            errorMessage: null,
            productWriteSummary: {
              processedItemCount: 1,
              createdProductCount: 1,
              createdProductIds: ["product-1"],
              updatedProductCount: 0,
              priceSnapshotCreatedCount: 1,
              priceUnchangedCount: 0,
              missingProductUpdatedCount: 0,
              markedInactiveProductCount: 0,
            },
          },
        ],
      }),
      backfillNewProductImages: async () => {
        calls.push("backfill-new-product-images");
      },
    });

    expect(result).toEqual({ shouldBackoff: true });
    expect(calls).toEqual(["release-lock"]);
  });

  it("retries sooner when every category failed during fetch", async () => {
    const calls: string[] = [];
    const fakeLock = {
      lockDir: "/tmp/external-fetch.lock",
      owner: "crawler-daemon",
      async release() {
        calls.push("release-lock");
      },
    };

    const result = await runScheduledCycle(
      {} as never,
      createDaemonOptions({
        backoffSeconds: 3600,
      }),
      {
        acquireLock: async () => fakeLock,
        crawlCategories: async () => ({
          crawlRunId: "crawl-run-1",
          status: CRAWL_RUN_STATUSES.FETCH_FAILED,
          stoppedBySuspectedBlock: false,
          categoryResults: [
            {
              sourceCategoryId: "category-4",
              igrp: 4,
              status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED,
              rawSnapshotId: "raw-snapshot-1",
              errorMessage:
                "name=TypeError message=fetch failed cause.code=EAI_AGAIN cause.message=temporary DNS failure",
              productWriteSummary: null,
            },
            {
              sourceCategoryId: "category-12",
              igrp: 12,
              status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED,
              rawSnapshotId: "raw-snapshot-2",
              errorMessage:
                "name=TypeError message=fetch failed cause.code=EAI_AGAIN cause.message=temporary DNS failure",
              productWriteSummary: null,
            },
          ],
        }),
        backfillNewProductImages: async () => {
          calls.push("backfill-new-product-images");
        },
      },
    );

    expect(result).toEqual({ shouldBackoff: true, retryAfterSeconds: 600 });
    expect(calls).toEqual(["release-lock"]);
  });
});
