// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-image-db.test.ts
// 驗證 production smoke 的 DB-backed 圖片檢查。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  runProductionSmoke,
} from "../../../../src/scripts/ops/production-smoke";
import { createSmokeClient } from "./production-smoke-client-support";
import { stubHealthyPublicApi } from "./production-smoke-public-api-support";
import { createWorkspace } from "./production-smoke-workspace-support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("production smoke image DB-backed checks", () => {
  it("warns when a recent inactive product has a WebP without cache-ready metadata", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    await writeFile(join(imageDir, "historical-product.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      [],
      { PRODUCT_IMAGE_STORAGE_DIR: imageDir },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        trueParseErrorCount: 0,
        historicalImageProducts: [{ id: "historical-product" }],
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.checks).toEqual(
      expect.arrayContaining([
        {
          name: "historical image cache metadata",
          status: "WARN",
          message:
            "1/1 recent inactive product image(s) have WebP files without cache-ready metadata",
        },
      ]),
    );
    expect(summary.status).toBe("WARN");
  });

  it("does not emit the removed source image occurrence check", async () => {
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
        trueParseErrorCount: 0,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("OK");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "recent parse errors",
          status: "OK",
          message: "0 parse error(s) in 24h",
        }),
        expect.objectContaining({
          name: "rate limit headers",
          status: "OK",
          message: "clientSource=cf limit=360 remaining=359",
        }),
        expect.objectContaining({
          name: "build-list page",
          status: "OK",
          message: "HTTP 200",
        }),
        expect.objectContaining({
          name: "categories api",
          status: "OK",
          message: "categories=12 advancedFilters=motherboard,memory",
        }),
        expect.objectContaining({
          name: "product image api",
          status: "OK",
          message: "checked=1 skippedMissingImage=0",
        }),
      ]),
    );
    expect(summary.checks.map((check) => check.name)).not.toContain("source image anomalies");
  });
});
