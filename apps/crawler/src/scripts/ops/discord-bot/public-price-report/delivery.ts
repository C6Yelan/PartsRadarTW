// apps/crawler/src/scripts/ops/discord-bot/public-price-report/delivery.ts

import type { Prisma } from "@partsradar/db";
import type { DiscordBotClient } from "../types";

export type PublicPriceReportStatus = "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";

const PUBLIC_PRICE_REPORT_DELIVERY_STATUS_SELECT = {
  status: true,
  itemCount: true,
  messageCount: true,
  errorMessage: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.DiscordPublicPriceReportDeliverySelect;

export type PublicPriceReportDeliveryStatus = Prisma.DiscordPublicPriceReportDeliveryGetPayload<{
  select: typeof PUBLIC_PRICE_REPORT_DELIVERY_STATUS_SELECT;
}>;

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

export async function recordPublicPriceReportDelivery({
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
