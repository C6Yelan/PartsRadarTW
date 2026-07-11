// apps/crawler/src/scripts/ops/production-smoke/checks/discord-deliveries.ts
// 檢查近期 personal / public Discord delivery 的最新失敗與 rate limit 狀態。

import { MILLISECONDS_PER_HOUR } from "../constants";
import { ok, warn } from "../results";
import type { ProductionSmokeClient, ProductionSmokeOptions, SmokeCheckResult } from "../types";

const DISCORD_DELIVERY_HEALTH_SCAN_LIMIT = 500;

// 只統計每個通知 stream 的最新 delivery，避免舊失敗已被後續成功覆蓋仍持續告警。
export async function checkDiscordBotDeliveries(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const [personalRecords, publicRecords] = await Promise.all([
    client.discordNotificationDelivery.findMany({
      where: {
        createdAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        discordUserId: true,
        kind: true,
        status: true,
        targetPriceWatchId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: DISCORD_DELIVERY_HEALTH_SCAN_LIMIT,
    }),
    client.discordPublicPriceReportDelivery.findMany({
      where: {
        updatedAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        channelId: true,
        status: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: DISCORD_DELIVERY_HEALTH_SCAN_LIMIT,
    }),
  ]);
  const personal = summarizeLatestDiscordDeliveryStatuses(
    personalRecords,
    toPersonalDiscordDeliveryStreamKey,
    (record) => record.createdAt,
  );
  const publicReports = summarizeLatestDiscordDeliveryStatuses(
    publicRecords,
    (record: PublicDiscordDeliveryHealthRecord) => `PUBLIC_PRICE_REPORT:${record.channelId}`,
    (record) => record.updatedAt,
  );
  const issueCount =
    personal.failed + personal.rateLimited + publicReports.failed + publicReports.rateLimited;
  const message =
    `personalFailed=${personal.failed} personalRateLimited=${personal.rateLimited} ` +
    `publicFailed=${publicReports.failed} publicRateLimited=${publicReports.rateLimited} ` +
    `in ${options.recentWindowHours}h`;

  return issueCount > 0
    ? warn("discord bot deliveries", message)
    : ok("discord bot deliveries", message);
}

interface DiscordDeliveryHealthRecord {
  id: string;
  status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
}

interface PersonalDiscordDeliveryHealthRecord extends DiscordDeliveryHealthRecord {
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE";
  targetPriceWatchId: string | null;
  createdAt: Date;
}

interface PublicDiscordDeliveryHealthRecord extends DiscordDeliveryHealthRecord {
  channelId: string;
  updatedAt: Date;
}

// 將近期 delivery 依呼叫端定義的 stream 去重，只統計仍未被後續成功覆蓋的最新狀態。
function summarizeLatestDiscordDeliveryStatuses<T extends DiscordDeliveryHealthRecord>(
  records: T[],
  toStreamKey: (record: T) => string,
  toAttemptedAt: (record: T) => Date,
): {
  failed: number;
  rateLimited: number;
} {
  const latestByStream = new Map<string, T>();

  for (const record of [...records].sort(
    (left, right) =>
      toAttemptedAt(right).getTime() - toAttemptedAt(left).getTime() ||
      right.id.localeCompare(left.id),
  )) {
    const key = toStreamKey(record);

    if (!latestByStream.has(key)) {
      latestByStream.set(key, record);
    }
  }

  let failed = 0;
  let rateLimited = 0;

  for (const record of latestByStream.values()) {
    if (record.status === "FAILED") {
      failed += 1;
    } else if (record.status === "RATE_LIMITED") {
      rateLimited += 1;
    }
  }

  return { failed, rateLimited };
}

// 個人報告以使用者為 stream；目標價通知需加上 watch id，避免不同 watch 互相覆蓋。
function toPersonalDiscordDeliveryStreamKey(record: PersonalDiscordDeliveryHealthRecord): string {
  if (record.kind === "TARGET_PRICE") {
    return `${record.kind}:${record.discordUserId}:${record.targetPriceWatchId ?? record.id}`;
  }

  return `${record.kind}:${record.discordUserId}`;
}
