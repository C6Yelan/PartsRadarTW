// apps/crawler/tests/scripts/ops/database-role-deployment.test.ts
// 驗證 migration 與 application runtime database credentials 保持 Compose 分界。

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(__dirname, "../../../../..");

describe("database role deployment contract", () => {
  it("gives migration credentials only to the migrate service and runtime credentials to apps", async () => {
    const [dockerfile, core, crawler, ops] = await Promise.all([
      readFile(join(WORKSPACE_ROOT, "Dockerfile"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "compose.yml"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "compose.crawler.yml"), "utf8"),
      readFile(join(WORKSPACE_ROOT, "compose.ops.yml"), "utf8"),
    ]);

    expect(core).toContain("x-migration-database-env: &migration-database-env");
    expect(core).toContain("MIGRATION_DATABASE_URL:");
    expect(dockerfile).toContain("pnpm db:deploy && pnpm db:configure-runtime-role");
    expect(core).toContain("<<: *migration-database-env");
    expect(core.match(/<<: \*migration-database-env/g)).toHaveLength(1);

    for (const compose of [core, crawler, ops]) {
      expect(compose).toContain("x-runtime-database-env: &runtime-database-env");
      expect(compose).toContain("${POSTGRES_RUNTIME_USER:");
      expect(compose).toContain("${POSTGRES_RUNTIME_PASSWORD:");
    }
    for (const runtimeOverlay of [crawler, ops]) {
      expect(runtimeOverlay).not.toContain("${POSTGRES_USER:");
      expect(runtimeOverlay).not.toContain("${POSTGRES_PASSWORD:");
      expect(runtimeOverlay).not.toContain("MIGRATION_DATABASE_URL");
    }
  });
});
