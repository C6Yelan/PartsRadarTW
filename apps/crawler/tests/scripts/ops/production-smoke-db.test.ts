// apps/crawler/tests/scripts/ops/production-smoke-db.test.ts
// 驗證 production smoke 的 DB-backed 檢查：parse error、圖片異常、link health 與 Discord delivery。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  runProductionSmoke,
} from "../../../src/scripts/ops/production-smoke";
import {
  createSmokeClient,
  createWorkspace,
  stubHealthyPublicApi,
} from "./production-smoke-support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("production smoke DB-backed checks", () => {
  it("keeps invalid image URL issues informational below the anomaly threshold", async () => {
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
        invalidImageErrorCount: 624,
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
          name: "source image anomalies",
          status: "OK",
          message:
            "624 rows / 16 distinct products / 5 distinct raw image urls in 24h, warnAfter=2000",
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
          message: "categories=11",
        }),
        expect.objectContaining({
          name: "product image api",
          status: "OK",
          message: "checked=1 skippedMissingImage=0",
        }),
      ]),
    );
  });

  it("warns when invalid image URL issues exceed the anomaly threshold", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      ["--invalid-image-url-warn-count", "2000"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 2001,
        trueParseErrorCount: 0,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("WARN");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "recent parse errors",
          status: "OK",
          message: "0 parse error(s) in 24h",
        }),
        expect.objectContaining({
          name: "source image anomalies",
          status: "WARN",
          message:
            "2001 rows / 16 distinct products / 5 distinct raw image urls in 24h, warnAfter=2000",
        }),
      ]),
    );
  });

  it("warns when source temporary link errors exceed the source threshold", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      [],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        SMOKE_TEMPORARY_LINK_WARN_COUNT: "100",
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
        linkHealthCounts: {
          sourceTemporary: 101,
        },
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("WARN");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "link health",
          status: "WARN",
          message: "source broken=0 temporary=101",
        }),
      ]),
    );
  });

  it("warns when recent Discord bot deliveries failed or were rate limited", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      [],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
        discordDeliveryCounts: {
          failed: 1,
          rateLimited: 1,
        },
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("WARN");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "discord bot deliveries",
          status: "WARN",
          message: "failed=1 rateLimited=1 in 24h",
        }),
      ]),
    );
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
        invalidImageErrorCount: 0,
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
        expect.objectContaining({
          name: "source image anomalies",
          status: "OK",
          message:
            "0 rows / 0 distinct products / 0 distinct raw image urls in 24h, warnAfter=2000",
        }),
      ]),
    );
  });

  it("does not warn when a later successful Discord bot delivery resolves the failure", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      [],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
        discordDeliveryRecords: [
          {
            id: "delivery-scheduled-success",
            discordUserId: "discord-user-1",
            kind: "SCHEDULED_PRICE_REPORT",
            status: "SENT",
            targetPriceWatchId: null,
            createdAt: new Date("2026-06-02T11:10:00.000Z"),
          },
          {
            id: "delivery-scheduled-failed",
            discordUserId: "discord-user-1",
            kind: "SCHEDULED_PRICE_REPORT",
            status: "FAILED",
            targetPriceWatchId: null,
            createdAt: new Date("2026-06-02T11:00:00.000Z"),
          },
        ],
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.checks.find((check) => check.name === "discord bot deliveries")).toMatchObject({
      status: "OK",
      message: "failed=0 rateLimited=0 in 24h",
    });
    expect(summary.status).toBe("OK");
  });
});
