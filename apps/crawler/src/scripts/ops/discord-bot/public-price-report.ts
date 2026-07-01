// apps/crawler/src/scripts/ops/discord-bot/public-price-report.ts

import { CRAWL_RUN_STATUSES } from "../../../coolpc/crawl-run";
import { readCrawlRunPriceChangeSummary } from "../price-change-discord-notification";
import { MAX_DUE_PUBLIC_PRICE_REPORTS_PER_CYCLE } from "./constants";
import { createPublicPriceChangeReportMessages } from "./price-report";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordBotOptions,
} from "./types";

export interface PublicPriceReportSummary {
  processedCount: number;
  sentCount: number;
  skippedCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

type PublicPriceReportStatus = "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";

export async function sendPendingPublicPriceReports({
  client,
  options,
  now = new Date(),
  sendChannelMessages,
}: {
  client: DiscordBotClient;
  options: Pick<
    DiscordBotOptions,
    "publicBaseUrl" | "publicReportChannelId" | "priceReportMaxItems"
  >;
  now?: Date;
  sendChannelMessages: (
    channelId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<PublicPriceReportSummary> {
  const summary: PublicPriceReportSummary = {
    processedCount: 0,
    sentCount: 0,
    skippedCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };

  if (!options.publicReportChannelId) {
    return summary;
  }

  const crawlRuns = await client.crawlRun.findMany({
    where: {
      triggerType: "SCHEDULED",
      status: {
        in: [CRAWL_RUN_STATUSES.SUCCESS_CHANGED, CRAWL_RUN_STATUSES.SUCCESS_WITH_ERRORS],
      },
      finishedAt: {
        not: null,
      },
      OR: [
        {
          publicPriceReportDeliveries: {
            none: {
              channelId: options.publicReportChannelId,
            },
          },
        },
        {
          publicPriceReportDeliveries: {
            some: {
              channelId: options.publicReportChannelId,
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
      channelId: options.publicReportChannelId,
      crawlRunId: crawlRun.id,
      maxItems: options.priceReportMaxItems,
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
  channelId,
  crawlRunId,
  maxItems,
  publicBaseUrl,
  now,
  sendChannelMessages,
}: {
  client: DiscordBotClient;
  channelId: string;
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

  if (readResult.changes.length === 0) {
    await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId,
      status: "SKIPPED",
      itemCount: 0,
      messageCount: 0,
      deliveredAt: null,
      errorMessage: "no_price_changes",
    });

    return "SKIPPED";
  }

  const messages = createPublicPriceChangeReportMessages(readResult.changes, {
    publicBaseUrl,
    maxItems,
    generatedAt: now,
  });
  const result = await sendChannelMessages(channelId, messages);
  const itemCount = Math.min(readResult.changes.length, maxItems);

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
