// apps/crawler/src/scripts/ops/discord-bot/target-price-notification/messages.ts

import {
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
  DISCORD_TARGET_PRICE_REACHED_COLOR,
  PRODUCT_NAME_MAX_LENGTH,
} from "../constants";
import { formatDiscordBotText } from "../message-text";
import type { DiscordBotMessage } from "../types";

const DISCORD_MESSAGE_MAX_EMBEDS = 10;

export interface TargetPriceNotificationMessageWatch {
  id: string;
  productId: string;
  targetPrice: number;
  currency: string;
  updatedAt: Date;
  product: {
    id: string;
    name: string;
    currentPrice: {
      priceSnapshot: {
        price: number;
        currency: string;
        capturedAt: Date;
      };
    } | null;
  };
}

export function createTargetPriceReachedMessages({
  watches,
  publicBaseUrl,
}: {
  watches: TargetPriceNotificationMessageWatch[];
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
  watch: TargetPriceNotificationMessageWatch;
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
  watches: TargetPriceNotificationMessageWatch[];
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
  watch: TargetPriceNotificationMessageWatch,
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
