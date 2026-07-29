// apps/crawler/tests/coolpc/manual-crawl-options.test.ts
// 驗證 manual live crawl 的確認旗標、storage allowlist、執行失敗與摘要輸出。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { printSummary, runManualCrawl } from "../../src/scripts/manual/crawl-coolpc-once";
import {
  type CrawlOptions,
  parseOptions,
} from "../../src/scripts/manual/crawl-coolpc-once/options";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("manual CoolPC crawl snapshot storage options", () => {
  it("requires explicit live fetch confirmation", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() => parseOptions([], crawlerCwd, {})).toThrow("Refusing live CoolPC fetch");
  });

  it("rejects the former raw replay flag instead of falling through to live fetch", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseOptions(["--from-raw-dir", "temp/replay", "--confirm-live-fetch"], crawlerCwd, {}),
    ).toThrow("Use manual:validate-coolpc-live");
  });

  it("uses the shared built-in snapshot root for live crawl", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();

    expect(parseOptions(["--confirm-live-fetch"], crawlerCwd, {})).toMatchObject({
      workspaceRoot,
      storageDir: join(workspaceRoot, "temp", "coolpc-daemon", "snapshots"),
      externalFetchLockDir: join(
        workspaceRoot,
        "temp",
        "coolpc-daemon",
        "snapshots",
        ".locks",
        "external-fetch",
      ),
      externalFetchLockStaleSeconds: 300,
      filterSyncStateFilePath: join(
        workspaceRoot,
        "temp",
        "coolpc-daemon",
        "snapshots",
        "ops",
        "coolpc-filter-sync-state.json",
      ),
    });
  });

  it("allows the configured root and rejects unrelated storage paths", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();
    const configuredRoot = join(workspaceRoot, "configured-snapshots");
    const configuredChild = join(configuredRoot, "manual-child");
    await mkdir(configuredChild, { recursive: true });

    expect(
      parseOptions(["--confirm-live-fetch", "--storage-dir", configuredChild], crawlerCwd, {
        SNAPSHOT_STORAGE_DIR: configuredRoot,
      }),
    ).toMatchObject({
      storageDir: configuredChild,
      externalFetchLockDir: join(configuredRoot, ".locks", "external-fetch"),
      filterSyncStateFilePath: join(configuredRoot, "ops", "coolpc-filter-sync-state.json"),
    });
    expect(() =>
      parseOptions(["--confirm-live-fetch", "--storage-dir", "temp/unrelated"], crawlerCwd, {}),
    ).toThrow("not within an allowlisted snapshot storage root");
  });
});

