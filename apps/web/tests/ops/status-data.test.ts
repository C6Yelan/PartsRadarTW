// apps/web/tests/ops/status-data.test.ts
import { describe, expect, it } from "vitest";
import {
  collectOpsStatus,
  type OpsStatusReadClient,
  readOpsStatusThresholds,
} from "../../app/ops/status/data";

const NOW = new Date("2026-06-07T12:00:00.000Z");

describe("collectOpsStatus", () => {
  it("returns ok when smoke-aligned signals are healthy", async () => {
    const summary = await collectOpsStatus(fakeOpsClient(), {
      now: () => NOW,
      productImageStorageDir: "/images",
      productImageExists: async () => true,
    });

    expect(summary.overallLevel).toBe("ok");
    expect(summary.productCounts).toEqual({
      active: 10,
      displayReady: 8,
      missingImages: 0,
    });
    expect(summary.discordBot.priceReportSettings).toEqual({
      total: 2,
      enabled: 1,
      dueNow: 0,
    });
    expect(summary.discordBot.targetPriceWatches).toEqual({
      active: 3,
      notified: 1,
      claimed: 0,
    });
    expect(summary.checks.map((check) => [check.key, check.level])).toContainEqual([
      "link-health",
      "ok",
    ]);
    expect(summary.checks.map((check) => [check.key, check.level])).toContainEqual([
      "discord-bot-delivery",
      "ok",
    ]);
    expect(summary.runtimeSchedule.jobs.map((job) => job.key)).toEqual([
      "price-crawler",
      "new-product-images",
      "link-health",
      "raw-snapshot-cleanup",
      "production-smoke",
      "discord-bot",
    ]);
    expect(summary.runtimeSchedule.policies.map((policy) => policy.key)).toEqual([
      "external-fetch-lock",
      "price-priority",
      "image-policy",
    ]);
  });

  it("reflects crawler and maintenance schedule overrides from env", async () => {
    const summary = await collectOpsStatus(fakeOpsClient(), {
      now: () => NOW,
      productImageStorageDir: "/images",
      productImageExists: async () => true,
      env: {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_LOCK_RETRY_SECONDS: "90",
        CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS: "2000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS: "3000",
        MAINTENANCE_INTERVAL_SECONDS: "7200",
        MAINTENANCE_LINK_LIMIT: "20",
        MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS: "420",
        RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS: "43200",
        SMOKE_INTERVAL_SECONDS: "120",
        DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS: "180",
      },
    });

    expect(summary.runtimeSchedule.jobs.find((job) => job.key === "price-crawler")).toMatchObject({
      cadence: expect.stringContaining("每 10m 執行"),
      details: expect.arrayContaining([expect.stringContaining("1m30s 後重試")]),
    });
    expect(
      summary.runtimeSchedule.jobs.find((job) => job.key === "new-product-images"),
    ).toMatchObject({
      details: expect.arrayContaining([expect.stringContaining("2s-3s")]),
    });
    expect(summary.runtimeSchedule.jobs.find((job) => job.key === "link-health")).toMatchObject({
      cadence: expect.stringContaining("每 2h 執行"),
      details: expect.arrayContaining([
        expect.stringContaining("每輪最多 20"),
        expect.stringContaining("延後 7m 再繼續"),
      ]),
    });
    expect(
      summary.runtimeSchedule.jobs.find((job) => job.key === "raw-snapshot-cleanup"),
    ).toMatchObject({
      cadence: expect.stringContaining("每 12h 執行"),
    });
    expect(
      summary.runtimeSchedule.jobs.find((job) => job.key === "production-smoke"),
    ).toMatchObject({
      cadence: expect.stringContaining("每 2m 檢查"),
    });
    expect(summary.runtimeSchedule.jobs.find((job) => job.key === "discord-bot")).toMatchObject({
      cadence: expect.stringContaining("每 3m 掃描"),
      details: expect.arrayContaining([expect.stringContaining("立即預覽")]),
    });
  });

  it("warns when recent Discord bot deliveries failed or hit rate limits", async () => {
    const summary = await collectOpsStatus(
      fakeOpsClient({
        discordDeliveryCounts: {
          TARGET_PRICE: {
            FAILED: 1,
          },
          SCHEDULED_PRICE_REPORT: {
            RATE_LIMITED: 1,
          },
        },
      }),
      {
        now: () => NOW,
        productImageStorageDir: "/images",
        productImageExists: async () => true,
      },
    );

    expect(summary.overallLevel).toBe("warn");
    expect(summary.checks.find((check) => check.key === "discord-bot-delivery")).toMatchObject({
      level: "warn",
      message: "failed=1 rateLimited=1 in 24h",
    });
  });

  it("does not warn when later Discord bot deliveries resolve earlier failures", async () => {
    const summary = await collectOpsStatus(
      fakeOpsClient({
        discordDeliveryRecords: [
          {
            id: "delivery-success",
            discordUserId: "discord-user-1",
            kind: "SCHEDULED_PRICE_REPORT",
            status: "SENT",
            targetPriceWatchId: null,
            itemCount: 5,
            messageCount: 1,
            deliveredAt: new Date("2026-06-07T11:20:00.000Z"),
            createdAt: new Date("2026-06-07T11:20:00.000Z"),
          },
          {
            id: "delivery-failed",
            discordUserId: "discord-user-1",
            kind: "SCHEDULED_PRICE_REPORT",
            status: "FAILED",
            targetPriceWatchId: null,
            itemCount: 5,
            messageCount: 1,
            deliveredAt: null,
            createdAt: new Date("2026-06-07T11:10:00.000Z"),
          },
        ],
      }),
      {
        now: () => NOW,
        productImageStorageDir: "/images",
        productImageExists: async () => true,
      },
    );

    expect(summary.checks.find((check) => check.key === "discord-bot-delivery")).toMatchObject({
      level: "ok",
      message: "failed=0 rateLimited=0 in 24h",
    });
  });
});

