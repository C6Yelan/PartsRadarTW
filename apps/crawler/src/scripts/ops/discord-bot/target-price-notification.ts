// apps/crawler/src/scripts/ops/discord-bot/target-price-notification.ts

import type { Prisma } from "@partsradar/db";

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import {
  DISCORD_TARGET_PRICE_REACHED_COLOR,
  MAX_TARGET_PRICE_NOTIFICATIONS_PER_CYCLE,
  PRODUCT_NAME_MAX_LENGTH,
  TARGET_PRICE_NOTIFICATION_CLAIM_LEASE_MS,
} from "./constants";
import { formatDiscordBotText } from "./rest";
import type { DiscordBotClient, DiscordBotMessage, DiscordBotMessageSendResult } from "./types";

const TARGET_PRICE_NOTIFICATION_SELECT = {
  id: true,
  discordUserId: true,
  productId: true,
  targetPrice: true,
  currency: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      currentPrice: {
        select: {
          priceSnapshot: {
            select: {
              price: true,
              currency: true,
              capturedAt: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

type TargetPriceNotificationWatch = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_NOTIFICATION_SELECT;
}>;

export interface TargetPriceNotificationSummary {
  scannedCount: number;
  dueCount: number;
  processedCount: number;
  sentCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

export async function sendDueTargetPriceNotifications({
  client,
  publicBaseUrl,
  now = new Date(),
  sendDirectMessages,
}: {
  client: DiscordBotClient;
  publicBaseUrl: string;
  now?: Date;
  sendDirectMessages: (
    discordUserId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<TargetPriceNotificationSummary> {
  const staleClaimBefore = new Date(now.getTime() - TARGET_PRICE_NOTIFICATION_CLAIM_LEASE_MS);
  const candidates = await client.discordTargetPriceWatch.findMany({
    where: {
      enabled: true,
      lastNotifiedAt: null,
      OR: [{ notificationClaimedAt: null }, { notificationClaimedAt: { lte: staleClaimBefore } }],
      product: {
        isActive: true,
        currentPrice: {
          isNot: null,
        },
      },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: TARGET_PRICE_NOTIFICATION_SELECT,
  });
  const dueWatches = candidates
    .filter(isTargetPriceReached)
    .slice(0, MAX_TARGET_PRICE_NOTIFICATIONS_PER_CYCLE);
  const summary: TargetPriceNotificationSummary = {
    scannedCount: candidates.length,
    dueCount: dueWatches.length,
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };

  for (const watch of dueWatches) {
    const claimed = await client.discordTargetPriceWatch.updateMany({
      where: {
        id: watch.id,
        enabled: true,
        lastNotifiedAt: null,
        OR: [{ notificationClaimedAt: null }, { notificationClaimedAt: { lte: staleClaimBefore } }],
      },
      data: {
        notificationClaimedAt: now,
      },
    });

    if (claimed.count === 0) {
      continue;
    }

    summary.processedCount += 1;
    const message = createTargetPriceReachedMessage({ watch, publicBaseUrl });
    let sendResult: DiscordBotMessageSendResult;

    try {
      sendResult = await sendDirectMessages(watch.discordUserId, [message]);
    } catch (error) {
      sendResult = {
        status: "failed",
        messageCount: 1,
        sentMessageCount: 0,
        httpStatus: null,
        message: toSafeCliErrorMessage(error),
      };
    }

    if (sendResult.status === "sent") {
      summary.sentCount += 1;
      await client.discordTargetPriceWatch.updateMany({
        where: {
          id: watch.id,
          enabled: true,
          lastNotifiedAt: null,
          notificationClaimedAt: now,
        },
        data: {
          lastNotifiedAt: now,
          notificationClaimedAt: null,
        },
      });
    } else {
      if (sendResult.status === "rate_limited") {
        summary.rateLimitedCount += 1;
      } else {
        summary.failedCount += 1;
      }

      await client.discordTargetPriceWatch.updateMany({
        where: {
          id: watch.id,
          lastNotifiedAt: null,
          notificationClaimedAt: now,
        },
        data: {
          notificationClaimedAt: null,
        },
      });
    }

    await recordTargetPriceNotificationDelivery({
      client,
      watch,
      result: sendResult,
      now,
    });

    if (sendResult.status === "rate_limited") {
      break;
    }
  }

  return summary;
}

export function createTargetPriceReachedMessage({
  watch,
  publicBaseUrl,
}: {
  watch: TargetPriceNotificationWatch;
  publicBaseUrl: string;
}): DiscordBotMessage {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price;
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;
  const capturedAt = watch.product.currentPrice?.priceSnapshot.capturedAt;
  const difference = Math.max(0, watch.targetPrice - (currentPrice ?? watch.targetPrice));
  const productName = formatDiscordBotText(watch.product.name, PRODUCT_NAME_MAX_LENGTH);

  return {
    embeds: [
      {
        title: "商品已達到目標價格",
        description: `[${escapeMarkdownLinkText(productName)}](${createProductUrl(
          publicBaseUrl,
          watch.product.id,
        )})\n\n目前價格已低於或等於你設定的目標價。這項追蹤只會通知一次；修改目標價後才會重新啟用通知。`,
        color: DISCORD_TARGET_PRICE_REACHED_COLOR,
        fields: [
          {
            name: "目前價格",
            value: formatCurrency(currentPrice ?? watch.targetPrice, currentCurrency),
            inline: true,
          },
          {
            name: "目標價格",
            value: formatCurrency(watch.targetPrice, watch.currency),
            inline: true,
          },
          {
            name: "達標差額",
            value:
              difference === 0
                ? "目前價格正好達到目標價。"
                : `目前價格比目標價低 ${formatCurrency(difference, currentCurrency)}。`,
          },
        ],
        footer: capturedAt
          ? {
              text: `價格資料時間：${formatTaipeiMinute(capturedAt)}`,
            }
          : undefined,
        timestamp: capturedAt?.toISOString(),
      },
    ],
  };
}

function isTargetPriceReached(watch: TargetPriceNotificationWatch): boolean {
  const snapshot = watch.product.currentPrice?.priceSnapshot;

  return (
    snapshot !== undefined &&
    snapshot.currency === watch.currency &&
    snapshot.price <= watch.targetPrice
  );
}

async function recordTargetPriceNotificationDelivery({
  client,
  watch,
  result,
  now,
}: {
  client: DiscordBotClient;
  watch: TargetPriceNotificationWatch;
  result: DiscordBotMessageSendResult;
  now: Date;
}): Promise<void> {
  await client.discordNotificationDelivery.create({
    data: {
      discordUserId: watch.discordUserId,
      kind: "TARGET_PRICE",
      status:
        result.status === "sent"
          ? "SENT"
          : result.status === "rate_limited"
            ? "RATE_LIMITED"
            : "FAILED",
      productId: watch.productId,
      targetPriceWatchId: watch.id,
      dedupeKey:
        result.status === "sent"
          ? `target-price:${watch.id}:${watch.updatedAt.toISOString()}`
          : null,
      itemCount: 1,
      messageCount: 1,
      deliveredAt: result.status === "sent" ? now : null,
      errorMessage: result.status === "failed" ? result.message : null,
    },
  });
}

function formatCurrency(amount: number, currency: string): string {
  return currency === "TWD"
    ? `NT$${amount.toLocaleString("en-US")}`
    : `${currency} ${amount.toLocaleString("en-US")}`;
}

function formatTaipeiMinute(value: Date): string {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("month")}/${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}
