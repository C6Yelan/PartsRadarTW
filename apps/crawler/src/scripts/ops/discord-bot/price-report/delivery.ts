// apps/crawler/src/scripts/ops/discord-bot/price-report/delivery.ts

import type { Prisma } from "@partsradar/db";
import { readRecentPriceReport } from "./reader";
import { HOUR_MS } from "../constants";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordDirectMessageSendResult,
  PriceReportNowResult,
} from "../types";
import {
  DEFAULT_PRICE_REPORT_FILTERS,
  hasActivePriceReportFilters,
  normalizePriceReportFilters,
  type PriceReportFilters,
} from "./filters";
import { clampPriceReportMaxItems } from "./limits";
import { createPersonalPriceReportEmbedMessages } from "./messages";

const PRICE_REPORT_DELIVERY_STATUS_SELECT = {
  status: true,
  itemCount: true,
  messageCount: true,
  errorMessage: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

export type PriceReportDeliveryStatus = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof PRICE_REPORT_DELIVERY_STATUS_SELECT;
}>;

export async function sendPriceReportNow({
  client,
  discordUserId,
  windowHours,
  maxItems,
  publicBaseUrl,
  filters = DEFAULT_PRICE_REPORT_FILTERS,
  now = new Date(),
  sendReportMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  publicBaseUrl: string;
  filters?: PriceReportFilters;
  now?: Date;
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordBotMessageSendResult>;
}): Promise<PriceReportNowResult> {
  return sendPriceReport({
    client,
    discordUserId,
    windowHours,
    maxItems,
    publicBaseUrl,
    filters,
    now,
    deliveryKind: "PRICE_REPORT_NOW",
    sendReportMessages,
  });
}

export async function sendPriceReport({
  client,
  discordUserId,
  windowHours,
  maxItems,
  publicBaseUrl,
  filters,
  now,
  since,
  deliveryKind,
  sendReportMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  maxItems: number;
  publicBaseUrl: string;
  filters: PriceReportFilters;
  now: Date;
  since?: Date;
  deliveryKind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordBotMessageSendResult>;
}): Promise<PriceReportNowResult> {
  const reportSince = since ?? new Date(now.getTime() - windowHours * HOUR_MS);
  const boundedMaxItems = clampPriceReportMaxItems(maxItems);
  const normalizedFilters = normalizePriceReportFilters(filters);
  const report = await readRecentPriceReport(client, {
    since: reportSince,
    until: now,
    filters: normalizedFilters,
  });
  const listedCount = Math.min(
    report.priceChanges.length + report.newProducts.length,
    boundedMaxItems,
  );
  const messages = createPersonalPriceReportEmbedMessages(report, {
    publicBaseUrl,
    maxItems: boundedMaxItems,
    windowHours,
    generatedAt: now,
    hasActiveFilters: hasActivePriceReportFilters(normalizedFilters),
  });
  const result = await sendReportMessages(messages);

  await recordPriceReportDelivery({
    client,
    discordUserId,
    kind: deliveryKind,
    status: result.status,
    itemCount: listedCount,
    messageCount: messages.length,
    deliveredAt: result.status === "sent" ? now : null,
    errorMessage: result.status === "failed" ? result.message : null,
  });

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

export async function readLatestScheduledPriceReportDelivery({
  client,
  discordUserId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
}): Promise<PriceReportDeliveryStatus | null> {
  return client.discordNotificationDelivery.findFirst({
    where: {
      discordUserId,
      kind: "SCHEDULED_PRICE_REPORT",
    },
    select: PRICE_REPORT_DELIVERY_STATUS_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function recordPriceReportDelivery({
  client,
  discordUserId,
  kind,
  status,
  itemCount,
  messageCount,
  deliveredAt,
  errorMessage,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  status: DiscordDirectMessageSendResult["status"];
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
}): Promise<void> {
  await client.discordNotificationDelivery.create({
    data: {
      discordUserId,
      kind,
      status: status === "sent" ? "SENT" : status === "rate_limited" ? "RATE_LIMITED" : "FAILED",
      itemCount,
      messageCount,
      deliveredAt,
      errorMessage,
    },
  });
}
