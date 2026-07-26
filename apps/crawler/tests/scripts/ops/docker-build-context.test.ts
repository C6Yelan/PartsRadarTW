// apps/crawler/tests/scripts/ops/docker-build-context.test.ts
// 驗證 deployment artifacts 不會進入 release image 的 repository build context。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(__dirname, "../../../../..");

describe("Docker build context", () => {
  it("excludes deployment backups, archives, database exports, and private keys from builds", async () => {
    const dockerignore = await readFile(join(WORKSPACE_ROOT, ".dockerignore"), "utf8");

    for (const excluded of [
      "backups/",
      "**/backups/",
      "secrets/",
      "*.sql",
      "*.dump",
      "*.backup",
      "*.tar",
      "*.tar.gz",
      "*.zip",
      "*.pem",
      "*.key",
      "*.p12",
      "*.pfx",
    ]) {
      expect(dockerignore).toContain(excluded);
    }
  });
});
