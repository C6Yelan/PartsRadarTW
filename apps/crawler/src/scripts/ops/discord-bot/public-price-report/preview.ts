// apps/crawler/src/scripts/ops/discord-bot/public-price-report/preview.ts
// 產生並發送公開價格報告測試訊息，供伺服器管理員驗證頻道與篩選設定。

import { HOUR_MS, MAX_PRICE_REPORT_ITEMS } from "../constants";
import { createPublicPriceReportMessages } from "../price-report/messages";
import { readRecentPriceReport } from "../price-report/reader";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordDeliveryFailureMetadata,
} from "../types";
import { DEFAULT_PUBLIC_PRICE_REPORT_FILTERS, type PriceReportFilters } from "./filters";

// 公開報告測試發送結果，供設定面板轉成使用者可讀狀態訊息。
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
  | ({
      status: "rate_limited";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    } & DiscordDeliveryFailureMetadata)
  | ({
      status: "failed";
      changeCount: number;
      newProductCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
    } & DiscordDeliveryFailureMetadata);

// 讀取最近 24 小時公開報告內容並送到指定頻道；無內容時回傳 skipped，不建立 delivery 紀錄。
export async function sendPublicPriceReportPreview({
  client,
  channelId,
  publicBaseUrl,
  filters = DEFAULT_PUBLIC_PRICE_REPORT_FILTERS,
  now = new Date(),
  sendChannelMessages,
}: {
  client: DiscordBotClient;
  channelId: string;
  publicBaseUrl: string;
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
    generatedAt: now,
  });
  const listedCount = Math.min(
    report.priceChanges.length + report.newProducts.length,
    MAX_PRICE_REPORT_ITEMS,
  );

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
