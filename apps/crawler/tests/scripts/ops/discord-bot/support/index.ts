// apps/crawler/tests/scripts/ops/discord-bot/support/index.ts
// 彙整 Discord bot 測試共用 helper、fixture 與 fake client 入口。
import type {
  DiscordBotEmbed,
  DiscordBotMessage,
} from "../../../../../src/scripts/ops/discord-bot/types";

export * from "./options";

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

// 在 message component tree 中依 custom id prefix 找出元件。
export function findMessageComponentByPrefix(
  body: DiscordBotMessage,
  customIdPrefix: string,
): NonNullable<DiscordBotMessage["components"]>[number]["components"][number] | undefined {
  return body.components
    ?.flatMap((row) => row.components)
    .find((component) => component.custom_id.startsWith(customIdPrefix));
}

// 計算 message 內所有 embed 文字長度，對齊 Discord embed size 測試。
export function calculateMessageEmbedTextLength(message: DiscordBotMessage): number {
  return (message.embeds ?? []).reduce(
    (total, embed) =>
      total +
      textLength(embed.title) +
      textLength(embed.description) +
      textLength(embed.footer?.text) +
      (embed.fields ?? []).reduce(
        (fieldTotal, field) => fieldTotal + textLength(field.name) + textLength(field.value),
        0,
      ),
    0,
  );
}

export function textLength(value: string | undefined): number {
  return value?.length ?? 0;
}

export * from "./client";
export * from "./data";
export * from "./interactions";
export * from "./watch-clients";
