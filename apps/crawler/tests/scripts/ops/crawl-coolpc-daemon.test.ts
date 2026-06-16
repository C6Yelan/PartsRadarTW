// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon.test.ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
} from "../../../src/coolpc/crawl-run";
import {
  type CoolpcDaemonOptions,
  parseDaemonOptions,
  runScheduledCycle,
} from "../../../src/scripts/ops/crawl-coolpc-daemon";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CoolPC scheduled crawler daemon options", () => {
  it("requires explicit live fetch confirmation", () => {
    expect(() => parseDaemonOptions([], {}, "/repo/apps/crawler")).toThrow(
      "Refusing scheduled CoolPC live fetch",
    );
  });

  it("reads safe defaults from env and resolves storage from the workspace root", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();
    const options = parseDaemonOptions(
      ["--confirm-live-fetch"],
      {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_BACKOFF_SECONDS: "7200",
        CRAWLER_LOCK_RETRY_SECONDS: "90",
        CRAWLER_CATEGORY_DELAY_MS: "5000",
        CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS: "6000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS: "9000",
        CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS: "18000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES: "4194304",
        SNAPSHOT_STORAGE_DIR: "storage/snapshots",
        PRODUCT_IMAGE_STORAGE_DIR: "storage/product-images",
        EXTERNAL_FETCH_LOCK_STALE_SECONDS: "21600",
        EXTERNAL_FETCH_PRIORITY_TTL_SECONDS: "300",
        COOLPC_BASE_URL: "https://www.coolpc.com.tw",
      },
      crawlerCwd,
    );

    expect(options).toEqual({
      workspaceRoot,
      storageDir: join(workspaceRoot, "storage", "snapshots"),
      intervalSeconds: 600,
      backoffSeconds: 7200,
      categoryDelayMs: 5000,
      lockDir: join(workspaceRoot, "storage", "snapshots", ".locks", "external-fetch"),
      lockStaleSeconds: 21600,
      lockRetrySeconds: 90,
      prioritySignalTtlSeconds: 300,
      runOnce: false,
      baseUrl: "https://www.coolpc.com.tw",
      newProductImageBackfill: {
        workspaceRoot,
        storageDir: join(workspaceRoot, "storage", "product-images"),
        minDelayMs: 6000,
        maxDelayMs: 9000,
        timeoutMs: 18000,
        maxSourceBytes: 4194304,
      },
      priceChangeDiscordNotification: {
        publicWebhookUrl: null,
        publicBaseUrl: "https://partsradar.net/",
        maxItems: 50,
      },
    });
  });

  it("rejects command-line base URL overrides", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--base-url", "https://example.test"],
        {},
        crawlerCwd,
      ),
    ).toThrow("does not accept --base-url overrides");
  });

  it("rejects non-CoolPC base URL env values during startup parsing", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        { COOLPC_BASE_URL: "https://example.test" },
        crawlerCwd,
      ),
    ).toThrow("CoolPC base URL must be https://www.coolpc.com.tw.");
  });

  it("rejects aggressive schedule values", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "30",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "3000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--interval-seconds/CRAWLER_INTERVAL_SECONDS must be at least 60");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "60",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "2000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--category-delay-ms/CRAWLER_CATEGORY_DELAY_MS must be at least 3000");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "60",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "60001",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--category-delay-ms/CRAWLER_CATEGORY_DELAY_MS must be at most 60000");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--new-product-image-min-delay-ms",
          "12000",
          "--new-product-image-max-delay-ms",
          "5000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--new-product-image-min-delay-ms/CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS");
  });

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
      notifyPriceChanges: async () => {
        calls.push("notify-price-changes");
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
      "notify-price-changes",
      "backfill-new-product-images",
    ]);
  });

  it("requests priority and retries soon when another external fetch task holds the lock", async () => {
    const calls: string[] = [];

    const result = await runScheduledCycle({} as never, createDaemonOptions(), {
      acquireLock: async () => null,
      requestPriority: async ({ owner, ttlSeconds }) => {
        calls.push(`request-priority:${owner}:${ttlSeconds}`);
      },
      crawlCategories: async () => {
        calls.push("crawl-categories");
        throw new Error("should not crawl without lock");
      },
    });

    expect(result).toEqual({ shouldBackoff: false, retryAfterSeconds: 120 });
    expect(calls).toEqual(["request-priority:crawler-daemon:600"]);
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
      notifyPriceChanges: async () => {
        calls.push("notify-price-changes");
      },
      backfillNewProductImages: async () => {
        calls.push("backfill-new-product-images");
      },
    });

    expect(result).toEqual({ shouldBackoff: true });
    expect(calls).toEqual(["release-lock", "notify-price-changes"]);
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
        notifyPriceChanges: async () => {
          calls.push("notify-price-changes");
        },
        backfillNewProductImages: async () => {
          calls.push("backfill-new-product-images");
        },
      },
    );

    expect(result).toEqual({ shouldBackoff: true, retryAfterSeconds: 600 });
    expect(calls).toEqual(["release-lock", "notify-price-changes"]);
  });
});

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-daemon-options-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });

  return { workspaceRoot, crawlerCwd };
}

function createDaemonOptions(overrides: Partial<CoolpcDaemonOptions> = {}): CoolpcDaemonOptions {
  return {
    workspaceRoot: "/workspace",
    storageDir: "/workspace/storage/snapshots",
    intervalSeconds: 1800,
    backoffSeconds: 3600,
    categoryDelayMs: 8000,
    lockDir: "/workspace/storage/snapshots/.locks/external-fetch",
    lockStaleSeconds: 43200,
    lockRetrySeconds: 120,
    prioritySignalTtlSeconds: 600,
    runOnce: false,
    baseUrl: "https://www.coolpc.com.tw",
    newProductImageBackfill: {
      workspaceRoot: "/workspace",
      storageDir: "/workspace/storage/product-images",
      minDelayMs: 5000,
      maxDelayMs: 12000,
      timeoutMs: 15000,
      maxSourceBytes: 5 * 1024 * 1024,
    },
    priceChangeDiscordNotification: {
      publicWebhookUrl: null,
      publicBaseUrl: "https://partsradar.net/",
      maxItems: 50,
    },
    ...overrides,
  };
}
