// apps/crawler/src/scripts/ops/discord-bot/public-price-report/preview.ts

import { readRecentPriceReport } from "../../price-change-discord-notification";
import { HOUR_MS } from "../constants";
import { createPublicPriceReportMessages } from "../price-report/messages";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
} from "../types";
import {
  DEFAULT_PUBLIC_PRICE_REPORT_FILTERS,
  type PriceReportFilters,
} from "./filters";

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
