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
    });
    expect(() =>
      parseOptions(["--confirm-live-fetch", "--storage-dir", "temp/unrelated"], crawlerCwd, {}),
    ).toThrow("not within an allowlisted snapshot storage root");
  });
});

describe("manual CoolPC crawl execution", () => {
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

    const result = runManualCrawl({} as never, manualCrawlOptions(), {
      acquireLock,
      crawlCategories,
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
  };
}
