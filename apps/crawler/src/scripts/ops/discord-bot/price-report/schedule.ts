// apps/crawler/src/scripts/ops/discord-bot/price-report/schedule.ts
// 處理個人價格報告的排程時間、報告時間窗與台北時間顯示格式。

import type { DiscordPriceReportSetting } from "@partsradar/db";
import { DAY_MS, HOUR_MS, SCHEDULED_PRICE_REPORT_RETRY_DELAY_MS } from "../constants";
import { formatTaipeiMinute as formatDiscordTaipeiMinute } from "../message-text";
import type { PriceReportTimeOfDay } from "../types";

const TAIPEI_UTC_OFFSET_MS = 8 * HOUR_MS;

// 計算下一次價格報告發送時間；每日報告使用使用者指定的台北時間。
export function calculateNextSendAt(
  now: Date,
  interval: DiscordPriceReportSetting["interval"],
  timeOfDay: PriceReportTimeOfDay | null = null,
): Date {
  if (interval === "DAILY" && timeOfDay) {
    return calculateNextDailySendAt(now, timeOfDay);
  }

  const intervalMs =
    interval === "EVERY_6H" ? 6 * HOUR_MS : interval === "EVERY_12H" ? 12 * HOUR_MS : DAY_MS;

  return new Date(now.getTime() + intervalMs);
}

// 發送成功時推進到下一個排程時間，發送失敗時使用短 retry delay。
export function calculateNextScheduledPriceReportSendAtAfterDelivery({
  now,
  setting,
  delivered,
}: {
  now: Date;
  setting: Pick<DiscordPriceReportSetting, "interval" | "nextSendAt">;
  delivered: boolean;
}): Date {
  if (delivered) {
    return calculateNextSendAtAfterScheduledRun(now, setting);
  }

  return new Date(now.getTime() + SCHEDULED_PRICE_REPORT_RETRY_DELAY_MS);
}

function calculateNextSendAtAfterScheduledRun(
  now: Date,
  setting: Pick<DiscordPriceReportSetting, "interval" | "nextSendAt">,
): Date {
  const intervalMs =
    setting.interval === "EVERY_6H"
      ? 6 * HOUR_MS
      : setting.interval === "EVERY_12H"
        ? 12 * HOUR_MS
        : DAY_MS;

  if (!setting.nextSendAt) {
    return new Date(now.getTime() + intervalMs);
  }

  let nextSendAt = new Date(setting.nextSendAt.getTime() + intervalMs);

  while (nextSendAt.getTime() <= now.getTime()) {
    nextSendAt = new Date(nextSendAt.getTime() + intervalMs);
  }

  return nextSendAt;
}

function calculateNextDailySendAt(now: Date, timeOfDay: PriceReportTimeOfDay): Date {
  const todaySendAt = createTaipeiDateTimeUtc(now, timeOfDay);

  return todaySendAt.getTime() > now.getTime()
    ? todaySendAt
    : new Date(todaySendAt.getTime() + DAY_MS);
}

function createTaipeiDateTimeUtc(reference: Date, timeOfDay: PriceReportTimeOfDay): Date {
  const taipeiReference = new Date(reference.getTime() + TAIPEI_UTC_OFFSET_MS);

  return new Date(
    Date.UTC(
      taipeiReference.getUTCFullYear(),
      taipeiReference.getUTCMonth(),
      taipeiReference.getUTCDate(),
      timeOfDay.hour,
      timeOfDay.minute,
    ) - TAIPEI_UTC_OFFSET_MS,
  );
}

// 將使用者選擇的小時數轉成 DB 儲存的 report window enum。
export function toPriceReportWindow(windowHours: number): DiscordPriceReportSetting["window"] {
  if (windowHours === 6) {
    return "HOURS_6";
  }

  if (windowHours === 12) {
    return "HOURS_12";
  }

  return "HOURS_24";
}

// 將 DB report window enum 轉回實際查詢使用的小時數。
export function toWindowHours(window: DiscordPriceReportSetting["window"]): number {
  if (window === "HOURS_6") {
    return 6;
  }

  if (window === "HOURS_12") {
    return 12;
  }

  return 24;
}

// 格式化報告統計時間窗標籤，供 Discord 設定面板與訊息使用。
export function formatWindowLabel(window: DiscordPriceReportSetting["window"]): string {
  return `過去 ${toWindowHours(window)} 小時`;
}

// 格式化含日期的台北時間，供下一次排程與 delivery 紀錄顯示。
export function formatTaipeiMinute(value: Date | null): string {
  if (!value) {
    return "尚未排程";
  }

  return formatDiscordTaipeiMinute(value);
}
