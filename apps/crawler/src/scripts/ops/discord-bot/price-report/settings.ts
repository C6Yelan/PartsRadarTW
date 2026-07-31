// apps/crawler/src/scripts/ops/discord-bot/price-report/settings.ts
// 管理 Discord 使用者的個人每日價格報告設定，包含啟用、停用與讀取。

import type { Prisma } from "@partsradar/db";
import { TIME_ZONE } from "../constants";
import type { DiscordBotClient, PriceReportTimeOfDay } from "../types";
import { normalizePriceReportFilters } from "./filters";
import { calculateNextSendAt, toPriceReportWindow } from "./schedule";

// 個人報告 runtime read model；legacy max_items 欄位保留於 DB，但不再讀取或寫入。
export const PRICE_REPORT_SETTING_SELECT = {
  id: true,
  discordUserId: true,
  interval: true,
  window: true,
  scope: true,
  timezone: true,
  categoryIgrps: true,
  productKeyword: true,
  includePriceDrops: true,
  includePriceRises: true,
  includeNewProducts: true,
  enabled: true,
  deliveryState: true,
  consecutiveDeliveryFailures: true,
  deliveryClaimedAt: true,
  disabledAt: true,
  nextSendAt: true,
  lastSentAt: true,
  notificationCursorAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.DiscordPriceReportSettingSelect;

export type PriceReportSetting = Prisma.DiscordPriceReportSettingGetPayload<{
  select: typeof PRICE_REPORT_SETTING_SELECT;
}>;

// 建立或更新使用者每日私訊價格報告設定，並重設下一次發送時間與通知 cursor。
export async function enableDailyScheduledPriceReport({
  client,
  discordUserId,
  windowHours,
  categoryIgrps = [],
  productKeyword = null,
  includePriceDrops = true,
  includePriceRises = true,
  includeNewProducts = false,
  timeOfDay = null,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
  timeOfDay?: PriceReportTimeOfDay | null;
  now?: Date;
}): Promise<PriceReportSetting> {
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
      categoryIgrps: filters.categoryIgrps,
      productKeyword: filters.productKeyword,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      enabled: true,
      deliveryState: "ACTIVE",
      consecutiveDeliveryFailures: 0,
      deliveryClaimedAt: null,
      disabledAt: null,
      nextSendAt,
      notificationCursorAt: now,
    },
    update: {
      interval: "DAILY",
      window: toPriceReportWindow(windowHours),
      scope: "ALL",
      timezone: TIME_ZONE,
      categoryIgrps: filters.categoryIgrps,
      productKeyword: filters.productKeyword,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      enabled: true,
      deliveryState: "ACTIVE",
      consecutiveDeliveryFailures: 0,
      deliveryClaimedAt: null,
      disabledAt: null,
      nextSendAt,
      notificationCursorAt: now,
    },
    select: PRICE_REPORT_SETTING_SELECT,
  });
}

// 停用使用者的每日私訊價格報告，保留既有設定內容供日後重新啟用。
export async function disablePriceReport({
  client,
  discordUserId,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordUserId: string;
  now?: Date;
}): Promise<number> {
  const result = await client.discordPriceReportSetting.updateMany({
    where: {
      discordUserId,
      enabled: true,
    },
    data: {
      enabled: false,
      disabledAt: now,
      nextSendAt: null,
      deliveryClaimedAt: null,
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
}): Promise<PriceReportSetting | null> {
  return client.discordPriceReportSetting.findUnique({
    where: {
      discordUserId,
    },
    select: PRICE_REPORT_SETTING_SELECT,
  });
}
