// apps/crawler/src/scripts/ops/discord-bot/public-price-report.ts

import type { Prisma } from "@partsradar/db";
import { CRAWL_RUN_STATUSES } from "../../../coolpc/crawl-run";
import {
  readCrawlRunPriceChangeSummary,
  readRecentPriceReport,
} from "../price-change-discord-notification";
import {
  HOUR_MS,
  MAX_DUE_PUBLIC_PRICE_REPORTS_PER_CYCLE,
  MAX_DUE_PUBLIC_PRICE_REPORT_SETTINGS_PER_CYCLE,
  MAX_PRICE_REPORT_ITEMS,
} from "./constants";
import {
  createPublicPriceReportMessages,
  filterNewProductsForReport,
  filterPriceChangesForReport,
  normalizePriceReportFilters,
  type PriceReportFilters,
} from "./price-report";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordBotOptions,
} from "./types";

export interface PublicPriceReportSummary {
  settingCount: number;
  processedCount: number;
  sentCount: number;
  skippedCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

type PublicPriceReportStatus = "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";

const PUBLIC_PRICE_REPORT_SETTING_SELECT = {
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

const PUBLIC_PRICE_REPORT_DELIVERY_STATUS_SELECT = {
  status: true,
  itemCount: true,
  messageCount: true,
  errorMessage: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.DiscordPublicPriceReportDeliverySelect;

export type PublicPriceReportSetting = Prisma.DiscordPublicPriceReportSettingGetPayload<{
  select: typeof PUBLIC_PRICE_REPORT_SETTING_SELECT;
}>;

export type PublicPriceReportDeliveryStatus = Prisma.DiscordPublicPriceReportDeliveryGetPayload<{
  select: typeof PUBLIC_PRICE_REPORT_DELIVERY_STATUS_SELECT;
}>;

const DEFAULT_PUBLIC_PRICE_REPORT_FILTERS: PriceReportFilters = {
  categoryIgrps: [],
  productKeyword: null,
  includePriceDrops: true,
  includePriceRises: true,
  includeNewProducts: false,
};

export type PublicPriceReportPreviewResult =
  | {
      status: "sent";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
    }
  | {
      status: "skipped";
      changeCount: 0;
      newProductCount: 0;
      listedCount: 0;
      messageCount: 0;
    }
  | {
      status: "rate_limited";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

export async function sendPendingPublicPriceReports({
  client,
  options,
  now = new Date(),
  sendChannelMessages,
}: {
  client: DiscordBotClient;
  options: Pick<DiscordBotOptions, "publicBaseUrl" | "priceReportMaxItems">;
  now?: Date;
  sendChannelMessages: (
    channelId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<PublicPriceReportSummary> {
  const summary: PublicPriceReportSummary = {
    settingCount: 0,
    processedCount: 0,
    sentCount: 0,
    skippedCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };

  const settings = await client.discordPublicPriceReportSetting.findMany({
    where: {
      enabled: true,
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: MAX_DUE_PUBLIC_PRICE_REPORT_SETTINGS_PER_CYCLE,
  });

  summary.settingCount = settings.length;

  for (const setting of settings) {
    const settingSummary = await sendPendingPublicPriceReportsForSetting({
      client,
      setting,
      options,
      now,
      sendChannelMessages,
    });

    summary.processedCount += settingSummary.processedCount;
    summary.sentCount += settingSummary.sentCount;
    summary.skippedCount += settingSummary.skippedCount;
    summary.rateLimitedCount += settingSummary.rateLimitedCount;
    summary.failedCount += settingSummary.failedCount;
  }

  return summary;
}

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

export async function readLatestPublicPriceReportDelivery({
  client,
  channelId,
}: {
  client: DiscordBotClient;
  channelId: string;
}): Promise<PublicPriceReportDeliveryStatus | null> {
  return client.discordPublicPriceReportDelivery.findFirst({
    where: {
      channelId,
    },
    select: PUBLIC_PRICE_REPORT_DELIVERY_STATUS_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

export async function sendPublicPriceReportPreview({
  client,
  channelId,
  publicBaseUrl,
  maxItems,
  filters = DEFAULT_PUBLIC_PRICE_REPORT_FILTERS,
  now = new Date(),
  sendChannelMessages,
}: {
  client: DiscordBotClient;
  channelId: string;
  publicBaseUrl: string;
  maxItems: number;
  filters?: PriceReportFilters;
  now?: Date;
  sendChannelMessages: (
    channelId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<PublicPriceReportPreviewResult> {
  const report = await readRecentPriceReport(client, {
    since: new Date(now.getTime() - 24 * HOUR_MS),
    until: now,
    filters,
  });
  const messages = createPublicPriceReportMessages(report, {
    publicBaseUrl,
    maxItems,
    generatedAt: now,
  });
  const listedCount = Math.min(report.priceChanges.length + report.newProducts.length, maxItems);

  if (messages.length === 0) {
    return {
      status: "skipped",
      changeCount: 0,
      newProductCount: 0,
      listedCount: 0,
      messageCount: 0,
    };
  }

  const result = await sendChannelMessages(channelId, messages);

  if (result.status === "sent") {
    return {
      status: "sent",
      changeCount: report.priceChanges.length,
      newProductCount: report.newProducts.length,
      listedCount,
      messageCount: messages.length,
    };
  }

  if (result.status === "rate_limited") {
    return {
      status: "rate_limited",
      changeCount: report.priceChanges.length,
      newProductCount: report.newProducts.length,
      listedCount,
      messageCount: messages.length,
      sentMessageCount: result.sentMessageCount,
      retryAfterMs: result.retryAfterMs,
      global: result.global,
    };
  }

  return {
    status: "failed",
    changeCount: report.priceChanges.length,
    newProductCount: report.newProducts.length,
    listedCount,
    messageCount: messages.length,
    sentMessageCount: result.sentMessageCount,
    httpStatus: result.httpStatus,
    message: result.message,
  };
}

export function toPublicPriceReportFilters(
  setting: Pick<
    PublicPriceReportSetting,
    | "categoryIgrps"
    | "productKeyword"
    | "includePriceDrops"
    | "includePriceRises"
    | "includeNewProducts"
  > | null,
): PriceReportFilters {
  if (!setting) {
    return DEFAULT_PUBLIC_PRICE_REPORT_FILTERS;
  }

  return normalizePublicPriceReportFilters({
    categoryIgrps: setting.categoryIgrps,
    productKeyword: setting.productKeyword,
    includePriceDrops: setting.includePriceDrops,
    includePriceRises: setting.includePriceRises,
    includeNewProducts: setting.includeNewProducts,
  });
}

function clampPublicPriceReportMaxItems(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}

function normalizePublicPriceReportFilters(filters: PriceReportFilters): PriceReportFilters {
  if (!filters.includePriceDrops && !filters.includePriceRises && !filters.includeNewProducts) {
    return DEFAULT_PUBLIC_PRICE_REPORT_FILTERS;
  }

  return normalizePriceReportFilters(filters);
}

async function sendPendingPublicPriceReportsForSetting({
  client,
  setting,
  options,
  now,
  sendChannelMessages,
}: {
  client: DiscordBotClient;
  setting: PublicPriceReportSetting;
  options: Pick<DiscordBotOptions, "publicBaseUrl" | "priceReportMaxItems">;
  now: Date;
  sendChannelMessages: (
    channelId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<Omit<PublicPriceReportSummary, "settingCount">> {
  const summary = {
    processedCount: 0,
    sentCount: 0,
    skippedCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };
  const cursorAt = setting.notificationCursorAt ?? setting.createdAt;
  const crawlRuns = await client.crawlRun.findMany({
    where: {
      triggerType: "SCHEDULED",
      status: {
        in: [CRAWL_RUN_STATUSES.SUCCESS_CHANGED, CRAWL_RUN_STATUSES.SUCCESS_WITH_ERRORS],
      },
      finishedAt: {
        not: null,
        gt: cursorAt,
      },
      OR: [
        {
          publicPriceReportDeliveries: {
            none: {
              channelId: setting.channelId,
            },
          },
        },
        {
          publicPriceReportDeliveries: {
            some: {
              channelId: setting.channelId,
              status: {
                in: ["FAILED", "RATE_LIMITED"],
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
    orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
    take: MAX_DUE_PUBLIC_PRICE_REPORTS_PER_CYCLE,
  });

  for (const crawlRun of crawlRuns) {
    summary.processedCount += 1;

    const result = await sendPublicPriceReportForCrawlRun({
      client,
      setting,
      crawlRunId: crawlRun.id,
      maxItems: Math.min(setting.maxItems, options.priceReportMaxItems),
      publicBaseUrl: options.publicBaseUrl,
      now,
      sendChannelMessages,
    });

    if (result === "SENT") {
      summary.sentCount += 1;
    } else if (result === "SKIPPED") {
      summary.skippedCount += 1;
    } else if (result === "RATE_LIMITED") {
      summary.rateLimitedCount += 1;
    } else {
      summary.failedCount += 1;
    }
  }

  return summary;
}

async function sendPublicPriceReportForCrawlRun({
  client,
  setting,
  crawlRunId,
  maxItems,
  publicBaseUrl,
  now,
  sendChannelMessages,
}: {
  client: DiscordBotClient;
  setting: PublicPriceReportSetting;
  crawlRunId: string;
  maxItems: number;
  publicBaseUrl: string;
  now: Date;
  sendChannelMessages: (
    channelId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<PublicPriceReportStatus> {
  const readResult = await readCrawlRunPriceChangeSummary(client, crawlRunId);
  const filters = toPublicPriceReportFilters(setting);
  const changes = filterPriceChangesForReport(readResult.changes, filters);
  const newProducts = filterNewProductsForReport(readResult.newProducts, filters);
  const channelId = setting.channelId;

  if (changes.length === 0 && newProducts.length === 0) {
    await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId,
      status: "SKIPPED",
      itemCount: 0,
      messageCount: 0,
      deliveredAt: null,
      errorMessage: "no_report_items",
    });

    return "SKIPPED";
  }

  const messages = createPublicPriceReportMessages(
    { priceChanges: changes, newProducts },
    {
      publicBaseUrl,
      maxItems,
      generatedAt: now,
    },
  );
  const result = await sendChannelMessages(channelId, messages);
  const itemCount = Math.min(changes.length + newProducts.length, maxItems);

  if (result.status === "sent") {
    await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId,
      status: "SENT",
      itemCount,
      messageCount: messages.length,
      deliveredAt: now,
      errorMessage: null,
    });

    return "SENT";
  }

  if (result.status === "rate_limited") {
    await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId,
      status: "RATE_LIMITED",
      itemCount,
      messageCount: messages.length,
      deliveredAt: null,
      errorMessage: `Discord rate limited public report. sentMessages=${result.sentMessageCount}/${result.messageCount} retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`,
    });

    return "RATE_LIMITED";
  }

  await recordPublicPriceReportDelivery({
    client,
    crawlRunId,
    channelId,
    status: "FAILED",
    itemCount,
    messageCount: messages.length,
    deliveredAt: null,
    errorMessage: result.message,
  });

  return "FAILED";
}

async function recordPublicPriceReportDelivery({
  client,
  crawlRunId,
  channelId,
  status,
  itemCount,
  messageCount,
  deliveredAt,
  errorMessage,
}: {
  client: DiscordBotClient;
  crawlRunId: string;
  channelId: string;
  status: PublicPriceReportStatus;
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
}): Promise<void> {
  await client.discordPublicPriceReportDelivery.upsert({
    where: {
      crawlRunId_channelId: {
        crawlRunId,
        channelId,
      },
    },
    create: {
      crawlRunId,
      channelId,
      status,
      itemCount,
      messageCount,
      deliveredAt,
      errorMessage,
    },
    update: {
      status,
      itemCount,
      messageCount,
      deliveredAt,
      errorMessage,
    },
  });
}
