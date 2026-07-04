// apps/crawler/src/scripts/ops/production-smoke/checks/discord-deliveries.ts
import { MILLISECONDS_PER_HOUR } from "../constants";
import { ok, warn } from "../results";
import type { ProductionSmokeClient, ProductionSmokeOptions, SmokeCheckResult } from "../types";

const DISCORD_DELIVERY_HEALTH_SCAN_LIMIT = 500;

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

function compareDiscordDeliveryHealthRecordsDesc(
  left: DiscordDeliveryHealthRecord,
  right: DiscordDeliveryHealthRecord,
): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

function toDiscordDeliveryStreamKey(record: DiscordDeliveryHealthRecord): string {
  if (record.kind === "TARGET_PRICE") {
    return `${record.kind}:${record.discordUserId}:${record.targetPriceWatchId ?? record.id}`;
  }

  return `${record.kind}:${record.discordUserId}`;
}
