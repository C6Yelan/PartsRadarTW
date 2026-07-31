// apps/crawler/src/scripts/ops/discord-bot/price-report/scheduler.ts
// 執行到期的個人每日價格報告發送，並計算 Discord bot daemon 的下一次喚醒時間。

import {
  HOUR_MS,
  MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE,
  SCHEDULED_PRICE_REPORT_CLAIM_LEASE_MS,
} from "../constants";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordMessageSendResult,
  DiscordBotOptions,
} from "../types";
import { recordPriceReportDelivery, sendPriceReport } from "./delivery";
import { toPriceReportFilters } from "./filters";
import { resolveScheduledPriceReportFailure } from "./retry-policy";
import { calculateNextSendAtAfterScheduledRun, toWindowHours } from "./schedule";
import { PRICE_REPORT_SETTING_SELECT, type PriceReportSetting } from "./settings";

// 單輪個人價格報告排程處理摘要，供 daemon log 與維運觀察使用。
export interface ScheduledPriceReportSummary {
  processedCount: number;
  sentCount: number;
  rateLimitedCount: number;
  failedCount: number;
  retryScheduledCount: number;
  pausedPermanentCount: number;
  pausedRetryExhaustedCount: number;
  pausedPartialDeliveryCount: number;
}

// 發送所有已到期且啟用的個人價格報告，並更新成功、失敗或限流後的下一次排程時間。
export async function sendDueScheduledPriceReports({
  client,
  options,
  now = new Date(),
  sendDirectMessages,
  random = Math.random,
}: {
  client: DiscordBotClient;
  options: Pick<DiscordBotOptions, "publicBaseUrl">;
  now?: Date;
  sendDirectMessages: (
    discordUserId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordMessageSendResult>;
  random?: () => number;
}): Promise<ScheduledPriceReportSummary> {
  const staleClaimBefore = new Date(now.getTime() - SCHEDULED_PRICE_REPORT_CLAIM_LEASE_MS);
  const settings = await client.discordPriceReportSetting.findMany({
    where: {
      enabled: true,
      deliveryState: "ACTIVE",
      nextSendAt: {
        lte: now,
      },
      OR: [{ deliveryClaimedAt: null }, { deliveryClaimedAt: { lte: staleClaimBefore } }],
    },
    orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    take: MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE,
    select: PRICE_REPORT_SETTING_SELECT,
  });
  const summary: ScheduledPriceReportSummary = {
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
    retryScheduledCount: 0,
    pausedPermanentCount: 0,
    pausedRetryExhaustedCount: 0,
    pausedPartialDeliveryCount: 0,
  };

  for (const setting of settings) {
    const claimed = await client.discordPriceReportSetting.updateMany({
      where: {
        id: setting.id,
        discordUserId: setting.discordUserId,
        enabled: true,
        deliveryState: "ACTIVE",
        nextSendAt: { lte: now },
        OR: [{ deliveryClaimedAt: null }, { deliveryClaimedAt: { lte: staleClaimBefore } }],
      },
      data: {
        deliveryClaimedAt: now,
      },
    });

    if (claimed.count !== 1) {
      continue;
    }

    summary.processedCount += 1;

    const result = await sendPriceReport({
      client,
      discordUserId: setting.discordUserId,
      windowHours: toWindowHours(setting.window),
      publicBaseUrl: options.publicBaseUrl,
      filters: toPriceReportFilters(setting),
      now,
      since: resolvePriceReportSince({
        now,
        windowHours: toWindowHours(setting.window),
        cursorAt: setting.notificationCursorAt ?? setting.createdAt,
      }),
      deliveryKind: "SCHEDULED_PRICE_REPORT",
      priceReportSettingId: setting.id,
      shouldSend: async () =>
        Boolean(
          await client.discordPriceReportSetting.findFirst({
            where: {
              id: setting.id,
              discordUserId: setting.discordUserId,
              enabled: true,
              deliveryState: "ACTIVE",
              deliveryClaimedAt: now,
            },
            select: { id: true },
          }),
        ),
      sendReportMessages: (messages) => sendDirectMessages(setting.discordUserId, messages),
      recordDelivery: false,
    });

    if (result.status === "cancelled") {
      await releaseScheduledPriceReportClaim({ client, settingId: setting.id, claimedAt: now });
      continue;
    }

    if (result.status === "sent") {
      const persisted = await persistScheduledPriceReportOutcome({
        client,
        setting,
        claimedAt: now,
        result,
        stateData: {
          lastSentAt: now,
          notificationCursorAt: now,
          nextSendAt: calculateNextSendAtAfterScheduledRun(now, setting),
          deliveryState: "ACTIVE",
          consecutiveDeliveryFailures: 0,
          deliveryClaimedAt: null,
        },
      });
      if (!persisted) {
        continue;
      }
      summary.sentCount += 1;
      continue;
    }

    const disposition = resolveScheduledPriceReportFailure({
      result,
      previousFailureCount: setting.consecutiveDeliveryFailures,
      now,
      random,
    });
    const persisted = await persistScheduledPriceReportOutcome({
      client,
      setting,
      claimedAt: now,
      result,
      stateData: {
        deliveryState: disposition.deliveryState,
        consecutiveDeliveryFailures: disposition.consecutiveDeliveryFailures,
        deliveryClaimedAt: null,
        nextSendAt: disposition.nextSendAt,
        ...(disposition.outcome === "retry_scheduled"
          ? {}
          : {
              enabled: false,
              disabledAt: now,
            }),
      },
    });
    if (!persisted) {
      continue;
    }

    if (result.status === "rate_limited") {
      summary.rateLimitedCount += 1;
    } else {
      summary.failedCount += 1;
    }

    if (disposition.outcome === "retry_scheduled") {
      summary.retryScheduledCount += 1;
    } else if (disposition.outcome === "paused_permanent") {
      summary.pausedPermanentCount += 1;
    } else if (disposition.outcome === "paused_retry_exhausted") {
      summary.pausedRetryExhaustedCount += 1;
    } else {
      summary.pausedPartialDeliveryCount += 1;
    }
  }

  return summary;
}

async function persistScheduledPriceReportOutcome({
  client,
  setting,
  claimedAt,
  result,
  stateData,
}: {
  client: DiscordBotClient;
  setting: PriceReportSetting;
  claimedAt: Date;
  result: Exclude<Awaited<ReturnType<typeof sendPriceReport>>, { status: "cancelled" }>;
  stateData: Parameters<DiscordBotClient["discordPriceReportSetting"]["updateMany"]>[0]["data"];
}): Promise<boolean> {
  try {
    return await client.$transaction(async (transaction) => {
      const recorded = await recordPriceReportDelivery({
        client: transaction,
        discordUserId: setting.discordUserId,
        kind: "SCHEDULED_PRICE_REPORT",
        status: result.status,
        itemCount: result.listedCount,
        messageCount: result.messageCount,
        deliveredAt: result.status === "sent" ? claimedAt : null,
        priceReportSettingId: setting.id,
        result,
      });
      if (!recorded) {
        throw new ScheduledPriceReportClaimLostError();
      }

      const updated = await transaction.discordPriceReportSetting.updateMany({
        where: claimedSettingWhere(setting.id, setting.discordUserId, claimedAt),
        data: stateData,
      });
      if (updated.count !== 1) {
        throw new ScheduledPriceReportClaimLostError();
      }

      return true;
    });
  } catch (error) {
    if (error instanceof ScheduledPriceReportClaimLostError) {
      return false;
    }
    throw error;
  }
}

class ScheduledPriceReportClaimLostError extends Error {}

// 讀取最早可處理排程或有效 claim 的 lease 到期時間，供 daemon 決定 sleep 間隔。
export async function readNextScheduledPriceReportDueAt({
  client,
  now = new Date(),
}: {
  client: DiscordBotClient;
  now?: Date;
}): Promise<Date | null> {
  const staleClaimBefore = new Date(now.getTime() - SCHEDULED_PRICE_REPORT_CLAIM_LEASE_MS);
  const [eligibleSetting, claimedSetting] = await Promise.all([
    client.discordPriceReportSetting.findFirst({
      where: {
        enabled: true,
        deliveryState: "ACTIVE",
        nextSendAt: {
          not: null,
        },
        OR: [{ deliveryClaimedAt: null }, { deliveryClaimedAt: { lte: staleClaimBefore } }],
      },
      select: {
        nextSendAt: true,
      },
      orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    }),
    client.discordPriceReportSetting.findFirst({
      where: {
        enabled: true,
        deliveryState: "ACTIVE",
        nextSendAt: {
          lte: now,
        },
        deliveryClaimedAt: {
          gt: staleClaimBefore,
        },
      },
      select: {
        deliveryClaimedAt: true,
      },
      orderBy: [{ deliveryClaimedAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const eligibleAt = eligibleSetting?.nextSendAt ?? null;
  const claimExpiresAt = claimedSetting?.deliveryClaimedAt
    ? new Date(claimedSetting.deliveryClaimedAt.getTime() + SCHEDULED_PRICE_REPORT_CLAIM_LEASE_MS)
    : null;

  if (!eligibleAt) {
    return claimExpiresAt;
  }
  if (!claimExpiresAt) {
    return eligibleAt;
  }

  return eligibleAt.getTime() <= claimExpiresAt.getTime() ? eligibleAt : claimExpiresAt;
}

function claimedSettingWhere(settingId: string, discordUserId: string, claimedAt: Date) {
  return {
    id: settingId,
    discordUserId,
    enabled: true,
    deliveryState: "ACTIVE" as const,
    deliveryClaimedAt: claimedAt,
  };
}

async function releaseScheduledPriceReportClaim({
  client,
  settingId,
  claimedAt,
}: {
  client: DiscordBotClient;
  settingId: string;
  claimedAt: Date;
}): Promise<void> {
  await client.discordPriceReportSetting.updateMany({
    where: {
      id: settingId,
      enabled: true,
      deliveryState: "ACTIVE",
      deliveryClaimedAt: claimedAt,
    },
    data: {
      deliveryClaimedAt: null,
    },
  });
}

// 根據下一筆到期時間計算 daemon sleep；沒有到期項目時回到最大 sleep。
export function calculateScheduledPriceReportSleepMs({
  now,
  nextDueAt,
  maxSleepMs,
  minSleepMs = 1000,
}: {
  now: Date;
  nextDueAt: Date | null;
  maxSleepMs: number;
  minSleepMs?: number;
}): number {
  if (!nextDueAt) {
    return maxSleepMs;
  }

  const dueInMs = nextDueAt.getTime() - now.getTime();

  return Math.min(maxSleepMs, Math.max(minSleepMs, dueInMs));
}

function resolvePriceReportSince({
  now,
  windowHours,
  cursorAt,
}: {
  now: Date;
  windowHours: number;
  cursorAt: Date | null;
}): Date {
  const windowStart = new Date(now.getTime() - windowHours * HOUR_MS);

  if (!cursorAt || cursorAt.getTime() <= windowStart.getTime()) {
    return windowStart;
  }

  return cursorAt;
}