describe("readOpsStatusThresholds", () => {
  it("uses smoke fallback environment names for source link thresholds", () => {
    expect(
      readOpsStatusThresholds({
        SMOKE_BROKEN_LINK_WARN_COUNT: "7",
        SMOKE_TEMPORARY_LINK_FAIL_COUNT: "900",
      }).sourceBrokenLinkWarnCount,
    ).toBe(7);
    expect(
      readOpsStatusThresholds({
        SMOKE_BROKEN_LINK_WARN_COUNT: "7",
        SMOKE_TEMPORARY_LINK_FAIL_COUNT: "900",
      }).sourceTemporaryLinkFailCount,
    ).toBe(900);
  });
});

interface FakeOpsClientOptions {
  linkHealth?: Partial<
    Record<"SOURCE", Partial<Record<"OK" | "BROKEN" | "TEMPORARY_ERROR", number>>>
  >;
  discordPriceReportSettings?: Partial<Record<"total" | "enabled" | "dueNow", number>>;
  discordTargetPriceWatches?: Partial<Record<"active" | "notified" | "claimed", number>>;
  discordDeliveryCounts?: Partial<
    Record<
      "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE",
      Partial<Record<"SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED", number>>
    >
  >;
  discordDeliveryRecords?: Array<{
    id: string;
    discordUserId: string;
    kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE";
    status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
    targetPriceWatchId: string | null;
    itemCount: number;
    messageCount: number;
    deliveredAt: Date | null;
    createdAt: Date;
  }>;
}

