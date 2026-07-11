// apps/crawler/src/scripts/ops/discord-bot/public-price-report/delivery.ts
// 讀寫公開價格報告的 Discord 頻道發送紀錄，供排程去重與設定面板顯示狀態。

import type { Prisma } from "@partsradar/db";
import type { DiscordDeliveryErrorFields } from "../delivery-error-fields";
import type { DiscordBotClient } from "../types";

// 公開價格報告 delivery 的持久化狀態，對應成功、略過、失敗與 Discord rate limit。
export type PublicPriceReportStatus = "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";

const PUBLIC_PRICE_REPORT_DELIVERY_STATUS_SELECT = {
  status: true,
  itemCount: true,
  messageCount: true,
  errorCategory: true,
  httpStatus: true,
  providerErrorCode: true,
  deliveredAt: true,
  updatedAt: true,
} as const satisfies Prisma.DiscordPublicPriceReportDeliverySelect;

export type PublicPriceReportDeliveryStatus = Prisma.DiscordPublicPriceReportDeliveryGetPayload<{
  select: typeof PUBLIC_PRICE_REPORT_DELIVERY_STATUS_SELECT;
}>;

// 讀取指定頻道最近一次公開價格報告 delivery，供設定面板顯示發送狀態。
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
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

// 以 crawl run 與頻道為唯一鍵寫入公開報告 delivery；retry 會清除既有 legacy 技術摘要。
export async function recordPublicPriceReportDelivery({
  client,
  crawlRunId,
  channelId,
  status,
  itemCount,
  messageCount,
  deliveredAt,
  errorCategory,
  errorMessage,
  httpStatus,
  providerErrorCode,
}: {
  client: DiscordBotClient;
  crawlRunId: string;
  channelId: string;
  status: PublicPriceReportStatus;
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
} & DiscordDeliveryErrorFields): Promise<void> {
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
      errorCategory,
      errorMessage,
      httpStatus,
      providerErrorCode,
    },
    update: {
      status,
      itemCount,
      messageCount,
      deliveredAt,
      errorCategory,
      errorMessage,
      httpStatus,
      providerErrorCode,
    },
  });
}