describe("manual CoolPC crawl execution", () => {
  it("passes accepted source filter mappings to preserve source-backed facet coverage", async () => {
    const sourceFilterTagsByIgrp = {
      "9": {
        外接盒商品: ["external_type:enclosure"],
      },
      "14": {
        "銀欣 SETA H1 機殼": ["motherboard_support:atx"],
      },
    };
    const release = vi.fn(async () => {});
    const acquireLock = vi.fn(async () => ({
      lockDir: "/tmp/external-fetch",
      owner: "manual-crawler",
      release,
    }));
    const refreshFilterSync = vi.fn(async () => ({
      outcome: "skipped" as const,
      state: acceptedFilterSyncState(sourceFilterTagsByIgrp),
    }));
    const crawlResult = {
      crawlRunId: "manual-filter-sync",
      status: "SUCCESS_UNCHANGED" as const,
      stoppedBySuspectedBlock: false,
      categoryResults: [],
    };
    const crawlCategories = vi.fn(async () => crawlResult);

    await expect(
      runManualCrawl({} as never, manualCrawlOptions(), {
        acquireLock,
        crawlCategories,
        refreshFilterSync,
      }),
    ).resolves.toBe(crawlResult);

    expect(refreshFilterSync).toHaveBeenCalledWith({
      stateFilePath: "/repo/storage/snapshots/ops/coolpc-filter-sync-state.json",
      intervalSeconds: 7 * 24 * 60 * 60,
      timeoutMs: 30_000,
      userAgent: "PartsRadarTW manual crawler smoke (+https://github.com/C6Yelan/PartsRadarTW)",
    });
    expect(crawlCategories).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFilterTagsByIgrp,
      }),
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("fails closed before category crawling without an accepted filter sync state", async () => {
    const release = vi.fn(async () => {});
    const acquireLock = vi.fn(async () => ({
      lockDir: "/tmp/external-fetch",
      owner: "manual-crawler",
      release,
    }));
    const refreshFilterSync = vi.fn(async () => ({
      outcome: "failed" as const,
      state: null,
    }));
    const crawlCategories = vi.fn();

    await expect(
      runManualCrawl({} as never, manualCrawlOptions(), {
        acquireLock,
        crawlCategories,
        refreshFilterSync,
      }),
    ).rejects.toThrow("without an accepted filter sync state");

    expect(crawlCategories).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("fails closed and releases the lock when filter sync state recovery throws", async () => {
    const stateError = new Error("filter sync state is unreadable");
    const release = vi.fn(async () => {});
    const acquireLock = vi.fn(async () => ({
      lockDir: "/tmp/external-fetch",
      owner: "manual-crawler",
      release,
    }));
    const refreshFilterSync = vi.fn(async () => {
      throw stateError;
    });
    const crawlCategories = vi.fn();

    await expect(
      runManualCrawl({} as never, manualCrawlOptions(), {
        acquireLock,
        crawlCategories,
        refreshFilterSync,
      }),
    ).rejects.toBe(stateError);

    expect(crawlCategories).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the external lock and propagates reconciliation failure", async () => {
    const reconciliationError = new Error("crawl-run reconciliation failed");
    const release = vi.fn(async () => {});
    const acquireLock = vi.fn(async () => ({
      lockDir: "/tmp/external-fetch",
      owner: "manual-crawler",
      release,
    }));
    const crawlCategories = vi.fn(async () => {
      throw reconciliationError;
    });
    const refreshFilterSync = vi.fn(async () => ({
      outcome: "skipped" as const,
      state: acceptedFilterSyncState({}),
    }));

    const result = runManualCrawl({} as never, manualCrawlOptions(), {
      acquireLock,
      crawlCategories,
      refreshFilterSync,
    });

    await expect(result).rejects.toBe(reconciliationError);
    expect(crawlCategories).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("manual CoolPC crawl summary output", () => {
  it("prints crawler-owned diagnostics without a pseudo-public product projection", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printSummary({
      workspaceRoot: "/repo",
      storageDir: "/repo/temp/coolpc-daemon/snapshots",
      beforeCounts: {
        products: 10,
        activeProducts: 8,
        productsWithImages: 7,
        currentPrices: 8,
        priceSnapshots: 20,
        rawSnapshots: 4,
      },
      afterCounts: {
        products: 12,
        activeProducts: 9,
        productsWithImages: 7,
        currentPrices: 9,
        priceSnapshots: 23,
        rawSnapshots: 5,
      },
      runResult: {
        crawlRunId: "crawl-run-03",
        status: "SUCCESS_WITH_ERRORS",
        stoppedBySuspectedBlock: false,
        categoryResults: [
          {
            sourceCategoryId: "category-4",
            igrp: 4,
            status: "SUCCESS_CHANGED",
            rawSnapshotId: "snapshot-4",
            errorMessage: null,
            productWriteSummary: null,
          },
          {
            sourceCategoryId: "category-5",
            igrp: 5,
            status: "FETCH_FAILED",
            rawSnapshotId: null,
            errorMessage: "source fetch failed",
            productWriteSummary: null,
          },
        ],
      },
    });

    const lines = log.mock.calls.map(([line]) => line);
    log.mockRestore();

    expect(lines).toEqual([
      "",
      "CoolPC manual crawl finished.",
      "- Mode: live fetch",
      "- Crawl run: crawl-run-03",
      "- Status: SUCCESS_WITH_ERRORS",
      "- Stopped by suspected block: no",
      "- Snapshot storage: temp/coolpc-daemon/snapshots",
      "",
      "Category results:",
      "- IGrp=4: SUCCESS_CHANGED",
      "- IGrp=5: FETCH_FAILED (source fetch failed)",
      "",
      "DB changes:",
      "- products: 12 (+2)",
      "- active products: 9 (+1)",
      "- products with images: 7 (+0)",
      "- current prices: 9 (+1)",
      "- price snapshots: 23 (+3)",
      "- raw snapshots: 5 (+1)",
    ]);
  });
});

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-manual-crawl-options-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });
  return { workspaceRoot, crawlerCwd };
}

function manualCrawlOptions(): CrawlOptions {
  return {
    workspaceRoot: "/repo",
    storageDir: "/repo/storage/snapshots",
    delayMs: 8000,
    externalFetchLockDir: "/repo/storage/snapshots/.locks/external-fetch",
    externalFetchLockStaleSeconds: 300,
    filterSyncStateFilePath: "/repo/storage/snapshots/ops/coolpc-filter-sync-state.json",
  };
}

function acceptedFilterSyncState(tagsByIgrp: Record<string, Record<string, string[]>>) {
  return {
    version: 2 as const,
    lastAttemptAt: "2026-07-29T05:00:00.000Z",
    lastSuccessAt: "2026-07-29T05:00:00.000Z",
    lastError: null,
    sourceHash: "accepted-filter-sync-state",
    conditionCount: 2,
    productCount: 2,
    taggedProductCount: 2,
    ambiguousProductCount: 0,
    tagsByIgrp,
    refreshRequestedAt: null,
    joinCoverageFailures: {},
  };
}
