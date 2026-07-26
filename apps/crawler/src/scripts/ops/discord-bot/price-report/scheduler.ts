// apps/crawler/src/scripts/ops/discord-bot/price-report/scheduler.ts
// 執行到期的個人每日價格報告發送，並計算 Discord bot daemon 的下一次喚醒時間。

import { HOUR_MS, MAX_DUE_PRICE_REPORT_SETTINGS_PER_CYCLE } from "../constants";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordMessageSendResult,
  DiscordBotOptions,
} from "../types";
import { sendPriceReport } from "./delivery";
import { toPriceReportFilters } from "./filters";
import { calculateNextScheduledPriceReportSendAtAfterDelivery, toWindowHours } from "./schedule";
import { PRICE_REPORT_SETTING_SELECT } from "./settings";

// 單輪個人價格報告排程處理摘要，供 daemon log 與維運觀察使用。
export interface ScheduledPriceReportSummary {
  processedCount: number;
  sentCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

// 發送所有已到期且啟用的個人價格報告，並更新成功、失敗或限流後的下一次排程時間。
export async function sendDueScheduledPriceReports({
  client,
  options,
  now = new Date(),
  sendDirectMessages,
}: {
  client: DiscordBotClient;
  options: Pick<DiscordBotOptions, "publicBaseUrl">;
  now?: Date;
  sendDirectMessages: (
    discordUserId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordMessageSendResult>;
}): Promise<ScheduledPriceReportSummary> {
  const settings = await client.discordPriceReportSetting.findMany({
    where: {
      enabled: true,
      nextSendAt: {
        lte: now,
      },
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
  };

  for (const setting of settings) {
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
      sendReportMessages: (messages) => sendDirectMessages(setting.discordUserId, messages),
    });

    if (result.status === "sent") {
      summary.sentCount += 1;
    } else if (result.status === "rate_limited") {
      summary.rateLimitedCount += 1;
    } else {
      summary.failedCount += 1;
    }

    await client.discordPriceReportSetting.update({
      where: {
        id: setting.id,
      },
      data: {
        lastSentAt: result.status === "sent" ? now : setting.lastSentAt,
        ...(result.status === "sent" ? { notificationCursorAt: now } : {}),
        nextSendAt: calculateNextScheduledPriceReportSendAtAfterDelivery({
          now,
          setting,
          delivered: result.status === "sent",
        }),
      },
    });
  }

  return summary;
}

// 讀取目前最早到期的個人價格報告時間，供 daemon 決定 sleep 間隔。
export async function readNextScheduledPriceReportDueAt({
  client,
}: {
  client: DiscordBotClient;
}): Promise<Date | null> {
  const setting = await client.discordPriceReportSetting.findFirst({
    where: {
      enabled: true,
      nextSendAt: {
        not: null,
      },
    },
    select: {
      nextSendAt: true,
    },
    orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
  });

  return setting?.nextSendAt ?? null;
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
