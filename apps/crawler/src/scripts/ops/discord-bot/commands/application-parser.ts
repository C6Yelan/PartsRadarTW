// apps/crawler/src/scripts/ops/discord-bot/commands/application-parser.ts

import { DISCORD_OPTION_TYPE_SUBCOMMAND, MAX_PRICE_REPORT_ITEMS } from "../constants";
import type {
  DiscordInteraction,
  ParsedPriceReportCommand,
  ParsedPublicReportCommand,
} from "../types";

export function parsePriceReportInteraction(
  interaction: DiscordInteraction,
): ParsedPriceReportCommand | null {
  if (interaction.data?.name !== "price-report") {
    return null;
  }

  const subcommand = interaction.data.options?.find(
    (option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND,
  );

  if (!subcommand) {
    return null;
  }

  const windowOption = subcommand.options?.find((option) => option.name === "window");
  const maxItemsOption = subcommand.options?.find((option) => option.name === "max_items");

  if (subcommand.name === "now") {
    return {
      name: subcommand.name,
      windowHours: windowOption ? parseWindowHours(windowOption.value) : null,
      maxItems: parseMaxItems(maxItemsOption?.value),
    };
  }

  if (subcommand.name === "settings") {
    return {
      name: subcommand.name,
    };
  }

  return null;
}

export function parseWatchInteraction(interaction: DiscordInteraction): boolean {
  return interaction.data?.name === "watch";
}

export function parseBotInteraction(interaction: DiscordInteraction): "help" | null {
  if (interaction.data?.name !== "bot") {
    return null;
  }

  const subcommand = interaction.data.options?.find(
    (option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND,
  );

  return subcommand?.name === "help" ? "help" : null;
}

export function parsePublicReportInteraction(
  interaction: DiscordInteraction,
): ParsedPublicReportCommand | null {
  if (interaction.data?.name !== "public-report") {
    return null;
  }

  const subcommand = interaction.data.options?.find(
    (option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND,
  );

  if (
    subcommand?.name === "status" ||
    subcommand?.name === "manage" ||
    subcommand?.name === "test"
  ) {
    return { name: subcommand.name };
  }

  return null;
}

function parseWindowHours(value: unknown): number {
  if (value === "6h") {
    return 6;
  }

  if (value === "12h") {
    return 12;
  }

  return 24;
}

function parseMaxItems(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }

  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}
