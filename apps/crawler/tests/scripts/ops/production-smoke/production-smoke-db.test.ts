// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-db.test.ts
// 驗證 production smoke 的 DB-backed 檢查：parse error、圖片異常與 Discord delivery。

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
            "personalFailed=1 personalExpected403=0 personalRateLimited=1 publicFailed=1 publicRateLimited=1 in 24h",
        }),
      ]),
    );
    const discordCheck = summary.checks.find((check) => check.name === "discord bot deliveries");

    expect(JSON.stringify(discordCheck)).not.toContain("discord-user");
    expect(JSON.stringify(discordCheck)).not.toContain("discord-channel");
  });

  it("treats a personal PERMISSIONS HTTP 403 as observable but non-actionable", async () => {
    const { summary, client } = await runDiscordDeliverySmoke({
      discordDeliveryRecords: [
        personalDelivery({
          id: "permissions-403",
          kind: "PRICE_REPORT_NOW",
          errorCategory: "PERMISSIONS",
          httpStatus: 403,
          providerErrorCode: 50013,
        }),
      ],
    });
    const check = summary.checks.find((item) => item.name === "discord bot deliveries");

    expect(check).toMatchObject({
      status: "OK",
      message:
        "personalFailed=0 personalExpected403=1 personalRateLimited=0 publicFailed=0 publicRateLimited=0 in 24h",
    });
    expect(summary.status).toBe("OK");
    expect(client.discordNotificationDelivery.findMany).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date("2026-06-01T12:00:00.000Z") } },
      select: {
        id: true,
        discordUserId: true,
        kind: true,
        status: true,
        targetPriceWatchId: true,
        errorCategory: true,
        httpStatus: true,
        providerErrorCode: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });
  });

  it("treats a personal DM_UNAVAILABLE HTTP 403 as observable but non-actionable", async () => {
    const { summary } = await runDiscordDeliverySmoke({
      discordDeliveryRecords: [
        personalDelivery({
          id: "dm-unavailable-403",
          kind: "SCHEDULED_PRICE_REPORT",
          errorCategory: "DM_UNAVAILABLE",
          httpStatus: 403,
          providerErrorCode: 50007,
        }),
      ],
    });

    expect(summary.checks.find((item) => item.name === "discord bot deliveries")).toMatchObject({
      status: "OK",
      message:
        "personalFailed=0 personalExpected403=1 personalRateLimited=0 publicFailed=0 publicRateLimited=0 in 24h",
    });
  });

  it("counts expected personal 403 failures independently across all notification streams", async () => {
    const { summary } = await runDiscordDeliverySmoke({
      discordDeliveryRecords: [
        personalDelivery({
          id: "price-report-now-403",
          kind: "PRICE_REPORT_NOW",
          errorCategory: "PERMISSIONS",
          httpStatus: 403,
          providerErrorCode: 50001,
        }),
        personalDelivery({
          id: "scheduled-price-report-403",
          kind: "SCHEDULED_PRICE_REPORT",
          errorCategory: "DM_UNAVAILABLE",
          httpStatus: 403,
          providerErrorCode: 50007,
        }),
        personalDelivery({
          id: "target-price-403",
          kind: "TARGET_PRICE",
          targetPriceWatchId: "watch-1",
          errorCategory: "DM_UNAVAILABLE",
          httpStatus: 403,
          providerErrorCode: 50007,
        }),
        personalDelivery({
          id: "target-price-second-watch-403",
          kind: "TARGET_PRICE",
          targetPriceWatchId: "watch-2",
          errorCategory: "PERMISSIONS",
          httpStatus: 403,
          providerErrorCode: 50013,
        }),
      ],
    });
    const check = summary.checks.find((item) => item.name === "discord bot deliveries");

    expect(check).toMatchObject({
      status: "OK",
      message:
        "personalFailed=0 personalExpected403=4 personalRateLimited=0 publicFailed=0 publicRateLimited=0 in 24h",
    });
    expect(JSON.stringify(check)).not.toMatch(
      /discord-user|discord-channel|watch-[12]|errorMessage|token|DATABASE_URL|stack|provider message/,
    );
  });

  it("keeps actionable personal failures and rate limits in WARN", async () => {
    const { summary } = await runDiscordDeliverySmoke({
      discordDeliveryRecords: [
        personalDelivery({
          id: "transport-failure",
          kind: "SCHEDULED_PRICE_REPORT",
          errorCategory: "TRANSPORT",
        }),
        personalDelivery({
          id: "provider-failure",
          discordUserId: "discord-user-2",
          kind: "PRICE_REPORT_NOW",
          errorCategory: "PROVIDER",
          httpStatus: 502,
        }),
        personalDelivery({
          id: "rate-limited",
          discordUserId: "discord-user-3",
          kind: "TARGET_PRICE",
          status: "RATE_LIMITED",
          targetPriceWatchId: "watch-2",
          errorCategory: "RATE_LIMITED",
          httpStatus: 429,
        }),
        personalDelivery({
          id: "permissions-non-403",
          discordUserId: "discord-user-4",
          kind: "SCHEDULED_PRICE_REPORT",
          errorCategory: "PERMISSIONS",
          httpStatus: 401,
        }),
        personalDelivery({
          id: "unclassified-failure",
          discordUserId: "discord-user-5",
          kind: "PRICE_REPORT_NOW",
          errorCategory: null,
        }),
        personalDelivery({
          id: "expired-interaction",
          discordUserId: "discord-user-6",
          kind: "TARGET_PRICE",
          targetPriceWatchId: "watch-3",
          errorCategory: "INTERACTION_EXPIRED",
          httpStatus: 404,
          providerErrorCode: 10062,
        }),
      ],
    });

    expect(summary.checks.find((item) => item.name === "discord bot deliveries")).toMatchObject({
      status: "WARN",
      message:
        "personalFailed=5 personalExpected403=0 personalRateLimited=1 publicFailed=0 publicRateLimited=0 in 24h",
    });
  });

  it("keeps a public report PERMISSIONS HTTP 403 in WARN", async () => {
    const { summary } = await runDiscordDeliverySmoke({
      publicDiscordDeliveryRecords: [
        {
          id: "public-permissions-403",
          channelId: "discord-channel-1",
          status: "FAILED",
          errorCategory: "PERMISSIONS",
          httpStatus: 403,
          providerErrorCode: 50013,
          createdAt: new Date("2026-06-02T11:30:00.000Z"),
          updatedAt: new Date("2026-06-02T11:30:00.000Z"),
        },
      ],
    });

    expect(summary.checks.find((item) => item.name === "discord bot deliveries")).toMatchObject({
      status: "WARN",
      message:
        "personalFailed=0 personalExpected403=0 personalRateLimited=0 publicFailed=1 publicRateLimited=0 in 24h",
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
            errorCategory: null,
            httpStatus: null,
            providerErrorCode: null,
            createdAt: new Date("2026-06-02T11:10:00.000Z"),
          },
          {
            id: "delivery-scheduled-failed",
            discordUserId: "discord-user-1",
            kind: "SCHEDULED_PRICE_REPORT",
            status: "FAILED",
            targetPriceWatchId: null,
            errorCategory: "DM_UNAVAILABLE",
            httpStatus: 403,
            providerErrorCode: 50007,
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
      message:
        "personalFailed=0 personalExpected403=0 personalRateLimited=0 publicFailed=0 publicRateLimited=0 in 24h",
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
      message:
        "personalFailed=0 personalExpected403=0 personalRateLimited=0 publicFailed=1 publicRateLimited=0 in 24h",
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

type SmokeClientOptions = Parameters<typeof createSmokeClient>[0];
type PersonalDeliveryRecord = NonNullable<SmokeClientOptions["discordDeliveryRecords"]>[number];

function personalDelivery(
  overrides: Partial<PersonalDeliveryRecord> &
    Pick<PersonalDeliveryRecord, "id" | "kind" | "errorCategory">,
): PersonalDeliveryRecord {
  return {
    discordUserId: "discord-user-1",
    status: "FAILED",
    targetPriceWatchId: null,
    httpStatus: null,
    providerErrorCode: null,
    createdAt: new Date("2026-06-02T11:30:00.000Z"),
    ...overrides,
  };
}

async function runDiscordDeliverySmoke(
  overrides: Omit<SmokeClientOptions, "trueParseErrorCount">,
) {
  const { crawlerCwd, workspaceRoot } = await createWorkspace();
  const imageDir = join(workspaceRoot, "product-images");
  await mkdir(imageDir);
  await writeFile(join(imageDir, "product-1.webp"), "webp");
  stubHealthyPublicApi();
  const options = parseProductionSmokeOptions(
    [],
    { PRODUCT_IMAGE_STORAGE_DIR: imageDir },
    crawlerCwd,
  );
  const client = createSmokeClient({ trueParseErrorCount: 0, ...overrides });
  const summary = await runProductionSmoke(client, options, new Date("2026-06-02T12:00:00.000Z"));

  return { summary, client };
}
