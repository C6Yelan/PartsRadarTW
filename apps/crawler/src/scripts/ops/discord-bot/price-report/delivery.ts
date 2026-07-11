// apps/crawler/src/scripts/ops/discord-bot/price-report/delivery.ts
// 產生個人價格報告訊息並記錄 Discord DM 發送結果。

import type { Prisma } from "@partsradar/db";
import { HOUR_MS, MAX_PRICE_REPORT_ITEMS } from "../constants";
import { toDiscordDeliveryErrorFields } from "../delivery-error-fields";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordMessageSendResult,
  PersonalPriceReportDeliveryResult,
} from "../types";
import {
  DEFAULT_PRICE_REPORT_FILTERS,
  hasActivePriceReportFilters,
  normalizePriceReportFilters,
  type PriceReportFilters,
} from "./filters";
import { createPersonalPriceReportEmbedMessages } from "./messages";
import { readRecentPriceReport } from "./reader";

const PRICE_REPORT_DELIVERY_STATUS_SELECT = {
  status: true,
  itemCount: true,
  messageCount: true,
  errorCategory: true,
  httpStatus: true,
  providerErrorCode: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

export type PriceReportDeliveryStatus = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof PRICE_REPORT_DELIVERY_STATUS_SELECT;
}>;

// 發送使用者手動觸發的即時價格報告，並以 command delivery 類型保存結果。
export async function sendPriceReportNow({
  client,
  discordUserId,
  windowHours,
  publicBaseUrl,
  filters = DEFAULT_PRICE_REPORT_FILTERS,
  now = new Date(),
  sendReportMessages,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  windowHours: number;
  publicBaseUrl: string;
  filters?: PriceReportFilters;
  now?: Date;
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordMessageSendResult>;
}): Promise<PersonalPriceReportDeliveryResult> {
  return sendPriceReport({
    client,
    discordUserId,
    windowHours,
    publicBaseUrl,
    filters,
    now,
    deliveryKind: "PRICE_REPORT_NOW",
    sendReportMessages,
  });
}

// 建立個人價格報告、交由呼叫端送出 Discord 訊息，並保存本次 delivery 狀態。
export async function sendPriceReport({
  client,
  discordUserId,
  windowHours,
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
  publicBaseUrl: string;
  filters: PriceReportFilters;
  now: Date;
  since?: Date;
  deliveryKind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  sendReportMessages: (messages: DiscordBotMessage[]) => Promise<DiscordMessageSendResult>;
}): Promise<PersonalPriceReportDeliveryResult> {
  const reportSince = since ?? new Date(now.getTime() - windowHours * HOUR_MS);
  const normalizedFilters = normalizePriceReportFilters(filters);
  const report = await readRecentPriceReport(client, {
    since: reportSince,
    until: now,
    filters: normalizedFilters,
  });
  const listedCount = Math.min(
    report.priceChanges.length + report.newProducts.length,
    MAX_PRICE_REPORT_ITEMS,
  );
  const messages = createPersonalPriceReportEmbedMessages(report, {
    publicBaseUrl,
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
    result,
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
      httpStatus: result.httpStatus,
      errorCategory: result.errorCategory,
      providerErrorCode: result.providerErrorCode,
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
    errorCategory: result.errorCategory,
    providerErrorCode: result.providerErrorCode,
  };
}

// 讀取使用者最近一次排程每日價格報告 delivery，供設定面板顯示狀態。
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

// 寫入個人價格報告 delivery 紀錄，保留成功、限流與失敗狀態供後續 UI 與重試判讀。
export async function recordPriceReportDelivery({
  client,
  discordUserId,
  kind,
  status,
  itemCount,
  messageCount,
  deliveredAt,
  result,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT";
  status: DiscordMessageSendResult["status"];
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  result: DiscordMessageSendResult;
}): Promise<void> {
  await client.discordNotificationDelivery.create({
    data: {
      discordUserId,
      kind,
      status: status === "sent" ? "SENT" : status === "rate_limited" ? "RATE_LIMITED" : "FAILED",
      itemCount,
      messageCount,
      deliveredAt,
      ...toDiscordDeliveryErrorFields(result),
    },
  });
}
