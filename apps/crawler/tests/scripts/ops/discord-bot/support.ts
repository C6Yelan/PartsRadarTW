// apps/crawler/tests/scripts/ops/discord-bot/support.ts
import type { DiscordBotEmbed, DiscordBotMessage } from "../../../../src/scripts/ops/discord-bot/types";

export * from "./support-options";

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

export function readEmbedFieldValue(embed: DiscordBotEmbed, fieldName: string): string | undefined {
  return embed.fields?.find((field) => field.name === fieldName)?.value;
}

export function findMessageComponent(
  body: DiscordBotMessage,
  customId: string,
): NonNullable<DiscordBotMessage["components"]>[number]["components"][number] | undefined {
  return body.components
    ?.flatMap((row) => row.components)
    .find((component) => component.custom_id === customId);
}

export function findMessageComponentByPrefix(
  body: DiscordBotMessage,
  customIdPrefix: string,
): NonNullable<DiscordBotMessage["components"]>[number]["components"][number] | undefined {
  return body.components
    ?.flatMap((row) => row.components)
    .find((component) => component.custom_id.startsWith(customIdPrefix));
}

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

export * from "./support-client";
export * from "./support-watch-clients";
export * from "./support-data";
export * from "./support-interactions";
