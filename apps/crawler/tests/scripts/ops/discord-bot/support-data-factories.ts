// apps/crawler/tests/scripts/ops/discord-bot/support-data-factories.ts
import type {
  TestCrawlRun,
  TestDiscordNotificationDelivery,
  TestDiscordPublicPriceReportDelivery,
  TestDiscordPublicPriceReportSetting,
  TestPriceReportSetting,
  TestSnapshot,
  TestTargetPriceWatch,
} from "./support-data-types";

export function snapshot({
  id,
  productId,
  productName,
  crawlRunId,
  price,
  capturedAt,
  currency = "TWD",
  categoryIgrp = 12,
  categoryName = "顯示卡",
  vendorSlug = "asus",
  vendorName = "華碩",
}: {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  capturedAt: string;
  currency?: string;
  categoryIgrp?: number;
  categoryName?: string;
  vendorSlug?: string | null;
  vendorName?: string | null;
}): TestSnapshot {
  return {
    id,
    productId,
    productName,
    crawlRunId,
    price,
    currency,
    capturedAt: new Date(capturedAt),
    categoryIgrp,
    categoryName,
    vendorSlug,
    vendorName,
  };
}

export function priceReportSetting({
  id,
  discordUserId,
  nextSendAt,
  lastSentAt = null,
  notificationCursorAt = new Date("2026-06-07T00:00:00.000Z"),
  interval = "DAILY",
  window = "HOURS_24",
  maxItems = 50,
  categoryIgrps = [],
  productKeyword = null,
  includePriceDrops = true,
  includePriceRises = true,
  includeNewProducts = true,
  enabled = true,
}: {
  id: string;
  discordUserId: string;
  nextSendAt: Date | null;
  lastSentAt?: Date | null;
  notificationCursorAt?: Date | null;
  interval?: TestPriceReportSetting["interval"];
  window?: TestPriceReportSetting["window"];
  maxItems?: number;
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
  enabled?: boolean;
}): TestPriceReportSetting {
  return {
    id,
    discordUserId,
    interval,
    window,
    scope: "ALL",
    timezone: "Asia/Taipei",
    maxItems,
    categoryIgrps,
    productKeyword,
    includePriceDrops,
    includePriceRises,
    includeNewProducts,
    enabled,
    nextSendAt,
    lastSentAt,
    notificationCursorAt,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date("2026-06-07T00:00:00.000Z"),
  };
}

export function targetPriceWatch({
  id,
  discordUserId,
  productId,
  targetPrice,
  currency = "TWD",
  enabled = true,
  lastNotifiedAt = null,
  notificationClaimedAt = null,
  notificationCursorAt = new Date("2026-06-07T00:00:00.000Z"),
  updatedAt = new Date("2026-06-07T00:00:00.000Z"),
}: {
  id: string;
  discordUserId: string;
  productId: string;
  targetPrice: number;
  currency?: string;
  enabled?: boolean;
  lastNotifiedAt?: Date | null;
  notificationClaimedAt?: Date | null;
  notificationCursorAt?: Date | null;
  updatedAt?: Date;
}): TestTargetPriceWatch {
  return {
    id,
    discordUserId,
    productId,
    targetPrice,
    currency,
    enabled,
    lastNotifiedAt,
    notificationClaimedAt,
    notificationCursorAt,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt,
  };
}

export function notificationDelivery({
  id,
  discordUserId,
  kind,
  status = "SENT",
  productId = null,
  targetPriceWatchId = null,
  dedupeKey = null,
  itemCount = 0,
  messageCount = 0,
  deliveredAt = null,
  errorMessage = null,
  createdAt = new Date("2026-06-07T00:00:00.000Z"),
}: {
  id: string;
  discordUserId: string;
  kind: TestDiscordNotificationDelivery["kind"];
  status?: TestDiscordNotificationDelivery["status"];
  productId?: string | null;
  targetPriceWatchId?: string | null;
  dedupeKey?: string | null;
  itemCount?: number;
  messageCount?: number;
  deliveredAt?: Date | null;
  errorMessage?: string | null;
  createdAt?: Date;
}): TestDiscordNotificationDelivery {
  return {
    id,
    discordUserId,
    kind,
    status,
    productId,
    targetPriceWatchId,
    dedupeKey,
    itemCount,
    messageCount,
    deliveredAt,
    errorMessage,
    createdAt,
  };
}

export function publicPriceReportDelivery({
  id,
  crawlRunId,
  channelId,
  status = "SENT",
  itemCount = 0,
  messageCount = 0,
  deliveredAt = null,
  errorMessage = null,
  createdAt = new Date("2026-06-07T00:00:00.000Z"),
  updatedAt = new Date("2026-06-07T00:00:00.000Z"),
}: {
  id: string;
  crawlRunId: string;
  channelId: string;
  status?: TestDiscordPublicPriceReportDelivery["status"];
  itemCount?: number;
  messageCount?: number;
  deliveredAt?: Date | null;
  errorMessage?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}): TestDiscordPublicPriceReportDelivery {
  return {
    id,
    crawlRunId,
    channelId,
    status,
    itemCount,
    messageCount,
    deliveredAt,
    errorMessage,
    createdAt,
    updatedAt,
  };
}

export function publicPriceReportSetting({
  id,
  discordGuildId = "guild-1",
  channelId = "999988887777666655",
  maxItems = 50,
  categoryIgrps = [],
  productKeyword = null,
  includePriceDrops = true,
  includePriceRises = true,
  includeNewProducts = false,
  enabled = true,
  notificationCursorAt = new Date("2026-06-07T00:00:00.000Z"),
  createdByDiscordUserId = "111122223333444455",
  updatedByDiscordUserId = "111122223333444455",
  createdAt = new Date("2026-06-07T00:00:00.000Z"),
  updatedAt = new Date("2026-06-07T00:00:00.000Z"),
}: {
  id: string;
  discordGuildId?: string;
  channelId?: string;
  maxItems?: number;
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
  enabled?: boolean;
  notificationCursorAt?: Date | null;
  createdByDiscordUserId?: string;
  updatedByDiscordUserId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}): TestDiscordPublicPriceReportSetting {
  return {
    id,
    discordGuildId,
    channelId,
    maxItems,
    categoryIgrps,
    productKeyword,
    includePriceDrops,
    includePriceRises,
    includeNewProducts,
    enabled,
    notificationCursorAt,
    createdByDiscordUserId,
    updatedByDiscordUserId,
    createdAt,
    updatedAt,
  };
}

export function crawlRun({
  id,
  status = "SUCCESS_CHANGED",
  triggerType = "SCHEDULED",
  finishedAt = new Date("2026-06-07T03:05:00.000Z"),
}: {
  id: string;
  status?: TestCrawlRun["status"];
  triggerType?: TestCrawlRun["triggerType"];
  finishedAt?: Date | null;
}): TestCrawlRun {
  return {
    id,
    status,
    triggerType,
    finishedAt,
  };
}
