// apps/crawler/src/scripts/ops/discord-bot/message-payload.ts
// 將內部 Discord 訊息模型轉成 REST payload，套用欄位長度裁切與 mention 安全預設。

import {
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
  DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH,
  DISCORD_EMBED_FOOTER_TEXT_MAX_LENGTH,
  DISCORD_EMBED_MAX_FIELDS,
  DISCORD_EMBED_TITLE_MAX_LENGTH,
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
} from "./constants";
import { formatDiscordBotText } from "./message-text";
import type { DiscordBotEmbed, DiscordBotMessage } from "./types";

// 建立可送給 Discord REST API 的訊息 payload，預設禁止 allowed_mentions 自動 ping。
export function createDiscordMessagePayload(
  message: DiscordBotMessage | string,
  ephemeral = false,
): Record<string, unknown> {
  const normalizedMessage = normalizeDiscordBotMessage(message);

  return {
    content: normalizedMessage.content,
    embeds: normalizedMessage.embeds,
    components: normalizedMessage.components,
    flags: ephemeral ? DISCORD_EPHEMERAL_MESSAGE_FLAG : undefined,
    allowed_mentions: {
      parse: [],
    },
  };
}

// 正規化訊息內容與 embed；若訊息被裁切到空內容，提供安全 fallback 文案。
function normalizeDiscordBotMessage(message: DiscordBotMessage | string): DiscordBotMessage {
  if (typeof message === "string") {
    return {
      content: formatDiscordBotText(message, DISCORD_MESSAGE_CONTENT_MAX_LENGTH),
    };
  }

  const content =
    typeof message.content === "string"
      ? formatDiscordBotText(message.content, DISCORD_MESSAGE_CONTENT_MAX_LENGTH)
      : undefined;
  const embeds = message.embeds?.map(normalizeDiscordBotEmbed).filter((embed) => {
    return Boolean(embed.title || embed.description || (embed.fields && embed.fields.length > 0));
  });

  if (
    !content &&
    (!embeds || embeds.length === 0) &&
    (!message.components || message.components.length === 0)
  ) {
    return {
      content: "價格報告目前沒有可顯示內容。",
    };
  }

  return {
    content,
    embeds: embeds && embeds.length > 0 ? embeds : undefined,
    components: message.components,
  };
}

// 套用 Discord embed 單欄位限制；跨 embed 的總長度分段由上游版面 helper 負責。
function normalizeDiscordBotEmbed(embed: DiscordBotEmbed): DiscordBotEmbed {
  return {
    title:
      typeof embed.title === "string"
        ? formatDiscordBotText(embed.title, DISCORD_EMBED_TITLE_MAX_LENGTH)
        : undefined,
    description:
      typeof embed.description === "string"
        ? formatDiscordBotText(embed.description, DISCORD_EMBED_DESCRIPTION_MAX_LENGTH)
        : undefined,
    color: typeof embed.color === "number" ? embed.color : undefined,
    fields: embed.fields?.slice(0, DISCORD_EMBED_MAX_FIELDS).map((field) => ({
      name: formatDiscordBotText(field.name, DISCORD_EMBED_TITLE_MAX_LENGTH),
      value: formatDiscordBotText(field.value, DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH),
      inline: field.inline,
    })),
    footer: embed.footer
      ? {
          text: formatDiscordBotText(embed.footer.text, DISCORD_EMBED_FOOTER_TEXT_MAX_LENGTH),
        }
      : undefined,
    timestamp: embed.timestamp,
  };
}
