import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