function fakeOpsClient(options: FakeOpsClientOptions = {}): OpsStatusReadClient {
  const linkHealth = {
    SOURCE: {
      OK: 8,
      BROKEN: 0,
      TEMPORARY_ERROR: 0,
      ...options.linkHealth?.SOURCE,
    },
  };
  const discordPriceReportSettings = {
    total: 2,
    enabled: 1,
    dueNow: 0,
    ...options.discordPriceReportSettings,
  };
  const discordTargetPriceWatches = {
    active: 3,
    notified: 1,
    claimed: 0,
    ...options.discordTargetPriceWatches,
  };
  const discordDeliveryCounts = {
    PRICE_REPORT_NOW: {
      SENT: 1,
      SKIPPED: 0,
      FAILED: 0,
      RATE_LIMITED: 0,
      ...options.discordDeliveryCounts?.PRICE_REPORT_NOW,
    },
    SCHEDULED_PRICE_REPORT: {
      SENT: 1,
      SKIPPED: 0,
      FAILED: 0,
      RATE_LIMITED: 0,
      ...options.discordDeliveryCounts?.SCHEDULED_PRICE_REPORT,
    },
    TARGET_PRICE: {
      SENT: 1,
      SKIPPED: 0,
      FAILED: 0,
      RATE_LIMITED: 0,
      ...options.discordDeliveryCounts?.TARGET_PRICE,
    },
  };
  const discordDeliveryRecords =
    options.discordDeliveryRecords ?? createDiscordDeliveryRecords(discordDeliveryCounts);

  return {
    sourceCategory: {
      async findMany() {
        return [
          {
            igrp: 4,
            displayName: "CPU",
            sourceName: "處理器 CPU",
            lastCheckedAt: new Date("2026-06-07T11:55:00.000Z"),
            lastSuccessAt: new Date("2026-06-07T11:50:00.000Z"),
          },
        ];
      },
    },
    crawlRun: {
      async findLatestScheduled() {
        return {
          id: "latest-run",
          status: "SUCCESS_UNCHANGED",
          startedAt: new Date("2026-06-07T11:40:00.000Z"),
          finishedAt: new Date("2026-06-07T11:45:00.000Z"),
        };
      },
      async findLatestSuccessfulScheduled() {
        return {
          id: "success-run",
          status: "SUCCESS_UNCHANGED",
          finishedAt: new Date("2026-06-07T11:45:00.000Z"),
        };
      },
      async findMany() {
        return [
          {
            id: "latest-run",
            status: "SUCCESS_UNCHANGED",
            triggerType: "SCHEDULED",
            startedAt: new Date("2026-06-07T11:40:00.000Z"),
            finishedAt: new Date("2026-06-07T11:45:00.000Z"),
            backoffUntil: null,
            _count: {
              categoryResults: 1,
              parseErrors: 0,
              priceSnapshots: 8,
            },
          },
        ];
      },
      async count() {
        return 0;
      },
    },
    parseError: {
      async count() {
        return 0;
      },
    },
    product: {
      async count(args) {
        return "primaryImageUrl" in (args.where ?? {}) ? 8 : 10;
      },
      async findMany() {
        return Array.from({ length: 8 }, (_, index) => ({ id: `product-${index + 1}` }));
      },
    },
    productLinkHealth: {
      async count(args) {
        const kind = String(args.where?.linkKind ?? "");
        const status = args.where?.status;

        if (
          kind === "SOURCE" &&
          (status === "OK" || status === "BROKEN" || status === "TEMPORARY_ERROR")
        ) {
          return linkHealth[kind][status];
        }

        return 0;
      },
    },
    rawSnapshot: {
      async count() {
        return 0;
      },
    },
    discordPriceReportSetting: {
      async count(args) {
        const where = args.where ?? {};

        if (where.enabled === true && where.nextSendAt) {
          return discordPriceReportSettings.dueNow;
        }

        if (where.enabled === true) {
          return discordPriceReportSettings.enabled;
        }

        return discordPriceReportSettings.total;
      },
    },
    discordTargetPriceWatch: {
      async count(args) {
        const where = args.where ?? {};

        if (where.enabled === true && where.lastNotifiedAt) {
          return discordTargetPriceWatches.notified;
        }

        if (where.enabled === true && where.notificationClaimedAt) {
          return discordTargetPriceWatches.claimed;
        }

        return discordTargetPriceWatches.active;
      },
    },
    discordNotificationDelivery: {
      async count(args) {
        const kind = args.where?.kind;
        const status = args.where?.status;

        if (
          typeof kind === "string" &&
          typeof status === "string" &&
          kind in discordDeliveryCounts &&
          status in discordDeliveryCounts[kind]
        ) {
          return discordDeliveryCounts[kind][status];
        }

        return 0;
      },
      async findMany() {
        return discordDeliveryRecords;
      },
    },
  };
}

function createDiscordDeliveryRecords(
  counts: Record<
    "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE",
    Record<"SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED", number>
  >,
) {
  const records: NonNullable<FakeOpsClientOptions["discordDeliveryRecords"]> = [];
  let sequence = 0;

  for (const [kind, statuses] of Object.entries(counts)) {
    for (const [status, count] of Object.entries(statuses)) {
      for (let index = 0; index < count; index += 1) {
        sequence += 1;
        records.push({
          id: `delivery-${sequence}`,
          discordUserId: `discord-user-${sequence}`,
          kind: kind as (typeof records)[number]["kind"],
          status: status as (typeof records)[number]["status"],
          targetPriceWatchId: kind === "TARGET_PRICE" ? `target-watch-${sequence}` : null,
          itemCount: 5,
          messageCount: 1,
          deliveredAt: status === "SENT" ? new Date("2026-06-07T11:30:00.000Z") : null,
          createdAt: new Date(`2026-06-07T11:${String(30 - sequence).padStart(2, "0")}:00.000Z`),
        });
      }
    }
  }

  return records;
}
