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
});
