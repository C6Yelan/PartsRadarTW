// apps/crawler/tests/coolpc/manual-crawl-options.test.ts
// 驗證 manual live crawl 的確認旗標、storage allowlist 與執行失敗傳播。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runManualCrawl } from "../../src/scripts/manual/crawl-coolpc-once";
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
      externalFetchLockStaleSeconds: 43200,
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
    externalFetchLockStaleSeconds: 43200,
  };
}
