// apps/crawler/src/scripts/ops/production-smoke/checks/discord-deliveries.ts
// 檢查近期 Discord bot delivery 的最新失敗與 rate limit 狀態。

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
  const { failed: failedCount, rateLimited: rateLimitedCount } =
    summarizeLatestDiscordDeliveryStatuses(
      await client.discordNotificationDelivery.findMany({
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
    );
  const message = `failed=${failedCount} rateLimited=${rateLimitedCount} in ${options.recentWindowHours}h`;

  return failedCount + rateLimitedCount > 0
    ? warn("discord bot deliveries", message)
    : ok("discord bot deliveries", message);
}

interface DiscordDeliveryHealthRecord {
  id: string;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE";
  status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
  targetPriceWatchId: string | null;
  createdAt: Date;
}

// 將近期 delivery 依通知 stream 去重後，彙整仍處於 failed / rate limited 的最新狀態數。
function summarizeLatestDiscordDeliveryStatuses(records: DiscordDeliveryHealthRecord[]): {
  failed: number;
  rateLimited: number;
} {
  const latestByStream = new Map<string, DiscordDeliveryHealthRecord>();

  for (const record of [...records].sort(compareDiscordDeliveryHealthRecordsDesc)) {
    const key = toDiscordDeliveryStreamKey(record);

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

// 依 createdAt 與 id 由新到舊排序，讓同時間建立的 delivery 也有穩定最新判定。
function compareDiscordDeliveryHealthRecordsDesc(
  left: DiscordDeliveryHealthRecord,
  right: DiscordDeliveryHealthRecord,
): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

// 個人報告以使用者為 stream；目標價通知需加上 watch id，避免不同 watch 互相覆蓋。
function toDiscordDeliveryStreamKey(record: DiscordDeliveryHealthRecord): string {
  if (record.kind === "TARGET_PRICE") {
    return `${record.kind}:${record.discordUserId}:${record.targetPriceWatchId ?? record.id}`;
  }

  return `${record.kind}:${record.discordUserId}`;
}
