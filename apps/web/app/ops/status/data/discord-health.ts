// apps/web/app/ops/status/data/discord-health.ts
// 收集 /ops/status 需要的 Discord bot 設定、目標價追蹤與 delivery 健康摘要。

import type { OpsStatusReadClient } from "../client";
import {
  OPS_DISCORD_DELIVERY_HEALTH_SCAN_LIMIT,
  OPS_DISCORD_DELIVERY_HEALTH_SELECT,
  OPS_RECENT_DISCORD_DELIVERY_QUERY,
  type OpsDiscordDeliveryHealthRecord,
  type OpsDiscordDeliveryRecord,
} from "../queries";
import type { OpsStatusThresholds } from "../types";

// 單一 Discord delivery 類型在觀察窗口內的狀態統計。
export interface OpsStatusDiscordDeliveryKindSummary {
  sent: number;
  skipped: number;
  failed: number;
  rateLimited: number;
}

// /ops/status 顯示 Discord bot 健康狀態所需的聚合摘要。
export interface OpsStatusDiscordBotSummary {
  priceReportSettings: {
    total: number;
    enabled: number;
    dueNow: number;
  };
  targetPriceWatches: {
    active: number;
    notified: number;
    claimed: number;
  };
  recentDeliveries: {
    windowHours: number;
    priceReportNow: OpsStatusDiscordDeliveryKindSummary;
    scheduledPriceReport: OpsStatusDiscordDeliveryKindSummary;
    targetPrice: OpsStatusDiscordDeliveryKindSummary;
  };
  latestDeliveries: OpsDiscordDeliveryRecord[];
}

// 收集 Discord bot 設定數、目標價追蹤數與最近 delivery 狀態摘要。
export async function collectDiscordBotStatus(
  client: OpsStatusReadClient,
  thresholds: OpsStatusThresholds,
  recentSince: Date,
  now: Date,
): Promise<OpsStatusDiscordBotSummary> {
  const [
    totalPriceReportSettings,
    enabledPriceReportSettings,
    duePriceReportSettings,
    activeTargetPriceWatches,
    notifiedTargetPriceWatches,
    claimedTargetPriceWatches,
    deliveryHealthRecords,
    latestDeliveries,
  ] = await Promise.all([
    client.discordPriceReportSetting.count({}),
    client.discordPriceReportSetting.count({
      where: {
        enabled: true,
      },
    }),
    client.discordPriceReportSetting.count({
      where: {
        enabled: true,
        nextSendAt: {
          lte: now,
        },
      },
    }),
    client.discordTargetPriceWatch.count({
      where: {
        enabled: true,
      },
    }),
    client.discordTargetPriceWatch.count({
      where: {
        enabled: true,
        lastNotifiedAt: {
          not: null,
        },
      },
    }),
    client.discordTargetPriceWatch.count({
      where: {
        enabled: true,
        notificationClaimedAt: {
          not: null,
        },
      },
    }),
    readDiscordDeliveryHealthRecords(client, recentSince),
    client.discordNotificationDelivery.findMany(OPS_RECENT_DISCORD_DELIVERY_QUERY),
  ]);
  const deliverySummaries = summarizeLatestDiscordDeliveryStatusesByKind(deliveryHealthRecords);

  return {
    priceReportSettings: {
      total: totalPriceReportSettings,
      enabled: enabledPriceReportSettings,
      dueNow: duePriceReportSettings,
    },
    targetPriceWatches: {
      active: activeTargetPriceWatches,
      notified: notifiedTargetPriceWatches,
      claimed: claimedTargetPriceWatches,
    },
    recentDeliveries: {
      windowHours: thresholds.recentWindowHours,
      priceReportNow: deliverySummaries.PRICE_REPORT_NOW,
      scheduledPriceReport: deliverySummaries.SCHEDULED_PRICE_REPORT,
      targetPrice: deliverySummaries.TARGET_PRICE,
    },
    latestDeliveries: latestDeliveries as OpsDiscordDeliveryRecord[],
  };
}

async function readDiscordDeliveryHealthRecords(
  client: OpsStatusReadClient,
  recentSince: Date,
): Promise<OpsDiscordDeliveryHealthRecord[]> {
  return client.discordNotificationDelivery.findMany({
    where: {
      createdAt: {
        gte: recentSince,
      },
    },
    select: OPS_DISCORD_DELIVERY_HEALTH_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: OPS_DISCORD_DELIVERY_HEALTH_SCAN_LIMIT,
  }) as Promise<OpsDiscordDeliveryHealthRecord[]>;
}

function summarizeLatestDiscordDeliveryStatusesByKind(
  records: OpsDiscordDeliveryHealthRecord[],
): Record<OpsDiscordDeliveryHealthRecord["kind"], OpsStatusDiscordDeliveryKindSummary> {
  const summaries = {
    PRICE_REPORT_NOW: createEmptyDiscordDeliverySummary(),
    SCHEDULED_PRICE_REPORT: createEmptyDiscordDeliverySummary(),
    TARGET_PRICE: createEmptyDiscordDeliverySummary(),
  };
  const latestByStream = new Map<string, OpsDiscordDeliveryHealthRecord>();

  for (const record of [...records].sort(compareDiscordDeliveryHealthRecordsDesc)) {
    const key = toDiscordDeliveryStreamKey(record);

    if (!latestByStream.has(key)) {
      latestByStream.set(key, record);
    }
  }

  for (const record of latestByStream.values()) {
    const summary = summaries[record.kind];

    if (record.status === "SENT") {
      summary.sent += 1;
    } else if (record.status === "SKIPPED") {
      summary.skipped += 1;
    } else if (record.status === "FAILED") {
      summary.failed += 1;
    } else {
      summary.rateLimited += 1;
    }
  }

  return summaries;
}

function createEmptyDiscordDeliverySummary(): OpsStatusDiscordDeliveryKindSummary {
  return {
    sent: 0,
    skipped: 0,
    failed: 0,
    rateLimited: 0,
  };
}

function compareDiscordDeliveryHealthRecordsDesc(
  left: OpsDiscordDeliveryHealthRecord,
  right: OpsDiscordDeliveryHealthRecord,
): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

function toDiscordDeliveryStreamKey(record: OpsDiscordDeliveryHealthRecord): string {
  if (record.kind === "TARGET_PRICE") {
    return `${record.kind}:${record.discordUserId}:${record.targetPriceWatchId ?? record.id}`;
  }

  return `${record.kind}:${record.discordUserId}`;
}
