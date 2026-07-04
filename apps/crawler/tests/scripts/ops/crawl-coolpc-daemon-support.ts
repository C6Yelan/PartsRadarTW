import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoolpcDaemonOptions } from "../../../src/scripts/ops/crawl-coolpc-daemon";

export function createCrawlerDaemonTestEnvironment() {
  const tempRoots: string[] = [];

  return {
    cleanup: async () => {
      await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
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
    ...overrides,
  };
}
