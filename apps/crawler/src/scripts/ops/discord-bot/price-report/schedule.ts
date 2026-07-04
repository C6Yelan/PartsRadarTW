// apps/crawler/src/scripts/ops/discord-bot/price-report/schedule.ts
import type { DiscordPriceReportSetting } from "@partsradar/db";

import {
  DAY_MS,
  HOUR_MS,
  SCHEDULED_PRICE_REPORT_RETRY_DELAY_MS,
  TIME_ZONE,
} from "../constants";
import type { PriceReportTimeOfDay } from "../types";

const TAIPEI_UTC_OFFSET_MS = 8 * HOUR_MS;

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

export function toPriceReportWindow(windowHours: number): DiscordPriceReportSetting["window"] {
  if (windowHours === 6) {
    return "HOURS_6";
  }

  if (windowHours === 12) {
    return "HOURS_12";
  }

  return "HOURS_24";
}

export function toWindowHours(window: DiscordPriceReportSetting["window"]): number {
  if (window === "HOURS_6") {
    return 6;
  }

  if (window === "HOURS_12") {
    return 12;
  }

  return 24;
}

export function formatWindowLabel(window: DiscordPriceReportSetting["window"]): string {
  return `過去 ${toWindowHours(window)} 小時`;
}

export function formatTaipeiMinute(value: Date | null): string {
  if (!value) {
    return "尚未排程";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("month")}/${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

export function formatTaipeiTime(value: Date | null): string {
  if (!value) {
    return "尚未排程";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}
