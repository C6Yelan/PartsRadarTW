// apps/crawler/tests/scripts/ops/discord-bot/support/message-assertions.ts
// 提供 Discord bot 測試讀取 embed 與 message component 的窄 helper。

import type {
  DiscordBotEmbed,
  DiscordBotMessage,
} from "../../../../../src/scripts/ops/discord-bot/types";

// 從 interaction response 或一般 message body 取出第一個 embed。
export function readResponseEmbed(body: {
  data?: { embeds?: DiscordBotEmbed[] };
  embeds?: DiscordBotEmbed[];
}): DiscordBotEmbed {
  const embed = body.data?.embeds?.[0] ?? body.embeds?.[0];

  if (!embed) {
    throw new Error("Expected response body to include an embed.");
  }

  return embed;
}

// 讀取 embed 指定欄位的顯示值。
export function readEmbedFieldValue(embed: DiscordBotEmbed, fieldName: string): string | undefined {
  return embed.fields?.find((field) => field.name === fieldName)?.value;
}

// 在 message component tree 中依 custom id 找出元件。
export function findMessageComponent(
  body: DiscordBotMessage,
  customId: string,
): NonNullable<DiscordBotMessage["components"]>[number]["components"][number] | undefined {
  return body.components
    ?.flatMap((row) => row.components)
    .find((component) => component.custom_id === customId);
}
