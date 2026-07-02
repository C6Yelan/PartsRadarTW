// apps/crawler/src/scripts/ops/discord-bot/target-price-notification.ts

import type { Prisma } from "@partsradar/db";

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import {
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
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
  notificationCursorAt: true,
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

const DISCORD_MESSAGE_MAX_EMBEDS = 10;

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

  for (const watches of groupTargetPriceWatchesByUser(dueWatches)) {
    const claimedWatches: TargetPriceNotificationWatch[] = [];

    for (const watch of watches) {
      const claimed = await client.discordTargetPriceWatch.updateMany({
        where: {
          id: watch.id,
          enabled: true,
          lastNotifiedAt: null,
          OR: [
            { notificationClaimedAt: null },
            { notificationClaimedAt: { lte: staleClaimBefore } },
          ],
        },
        data: {
          notificationClaimedAt: now,
        },
      });

      if (claimed.count === 0) {
        continue;
      }

      summary.processedCount += 1;
      claimedWatches.push(watch);
    }

    if (claimedWatches.length === 0) {
      continue;
    }

    const discordUserId = claimedWatches[0]?.discordUserId;

    if (!discordUserId) {
      continue;
    }

    const messages = createTargetPriceReachedMessages({ watches: claimedWatches, publicBaseUrl });
    let sendResult: DiscordBotMessageSendResult;

    try {
      sendResult = await sendDirectMessages(discordUserId, messages);
    } catch (error) {
      sendResult = {
        status: "failed",
        messageCount: messages.length,
        sentMessageCount: 0,
        httpStatus: null,
        message: toSafeCliErrorMessage(error),
      };
    }

    if (sendResult.status === "sent") {
      summary.sentCount += claimedWatches.length;

      for (const watch of claimedWatches) {
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
      }
    } else {
      if (sendResult.status === "rate_limited") {
        summary.rateLimitedCount += claimedWatches.length;
      } else {
        summary.failedCount += claimedWatches.length;
      }

      for (const watch of claimedWatches) {
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
    }

    for (const watch of claimedWatches) {
      await recordTargetPriceNotificationDelivery({
        client,
        watch,
        result: sendResult,
        now,
      });
    }

    if (sendResult.status === "rate_limited") {
      break;
    }
  }

  return summary;
}

function createTargetPriceReachedMessages({
  watches,
  publicBaseUrl,
}: {
  watches: TargetPriceNotificationWatch[];
  publicBaseUrl: string;
}): DiscordBotMessage[] {
  if (watches.length === 1 && watches[0]) {
    return [createTargetPriceReachedMessage({ watch: watches[0], publicBaseUrl })];
  }

  const embeds = createTargetPriceReachedDigestEmbeds({ watches, publicBaseUrl });
  const messages: DiscordBotMessage[] = [];

  for (let index = 0; index < embeds.length; index += DISCORD_MESSAGE_MAX_EMBEDS) {
    messages.push({
      embeds: embeds.slice(index, index + DISCORD_MESSAGE_MAX_EMBEDS),
    });
  }

  return messages;
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
  const productName = formatDiscordBotText(watch.product.name, PRODUCT_NAME_MAX_LENGTH);

  return {
    embeds: [
      {
        title: "商品已達到目標價格",
        description: `[${escapeMarkdownLinkText(productName)}](${createProductUrl(
          publicBaseUrl,
          watch.product.id,
        )})`,
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
        ],
        footer: capturedAt
          ? {
              text: `價格資料時間：${formatTaipeiMinute(capturedAt)}`,
            }
          : undefined,
      },
    ],
  };
}

function createTargetPriceReachedDigestEmbeds({
  watches,
  publicBaseUrl,
}: {
  watches: TargetPriceNotificationWatch[];
  publicBaseUrl: string;
}): NonNullable<DiscordBotMessage["embeds"]> {
  const lines = [
    `共有 **${watches.length}** 項追蹤達到目標價格。`,
    "",
    ...watches.flatMap((watch) => formatTargetPriceDigestLines(watch, publicBaseUrl)),
  ];
  const descriptionChunks = createDescriptionChunks(lines);

  return descriptionChunks.map((description, index) => ({
    title:
      descriptionChunks.length > 1
        ? `商品目標價達標 (${index + 1}/${descriptionChunks.length})`
        : "商品目標價達標",
    description,
    color: DISCORD_TARGET_PRICE_REACHED_COLOR,
  }));
}

function formatTargetPriceDigestLines(
  watch: TargetPriceNotificationWatch,
  publicBaseUrl: string,
): string[] {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price;
  const currentCurrency = watch.product.currentPrice?.priceSnapshot.currency ?? watch.currency;
  const productName = formatDiscordBotText(watch.product.name, PRODUCT_NAME_MAX_LENGTH);

  return [
    `[${escapeMarkdownLinkText(productName)}](${createProductUrl(publicBaseUrl, watch.product.id)})`,
    `目前 ${formatCurrency(currentPrice ?? watch.targetPrice, currentCurrency)} / 目標 ${formatCurrency(
      watch.targetPrice,
      watch.currency,
    )}`,
    "",
  ];
}

function createDescriptionChunks(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const formattedLine = formatDiscordBotText(line, DISCORD_EMBED_DESCRIPTION_MAX_LENGTH);
    const next = current ? `${current}\n${formattedLine}` : formattedLine;

    if (current && next.length > DISCORD_EMBED_DESCRIPTION_MAX_LENGTH) {
      chunks.push(current);
      current = formattedLine;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function groupTargetPriceWatchesByUser(
  watches: TargetPriceNotificationWatch[],
): TargetPriceNotificationWatch[][] {
  const grouped = new Map<string, TargetPriceNotificationWatch[]>();

  for (const watch of watches) {
    grouped.set(watch.discordUserId, [...(grouped.get(watch.discordUserId) ?? []), watch]);
  }

  return [...grouped.values()];
}

function isTargetPriceReached(watch: TargetPriceNotificationWatch): boolean {
  const snapshot = watch.product.currentPrice?.priceSnapshot;

  return (
    snapshot !== undefined &&
    snapshot.currency === watch.currency &&
    (!watch.notificationCursorAt ||
      snapshot.capturedAt.getTime() > watch.notificationCursorAt.getTime()) &&
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
      messageCount: result.messageCount,
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
