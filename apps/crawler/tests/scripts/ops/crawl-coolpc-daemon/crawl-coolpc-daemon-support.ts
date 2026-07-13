// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon/crawl-coolpc-daemon-support.ts
// 提供 scheduled CoolPC crawler daemon 測試共用的暫存 workspace 與 options fixture。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoolpcDaemonOptions } from "../../../../src/scripts/ops/crawl-coolpc-daemon/options";

export async function skipFilterSync() {
  return { outcome: "skipped" as const, state: null };
}

// 建立隔離 workspace，讓 daemon option 測試可模擬 crawler package 工作目錄。
export function createDaemonTestEnvironment() {
  const tempRoots: string[] = [];

  return {
    cleanup: async () => {
      await Promise.all(
        tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
      );
    },
    createWorkspace: async (): Promise<{ workspaceRoot: string; crawlerCwd: string }> => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-daemon-options-"));
      const crawlerCwd = join(workspaceRoot, "apps", "crawler");
      tempRoots.push(workspaceRoot);
      await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
      await mkdir(crawlerCwd, { recursive: true });

      return { workspaceRoot, crawlerCwd };
    },
  };
}

// 建立單輪 cycle 測試可覆寫的 daemon options，避免每個測試重複填完整設定。
export function createDaemonOptions(
  overrides: Partial<CoolpcDaemonOptions> = {},
): CoolpcDaemonOptions {
  return {
    workspaceRoot: "/workspace",
    storageDir: "/workspace/storage/snapshots",
    intervalSeconds: 1800,
    backoffSeconds: 3600,
    categoryDelayMs: 8000,
    lockDir: "/workspace/storage/snapshots/.locks/external-fetch",
    lockStaleSeconds: 43200,
    lockRetrySeconds: 120,
    runOnce: false,
    filterSyncIntervalSeconds: 604800,
    filterSyncStateFilePath: "/workspace/storage/snapshots/ops/coolpc-filter-sync-state.json",
    newProductImageBackfill: {
      workspaceRoot: "/workspace",
      storageDir: "/workspace/storage/product-images",
      minDelayMs: 5000,
      maxDelayMs: 12000,
      timeoutMs: 15000,
      maxSourceBytes: 5 * 1024 * 1024,
      recoveryScanLimit: 25,
      externalFetchLockDir: "/workspace/storage/snapshots/.locks/external-fetch",
      externalFetchLockStaleSeconds: 43200,
    },
    ...overrides,
  };
}
