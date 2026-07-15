// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-public.test.ts
// 驗證 production smoke 的公開 HTTP 頁面、API、圖片抽樣與 rate limit header 檢查。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  runProductionPublicSmoke,
  runProductionSmoke,
} from "../../../../src/scripts/ops/production-smoke";
import { createSmokeClient } from "./production-smoke-client-support";
import { stubHealthyPublicApi } from "./production-smoke-public-api-support";
import { createWorkspace } from "./production-smoke-workspace-support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("production smoke public checks", () => {
  it("runs public-only checks without a DB client", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ productCount: 2 });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("OK");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
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
          message: "checked=2 skippedMissingImage=0",
        }),
        expect.objectContaining({
          name: "source freshness",
          status: "OK",
          message: "lastSuccessAt=10m ago status=ok",
        }),
      ]),
    );
    expect(summary.checks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "crawler freshness",
        }),
      ]),
    );
  });

  it("skips public product image checks for list items without image metadata", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({
      nullImageProductIds: new Set(["product-2"]),
      productCount: 2,
    });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("OK");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "product image api",
          status: "OK",
          message: "checked=1 skippedMissingImage=1",
        }),
      ]),
    );
  });

  it("fails public-only checks when a v2 route is missing", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ buildListStatus: 404 });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "build-list page",
          status: "FAIL",
          message: "HTTP 404",
        }),
      ]),
    );
  });

  it("fails public-only checks when categories API has no category", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ categorySlugs: [] });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "categories api",
          status: "FAIL",
          message: "response has no category",
        }),
      ]),
    );
  });

  it("fails when the deployed categories API omits advanced filter facets", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ includeCategoryFacets: false });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "categories api",
          status: "FAIL",
          message: "response shape is invalid",
        }),
      ]),
    );
  });

  it("warns when public HTTPS smoke cannot observe a forwarded client identity", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const options = parseProductionSmokeOptions(
      ["--base-url", "https://partsradar.net"],
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

    expect(summary.status).toBe("WARN");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "rate limit headers",
          status: "WARN",
          message:
            "clientSource=unknown limit=360 remaining=359; public HTTPS smoke should expose client identity",
        }),
      ]),
    );
  });

  it("fails when a sampled product image API is unavailable", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({
      imageStatusByProductId: new Map([["product-2", 404]]),
      productCount: 3,
    });
    const options = parseProductionSmokeOptions(
      [],
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

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "product image api",
          status: "FAIL",
          message: "checked=3 skippedMissingImage=0 failed=1 firstFailure=product-2: HTTP 404",
        }),
      ]),
    );
  });
});
