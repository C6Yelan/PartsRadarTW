// apps/crawler/src/scripts/ops/discord-bot/price-report/settings.ts
// 管理 Discord 使用者的個人每日價格報告設定，包含啟用、停用、讀取與摘要文字。

import type { DiscordPriceReportSetting } from "@partsradar/db";
import { TIME_ZONE } from "../constants";
import type { DiscordBotClient, PriceReportTimeOfDay } from "../types";
import {
  formatPriceReportCategoryFilterLabel,
  formatPriceReportContentFilterLabel,
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

// 建立或更新使用者每日私訊價格報告設定，並重設下一次發送時間與通知 cursor。
export async function enableDailyScheduledPriceReport({
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

// 停用使用者的每日私訊價格報告，保留既有設定內容供日後重新啟用。
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

// 讀取使用者目前的個人價格報告設定。
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

// 格式化設定摘要文字，供舊版文字入口或測試檢查設定狀態。
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
    `內容：${formatPriceReportContentFilterLabel(filters)}`,
    `每次最多：${setting.maxItems} 筆`,
    `每日時間：${formatTaipeiTime(setting.nextSendAt)}`,
    `下一次：${formatTaipeiMinute(setting.nextSendAt)}`,
  ].join("\n");
}
