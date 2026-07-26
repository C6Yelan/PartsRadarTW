// apps/crawler/src/scripts/ops/discord-bot/public-price-report/settings.ts
// 管理 Discord 伺服器公開價格報告設定，包含頻道、啟停、篩選與清除。

import type { Prisma } from "@partsradar/db";
import { normalizePriceReportFilters, toPriceReportFilters } from "../price-report/filters";
import type { DiscordBotClient } from "../types";

// 公開報告設定讀取時固定使用的欄位集合，供設定面板與排程共用。
export const PUBLIC_PRICE_REPORT_SETTING_SELECT = {
  id: true,
  discordGuildId: true,
  channelId: true,
  categoryIgrps: true,
  productKeyword: true,
  includePriceDrops: true,
  includePriceRises: true,
  includeNewProducts: true,
  enabled: true,
  accessStatus: true,
  disabledAt: true,
  purgeAfter: true,
  lastDiscordErrorCode: true,
  lastAccessCheckedAt: true,
  consecutiveAccessFailures: true,
  retryNotBefore: true,
  notificationCursorAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.DiscordPublicPriceReportSettingSelect;

export type PublicPriceReportSetting = Prisma.DiscordPublicPriceReportSettingGetPayload<{
  select: typeof PUBLIC_PRICE_REPORT_SETTING_SELECT;
}>;

// 讀取單一 Discord 伺服器目前的公開價格報告設定。
export async function readPublicPriceReportSetting({
  client,
  discordGuildId,
}: {
  client: DiscordBotClient;
  discordGuildId: string;
}): Promise<PublicPriceReportSetting | null> {
  return client.discordPublicPriceReportSetting.findUnique({
    where: {
      discordGuildId,
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
  });
}

// 設定公開報告發送頻道並啟用報告，同時重設 notification cursor 避免補發舊輪次。
export async function setPublicPriceReportChannel({
  client,
  discordGuildId,
  channelId,
  discordUserId,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordGuildId: string;
  channelId: string;
  discordUserId: string;
  now?: Date;
}): Promise<PublicPriceReportSetting> {
  return client.discordPublicPriceReportSetting.upsert({
    where: {
      discordGuildId,
    },
    create: {
      discordGuildId,
      channelId,
      enabled: true,
      accessStatus: "ACTIVE",
      disabledAt: null,
      purgeAfter: null,
      lastDiscordErrorCode: null,
      lastAccessCheckedAt: now,
      consecutiveAccessFailures: 0,
      retryNotBefore: null,
      notificationCursorAt: now,
      createdByDiscordUserId: discordUserId,
      updatedByDiscordUserId: discordUserId,
    },
    update: {
      channelId,
      enabled: true,
      accessStatus: "ACTIVE",
      disabledAt: null,
      purgeAfter: null,
      lastDiscordErrorCode: null,
      lastAccessCheckedAt: now,
      consecutiveAccessFailures: 0,
      retryNotBefore: null,
      notificationCursorAt: now,
      updatedByDiscordUserId: discordUserId,
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
  });
}

// 啟用或停用公開價格報告；重新啟用時從當下開始追蹤後續 crawl run。
export async function setPublicPriceReportEnabled({
  client,
  discordGuildId,
  channelId,
  discordUserId,
  enabled,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordGuildId: string;
  channelId: string;
  discordUserId: string;
  enabled: boolean;
  now?: Date;
}): Promise<PublicPriceReportSetting> {
  const current = await readPublicPriceReportSetting({ client, discordGuildId });

  if (!current) {
    return client.discordPublicPriceReportSetting.upsert({
      where: {
        discordGuildId,
      },
      create: {
        discordGuildId,
        channelId,
        enabled,
        accessStatus: "ACTIVE",
        disabledAt: null,
        purgeAfter: null,
        lastDiscordErrorCode: null,
        lastAccessCheckedAt: enabled ? now : null,
        consecutiveAccessFailures: 0,
        retryNotBefore: null,
        notificationCursorAt: enabled ? now : null,
        createdByDiscordUserId: discordUserId,
        updatedByDiscordUserId: discordUserId,
      },
      update: {
        enabled,
        ...(enabled
          ? {
              accessStatus: "ACTIVE" as const,
              disabledAt: null,
              purgeAfter: null,
              lastDiscordErrorCode: null,
              lastAccessCheckedAt: now,
              consecutiveAccessFailures: 0,
              retryNotBefore: null,
              notificationCursorAt: now,
            }
          : {}),
        updatedByDiscordUserId: discordUserId,
      },
      select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
    });
  }

  return client.discordPublicPriceReportSetting.update({
    where: {
      discordGuildId,
    },
    data: {
      enabled,
      ...(enabled
        ? {
            accessStatus: "ACTIVE" as const,
            disabledAt: null,
            purgeAfter: null,
            lastDiscordErrorCode: null,
            lastAccessCheckedAt: now,
            consecutiveAccessFailures: 0,
            retryNotBefore: null,
            notificationCursorAt: now,
          }
        : {}),
      updatedByDiscordUserId: discordUserId,
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
  });
}

// 更新公開價格報告篩選條件，並重設 notification cursor。
export async function updatePublicPriceReportFilters({
  client,
  discordGuildId,
  discordUserId,
  categoryIgrps,
  productKeyword,
  includePriceDrops,
  includePriceRises,
  includeNewProducts,
  now = new Date(),
}: {
  client: DiscordBotClient;
  discordGuildId: string;
  discordUserId: string;
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
  now?: Date;
}): Promise<PublicPriceReportSetting | null> {
  const current = await readPublicPriceReportSetting({ client, discordGuildId });

  if (!current) {
    return null;
  }

  const currentFilters = toPriceReportFilters(current);
  const filters = normalizePriceReportFilters({
    ...currentFilters,
    categoryIgrps: categoryIgrps ?? currentFilters.categoryIgrps,
    productKeyword: productKeyword === undefined ? currentFilters.productKeyword : productKeyword,
    includePriceDrops: includePriceDrops ?? currentFilters.includePriceDrops,
    includePriceRises: includePriceRises ?? currentFilters.includePriceRises,
    includeNewProducts: includeNewProducts ?? currentFilters.includeNewProducts,
  });

  return client.discordPublicPriceReportSetting.update({
    where: {
      discordGuildId,
    },
    data: {
      categoryIgrps: filters.categoryIgrps,
      productKeyword: filters.productKeyword,
      includePriceDrops: filters.includePriceDrops,
      includePriceRises: filters.includePriceRises,
      includeNewProducts: filters.includeNewProducts,
      notificationCursorAt: now,
      updatedByDiscordUserId: discordUserId,
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
  });
}

// 清除 Discord 伺服器的公開價格報告設定。
export async function clearPublicPriceReportSetting({
  client,
  discordGuildId,
}: {
  client: DiscordBotClient;
  discordGuildId: string;
}): Promise<number> {
  const result = await client.discordPublicPriceReportSetting.deleteMany({
    where: {
      discordGuildId,
    },
  });

  return result.count;
}
