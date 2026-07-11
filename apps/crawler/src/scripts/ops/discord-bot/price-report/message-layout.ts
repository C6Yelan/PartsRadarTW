// apps/crawler/src/scripts/ops/discord-bot/price-report/message-layout.ts
// 將價格報告內容切成符合 Discord embed 與 message 長度限制的訊息版面。

import {
  DISCORD_EMBED_COLOR,
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
  DISCORD_MESSAGE_EMBED_TOTAL_MAX_LENGTH,
} from "../constants";
import { formatDiscordBotText } from "../message-text";
import type { DiscordBotEmbed, DiscordBotMessage } from "../types";

const DISCORD_MESSAGE_MAX_EMBEDS = 10;

// 建立單一報告區塊的 embed；內容過長時會切成多個 embed 並保留頁次標示。
export function createReportSectionEmbeds({
  title,
  lines,
  footer,
  timestamp,
}: {
  title: string;
  lines: string[];
  footer: string | null;
  timestamp: string;
}): DiscordBotEmbed[] {
  const descriptionChunks = createReportDescriptionChunks(lines);

  return descriptionChunks.map((description, index) => ({
    title:
      descriptionChunks.length > 1 ? `${title} (${index + 1}/${descriptionChunks.length})` : title,
    description,
    color: DISCORD_EMBED_COLOR,
    footer: footer && index === descriptionChunks.length - 1 ? { text: footer } : undefined,
    timestamp,
  }));
}

function createReportDescriptionChunks(lines: string[]): string[] {
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

// 將多個 embed 分批包成 Discord message，避免超過單則訊息的 embed 數量與總文字限制。
export function createReportMessages(embeds: DiscordBotEmbed[]): DiscordBotMessage[] {
  const messages: DiscordBotMessage[] = [];
  let currentEmbeds: DiscordBotEmbed[] = [];
  let currentEmbedTextLength = 0;

  for (const embed of embeds) {
    const embedTextLength = calculateEmbedTextLength(embed);
    const shouldStartNextMessage =
      currentEmbeds.length > 0 &&
      (currentEmbeds.length >= DISCORD_MESSAGE_MAX_EMBEDS ||
        currentEmbedTextLength + embedTextLength > DISCORD_MESSAGE_EMBED_TOTAL_MAX_LENGTH);

    if (shouldStartNextMessage) {
      messages.push({
        embeds: currentEmbeds,
      });
      currentEmbeds = [];
      currentEmbedTextLength = 0;
    }

    currentEmbeds.push(embed);
    currentEmbedTextLength += embedTextLength;
  }

  if (currentEmbeds.length > 0) {
    messages.push({
      embeds: currentEmbeds,
    });
  }

  return messages;
}

function calculateEmbedTextLength(embed: DiscordBotEmbed): number {
  return (
    textLength(embed.title) +
    textLength(embed.description) +
    textLength(embed.footer?.text) +
    (embed.fields ?? []).reduce(
      (total, field) => total + textLength(field.name) + textLength(field.value),
      0,
    )
  );
}

function textLength(value: string | undefined): number {
  return value?.length ?? 0;
}
