// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon/crawl-coolpc-daemon-cycle.test.ts
// 驗證 scheduled CoolPC crawler 單輪執行的 external fetch lock、retry 與 backoff。

import { describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
} from "../../../../src/coolpc/crawl-run";
import {
  resolveLockBusyRetrySeconds,
  runScheduledCycle,
} from "../../../../src/scripts/ops/crawl-coolpc-daemon";
import { createDaemonOptions, skipFilterSync } from "./crawl-coolpc-daemon-support";

describe("CoolPC scheduled crawler daemon cycle", () => {
  it("releases the external fetch lock after the crawl", async () => {
    const calls: string[] = [];
    const synchronizedTags = { "4": { "amd test cpu": ["socket:am5"] } };
    const fakeLock = {
      lockDir: "/tmp/external-fetch.lock",
      owner: "crawler-daemon",
      async release() {
        calls.push("release-lock");
      },
    };
    const fakeMutationLock = {
      ...fakeLock,
      owner: "scheduled-crawler",
      async release() {
        calls.push("release-mutation-lock");
      },
    };

    const result = await runScheduledCycle({} as never, createDaemonOptions(), {
      acquireLock: async () => {
        calls.push("acquire-lock");
        return fakeLock;
      },
      acquireMutationLock: async () => {
        calls.push("acquire-mutation-lock");
        return fakeMutationLock;
      },
      refreshFilterSync: async () => {
        calls.push("refresh-filter-sync");
        return {
          outcome: "published",
          state: {
            version: 2,
            lastAttemptAt: "2026-07-13T04:00:00.000Z",
            lastSuccessAt: "2026-07-13T04:00:00.000Z",
            lastError: null,
            sourceHash: "hash",
            conditionCount: 63,
            productCount: 1,
            taggedProductCount: 1,
            ambiguousProductCount: 0,
            tagsByIgrp: synchronizedTags,
          },
        };
      },
      crawlCategories: async (options) => {
        calls.push("crawl-categories");
        expect(options.sourceFilterTagsByIgrp).toEqual(synchronizedTags);
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
    });

    expect(result).toEqual({
      outcome: "COMPLETED",
      cycleResult: "SUCCESS",
      shouldBackoff: false,
    });
    expect(calls).toEqual([
      "acquire-mutation-lock",
      "acquire-lock",
      "refresh-filter-sync",
      "crawl-categories",
      "release-lock",
      "release-mutation-lock",
    ]);
  });

  it("classifies raw snapshot lock contention before external work", async () => {
    const calls: string[] = [];

    const result = await runScheduledCycle({} as never, createDaemonOptions(), {
      acquireMutationLock: async () => null,
      acquireLock: async () => {
        calls.push("acquire-external-lock");
        return null;
      },
      refreshFilterSync: async () => {
        calls.push("refresh-filter-sync");
        return { outcome: "skipped", state: null };
      },
      crawlCategories: async () => {
        calls.push("crawl-categories");
        throw new Error("should not crawl without lock");
      },
    });

    expect(result).toEqual({
      outcome: "LOCK_BUSY",
      cycleResult: "LOCK_BUSY",
      shouldBackoff: false,
    });
    expect(calls).toEqual([]);
  });

  it("retries soon without crawling when another process holds the external lock", async () => {
    const calls: string[] = [];

    const result = await runScheduledCycle({} as never, createDaemonOptions(), {
      acquireMutationLock: async () => ({
        lockDir: "/tmp/mutation.lock",
        owner: "scheduled-crawler",
        async release() {
          calls.push("release-mutation-lock");
        },
      }),
      acquireLock: async () => null,
      crawlCategories: async () => {
        calls.push("crawl-categories");
        throw new Error("should not crawl without lock");
      },
    });

    expect(result).toEqual({
      outcome: "EXTERNAL_LOCK_BUSY",
      cycleResult: "LOCK_BUSY",
      shouldBackoff: false,
      retryAfterSeconds: 120,
    });
    expect(calls).toEqual(["release-mutation-lock"]);
  });

  it("starts the crawl on the next short retry after the mutation lock is released", async () => {
    let mutationAttempt = 0;
    const calls: string[] = [];
    const dependencies = {
      acquireMutationLock: async () => {
        mutationAttempt += 1;
        return mutationAttempt === 1 ? null : fakeMutationLock(calls);
      },
      acquireLock: async () => ({
        lockDir: "/tmp/external-fetch.lock",
        owner: "crawler-daemon",
        async release() {
          calls.push("release-lock");
        },
      }),
      refreshFilterSync: skipFilterSync,
      crawlCategories: async () => {
        calls.push("crawl-categories");
        return {
          crawlRunId: "crawl-run-after-lock-release",
          status: CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED,
          stoppedBySuspectedBlock: false,
          categoryResults: [],
        };
      },
    };

    await expect(
      runScheduledCycle({} as never, createDaemonOptions(), dependencies),
    ).resolves.toMatchObject({ outcome: "LOCK_BUSY", cycleResult: "LOCK_BUSY" });
    expect(calls).toEqual([]);
    expect(resolveLockBusyRetrySeconds(createDaemonOptions(), 1, () => 0.5)).toBe(45);

    await expect(
      runScheduledCycle({} as never, createDaemonOptions(), dependencies),
    ).resolves.toEqual({ outcome: "COMPLETED", cycleResult: "SUCCESS", shouldBackoff: false });
    expect(calls).toEqual(["crawl-categories", "release-lock", "release-mutation-lock"]);
  });

  it("backs off and releases the external lock when crawl reconciliation fails", async () => {
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
      acquireMutationLock: async () => fakeMutationLock(calls),
      refreshFilterSync: skipFilterSync,
      crawlCategories: async () => {
        calls.push("crawl-categories");
        throw new Error("crawl-run reconciliation failed");
      },
    });

    expect(result).toEqual({
      outcome: "CRAWL_FAILURE",
      cycleResult: "INTERNAL_FAILURE",
      shouldBackoff: true,
    });
    expect(calls).toEqual(["crawl-categories", "release-lock", "release-mutation-lock"]);
  });

  it("backs off after a suspected block", async () => {
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
      acquireMutationLock: async () => fakeMutationLock(calls),
      refreshFilterSync: skipFilterSync,
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
    });

    expect(result).toEqual({
      outcome: "COMPLETED",
      cycleResult: "SUSPECTED_BLOCK",
      shouldBackoff: true,
    });
    expect(calls).toEqual(["release-lock", "release-mutation-lock"]);
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
        acquireMutationLock: async () => fakeMutationLock(calls),
        refreshFilterSync: skipFilterSync,
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
      },
    );

    expect(result).toEqual({
      outcome: "COMPLETED",
      cycleResult: "SOURCE_FAILURE",
      shouldBackoff: true,
      retryAfterSeconds: 600,
    });
    expect(calls).toEqual(["release-lock", "release-mutation-lock"]);
  });

  it("uses jittered short retries before a bounded persistent-lock retry", () => {
    const options = createDaemonOptions({
      lockBusyRetrySeconds: 45,
      lockBusyMaxRetries: 5,
    });

    expect(resolveLockBusyRetrySeconds(options, 1, () => 0)).toBe(41);
    expect(resolveLockBusyRetrySeconds(options, 5, () => 1)).toBe(50);
    expect(resolveLockBusyRetrySeconds(options, 6, () => 0)).toBe(300);
  });
});

function fakeMutationLock(calls: string[]) {
  return {
    lockDir: "/tmp/mutation.lock",
    owner: "scheduled-crawler",
    async release() {
      calls.push("release-mutation-lock");
    },
  };
}
