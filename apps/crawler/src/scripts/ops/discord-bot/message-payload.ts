// apps/crawler/src/scripts/ops/discord-bot/message-payload.ts

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
