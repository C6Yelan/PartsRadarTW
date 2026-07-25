// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-parse-db.test.ts
// 驗證 production smoke 的 DB-backed parse error 檢查。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  runProductionSmoke,
} from "../../../../src/scripts/ops/production-smoke";
import { checkRecentParseErrors } from "../../../../src/scripts/ops/production-smoke/checks/parse-errors";
import { createSmokeClient } from "./production-smoke-client-support";
import { stubHealthyPublicApi } from "./production-smoke-public-api-support";
import { createWorkspace } from "./production-smoke-workspace-support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("production smoke parse DB-backed checks", () => {
  it("excludes historical filter-sync join fallback rows without hiding true parse errors", async () => {
    const count = vi.fn(async () => 2);
    const result = await checkRecentParseErrors(
      { parseError: { count } } as never,
      {
        recentWindowHours: 24,
        parseErrorWarnCount: 10,
        parseErrorFailCount: 20,
      } as never,
      new Date("2026-07-25T04:00:00.000Z"),
    );

    expect(result.status).toBe("OK");
    expect(count).toHaveBeenCalledWith({
      where: {
        NOT: [
          { errorType: "INVALID_IMAGE_URL" },
          {
            errorType: "CONTENT_VALIDATION_FAILED",
            message: { startsWith: "filter_sync_join_coverage_low;" },
          },
        ],
        lastSeenAt: { gte: new Date("2026-07-24T04:00:00.000Z") },
      },
    });
  });

  it("still fails when true parse errors exceed the configured threshold", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      ["--parse-error-fail-count", "1"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        trueParseErrorCount: 2,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "recent parse errors",
          status: "FAIL",
          message: "2 parse error(s) in 24h",
        }),
      ]),
    );
  });
});
