// apps/crawler/tests/scripts/ops/check-product-links-support.ts
// 提供 product-link-checker 測試用的暫存 workspace 建立與清理 helper。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 建立隔離的測試環境，讓 CLI / option 測試可寫入假 workspace 並在結束後清理。
export function createProductLinkCheckerTestEnvironment() {
  const tempRoots: string[] = [];

  return {
    cleanup: async () => {
      await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
    },
    createWorkspace: async (): Promise<string> => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-link-checker-"));
      tempRoots.push(workspaceRoot);
      await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
      await mkdir(join(workspaceRoot, "apps", "crawler"), { recursive: true });

      return workspaceRoot;
    },
  };
}
