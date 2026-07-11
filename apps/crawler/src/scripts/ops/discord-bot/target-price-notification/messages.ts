// apps/crawler/src/scripts/ops/discord-bot/target-price-notification/messages.ts
// 組裝目標價達標通知的 Discord DM 訊息，處理單品通知、同使用者 digest 與 embed 長度限制。

import {
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
  DISCORD_TARGET_PRICE_REACHED_COLOR,
  PRODUCT_NAME_MAX_LENGTH,
} from "../constants";
import {
  createProductUrl,
  escapeMarkdownLinkText,
  formatDiscordBotText,
  formatTaipeiMinute,
  formatTaiwanDollar,
  toSingleLine,
} from "../message-text";
import type { DiscordBotMessage } from "../types";

const DISCORD_MESSAGE_MAX_EMBEDS = 10;

// 目標價通知訊息所需的 watch 最小資料，讓訊息層不依賴完整 Prisma row。
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

// 建立目標價達標 DM；單筆走完整商品 embed，多筆同使用者通知會合併成 digest。
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

// 建立單一商品達標通知，顯示商品連結、目前價格、目標價格與價格資料時間。
function createTargetPriceReachedMessage({
  watch,
  publicBaseUrl,
}: {
  watch: TargetPriceNotificationMessageWatch;
  publicBaseUrl: string;
}): DiscordBotMessage {
  const currentPrice = watch.product.currentPrice?.priceSnapshot.price;
  const capturedAt = watch.product.currentPrice?.priceSnapshot.capturedAt;
  const productName = formatDiscordBotText(
    toSingleLine(watch.product.name),
    PRODUCT_NAME_MAX_LENGTH,
  );

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
            value: formatTaiwanDollar(currentPrice ?? watch.targetPrice),
            inline: true,
          },
          {
            name: "目標價格",
            value: formatTaiwanDollar(watch.targetPrice),
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

// 將同使用者的多筆達標 watch 組成 digest embeds，並依 Discord description 上限切段。
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
  const productName = formatDiscordBotText(
    toSingleLine(watch.product.name),
    PRODUCT_NAME_MAX_LENGTH,
  );

  return [
    `[${escapeMarkdownLinkText(productName)}](${createProductUrl(publicBaseUrl, watch.product.id)})`,
    `目前 ${formatTaiwanDollar(currentPrice ?? watch.targetPrice)} / 目標 ${formatTaiwanDollar(watch.targetPrice)}`,
    "",
  ];
}

// 依 Discord embed description 長度上限切分文字，避免 digest 因單則訊息過長而送出失敗。
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
