// apps/crawler/src/scripts/ops/discord-bot/public-price-report/settings.ts

import type { Prisma } from "@partsradar/db";
import type { DiscordBotClient } from "../types";
import {
  clampPublicPriceReportMaxItems,
  normalizePublicPriceReportFilters,
  toPublicPriceReportFilters,
} from "./filters";

export const PUBLIC_PRICE_REPORT_SETTING_SELECT = {
  id: true,
  discordGuildId: true,
  channelId: true,
  maxItems: true,
  categoryIgrps: true,
  productKeyword: true,
  includePriceDrops: true,
  includePriceRises: true,
  includeNewProducts: true,
  enabled: true,
  notificationCursorAt: true,
  createdByDiscordUserId: true,
  updatedByDiscordUserId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.DiscordPublicPriceReportSettingSelect;

export type PublicPriceReportSetting = Prisma.DiscordPublicPriceReportSettingGetPayload<{
  select: typeof PUBLIC_PRICE_REPORT_SETTING_SELECT;
}>;

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
      notificationCursorAt: now,
      createdByDiscordUserId: discordUserId,
      updatedByDiscordUserId: discordUserId,
    },
    update: {
      channelId,
      enabled: true,
      notificationCursorAt: now,
      updatedByDiscordUserId: discordUserId,
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
  });
}

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
        notificationCursorAt: enabled ? now : null,
        createdByDiscordUserId: discordUserId,
        updatedByDiscordUserId: discordUserId,
      },
      update: {
        enabled,
        ...(enabled ? { notificationCursorAt: now } : {}),
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
      ...(enabled ? { notificationCursorAt: now } : {}),
      updatedByDiscordUserId: discordUserId,
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
  });
}

export async function updatePublicPriceReportFilters({
  client,
  discordGuildId,
  discordUserId,
  maxItems,
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
  maxItems?: number;
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

  const currentFilters = toPublicPriceReportFilters(current);
  const filters = normalizePublicPriceReportFilters({
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
      maxItems: clampPublicPriceReportMaxItems(maxItems ?? current.maxItems),
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
