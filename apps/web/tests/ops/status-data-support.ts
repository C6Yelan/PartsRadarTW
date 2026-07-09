// apps/web/tests/ops/status-data-support.ts
// 提供待移除的 /ops/status 測試共用 fake read client、固定時間與 delivery 資料。

import type { OpsStatusReadClient } from "../../app/ops/status/data";

export const NOW = new Date("2026-06-07T12:00:00.000Z");

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

export function fakeOpsClient(options: FakeOpsClientOptions = {}): OpsStatusReadClient {
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
