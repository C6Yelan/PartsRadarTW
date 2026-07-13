// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-db.test.ts
// 驗證 production smoke 的 DB-backed 檢查：parse error、圖片異常與 Discord delivery。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  runProductionSmoke,
} from "../../../../src/scripts/ops/production-smoke";
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

  it("warns when recent personal or public Discord deliveries failed or were rate limited", async () => {
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
        trueParseErrorCount: 0,
        discordDeliveryCounts: {
          failed: 1,
          rateLimited: 1,
        },
        publicDiscordDeliveryCounts: {
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
          message:
            "personalFailed=1 personalRateLimited=1 publicFailed=1 publicRateLimited=1 in 24h",
        }),
      ]),
    );
    const discordCheck = summary.checks.find((check) => check.name === "discord bot deliveries");

    expect(JSON.stringify(discordCheck)).not.toContain("discord-user");
    expect(JSON.stringify(discordCheck)).not.toContain("discord-channel");
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

  it("does not warn when later successful personal and public deliveries resolve failures", async () => {
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
        publicDiscordDeliveryRecords: [
          {
            id: "delivery-public-success",
            channelId: "discord-channel-1",
            status: "SENT",
            createdAt: new Date("2026-06-02T11:20:00.000Z"),
            updatedAt: new Date("2026-06-02T11:20:00.000Z"),
          },
          {
            id: "delivery-public-failed",
            channelId: "discord-channel-1",
            status: "FAILED",
            createdAt: new Date("2026-06-02T11:15:00.000Z"),
            updatedAt: new Date("2026-06-02T11:15:00.000Z"),
          },
        ],
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.checks.find((check) => check.name === "discord bot deliveries")).toMatchObject({
      status: "OK",
      message: "personalFailed=0 personalRateLimited=0 publicFailed=0 publicRateLimited=0 in 24h",
    });
    expect(summary.status).toBe("OK");
  });

  it("uses the public retry timestamp for the recent window and latest channel status", async () => {
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
    const client = createSmokeClient({
      trueParseErrorCount: 0,
      publicDiscordDeliveryRecords: [
        {
          id: "delivery-public-newer-row",
          channelId: "discord-channel-1",
          status: "SENT",
          createdAt: new Date("2026-06-02T10:00:00.000Z"),
          updatedAt: new Date("2026-06-02T10:00:00.000Z"),
        },
        {
          id: "delivery-public-retried",
          channelId: "discord-channel-1",
          status: "FAILED",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-02T11:30:00.000Z"),
        },
      ],
    });
    const summary = await runProductionSmoke(client, options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.checks.find((check) => check.name === "discord bot deliveries")).toMatchObject({
      status: "WARN",
      message: "personalFailed=0 personalRateLimited=0 publicFailed=1 publicRateLimited=0 in 24h",
    });
    expect(client.discordPublicPriceReportDelivery.findMany).toHaveBeenCalledWith({
      where: {
        updatedAt: {
          gte: new Date("2026-06-01T12:00:00.000Z"),
        },
      },
      select: {
        id: true,
        channelId: true,
        status: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 500,
    });
  });
});
