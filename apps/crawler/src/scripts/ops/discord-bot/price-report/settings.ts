// apps/crawler/src/scripts/ops/discord-bot/price-report/settings.ts

import type { DiscordPriceReportSetting } from "@partsradar/db";
import { TIME_ZONE } from "../constants";
import type { DiscordBotClient, PriceReportTimeOfDay } from "../types";
import {
  formatPriceReportCategoryFilterLabel,
  formatPriceReportEventFilterLabel,
  formatPriceReportKeywordFilterLabel,
  normalizePriceReportFilters,
  toPriceReportFilters,
  type PriceReportCategoryOption,
} from "./filters";
import { clampPriceReportMaxItems } from "./limits";
import {
  calculateNextSendAt,
  formatTaipeiMinute,
  formatTaipeiTime,
  formatWindowLabel,
  toPriceReportWindow,
} from "./schedule";

export async function enableDailyPriceReport({
  client,
  discordUserId,
  windowHours,
  maxItems,
  categoryIgrps = [],
  productKeyword = null,
  includePriceDrops = true,
  includePriceRises = true,
  includeNewProducts = true,
  timeOfDay = null,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
  timeOfDay?: PriceReportTimeOfDay | null;
  now?: Date;
}): Promise<DiscordPriceReportSetting> {
  const nextSendAt = calculateNextSendAt(now, "DAILY", timeOfDay);
  const filters = normalizePriceReportFilters({
    categoryIgrps,
    productKeyword,
    includePriceDrops,
    includePriceRises,
    includeNewProducts,
  });

  return client.discordPriceReportSetting.upsert({
    where: {
      discordUserId,
    },
    create: {
      discordUserId,
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      maxItems: clampPriceReportMaxItems(maxItems),
      categoryIgrps: filters.categoryIgrps,
      productKeyword: filters.productKeyword,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      enabled: true,
      nextSendAt,
      notificationCursorAt: now,
    },
    update: {
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      maxItems: clampPriceReportMaxItems(maxItems),
      categoryIgrps: filters.categoryIgrps,
      productKeyword: filters.productKeyword,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      enabled: true,
      nextSendAt,
      notificationCursorAt: now,
    },
  });
}

export async function disablePriceReport({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<number> {
  const result = await client.discordPriceReportSetting.updateMany({
    where: {
      discordUserId,
      enabled: true,
    },
    data: {
      enabled: false,
      nextSendAt: null,
    },
  });

  return result.count;
}

export async function readPriceReportSetting({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<DiscordPriceReportSetting | null> {
  return client.discordPriceReportSetting.findUnique({
    where: {
      discordUserId,
    },
  });
}

export function formatPriceReportSettingMessage(
  setting: DiscordPriceReportSetting | null,
  categories: PriceReportCategoryOption[] = [],
): string {
  if (!setting?.enabled) {
    return "尚未開啟每日價格提醒。使用下方按鈕可開啟每日私訊報告。";
  }

  const filters = toPriceReportFilters(setting);
  return [
    "每日價格提醒已開啟。",
    `統計區間：${formatWindowLabel(setting.window)}`,
    `分類：${formatPriceReportCategoryFilterLabel(filters, categories)}`,
    `商品關鍵字：${formatPriceReportKeywordFilterLabel(filters)}`,
    `內容：${formatPriceReportEventFilterLabel(filters)}`,
    `每次最多：${setting.maxItems} 筆`,
    `每日時間：${formatTaipeiTime(setting.nextSendAt)}`,
    `下一次：${formatTaipeiMinute(setting.nextSendAt)}`,
  ].join("\n");
}
