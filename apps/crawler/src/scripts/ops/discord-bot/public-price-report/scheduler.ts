// apps/crawler/src/scripts/ops/discord-bot/public-price-report/scheduler.ts

import { CRAWL_RUN_STATUSES } from "../../../../coolpc/crawl-run";
import { readCrawlRunPriceChangeSummary } from "../../price-change-discord-notification";
import {
  MAX_DUE_PUBLIC_PRICE_REPORTS_PER_CYCLE,
  MAX_DUE_PUBLIC_PRICE_REPORT_SETTINGS_PER_CYCLE,
} from "../constants";
import {
  filterNewProductsForReport,
  filterPriceChangesForReport,
} from "../price-report/filters";
import { createPublicPriceReportMessages } from "../price-report/messages";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordBotOptions,
} from "../types";
import {
  recordPublicPriceReportDelivery,
  type PublicPriceReportStatus,
} from "./delivery";
import { toPublicPriceReportFilters } from "./filters";
import {
  PUBLIC_PRICE_REPORT_SETTING_SELECT,
  type PublicPriceReportSetting,
} from "./settings";

export interface PublicPriceReportSummary {
  settingCount: number;
  processedCount: number;
  sentCount: number;
  skippedCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

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
