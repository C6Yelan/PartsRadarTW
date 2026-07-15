// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-workspace-support.ts
// 提供 production smoke 測試共用的最小 workspace fixture。

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 建立最小 workspace 結構，讓 smoke option parser 可解析 repo root 與 crawler cwd。
export async function createWorkspace(): Promise<{
  workspaceRoot: string;
  crawlerCwd: string;
}> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-smoke-options-"));
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");

  return {
    workspaceRoot,
    crawlerCwd: join(workspaceRoot, "apps", "crawler"),
  };
}
