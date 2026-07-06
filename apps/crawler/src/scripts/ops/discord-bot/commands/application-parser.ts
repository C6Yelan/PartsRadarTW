// apps/crawler/src/scripts/ops/discord-bot/commands/application-parser.ts
// 解析 Discord application command interaction，將原始 payload 收斂成 bot 內部可分派的命令型別。

import { DISCORD_OPTION_TYPE_SUBCOMMAND, MAX_PRICE_REPORT_ITEMS } from "../constants";
import type {
  DiscordInteraction,
  ParsedPriceReportCommand,
  ParsedPublicReportCommand,
} from "../types";

// 解析 /price-report 子命令與選項，並把 Discord option value 收斂成 pricereport handler 可使用的設定。
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

// 判斷 interaction 是否為 /watch 命令；此命令目前不需要額外 payload 轉換。
export function parseWatchInteraction(interaction: DiscordInteraction): boolean {
  return interaction.data?.name === "watch";
}

// 解析 /bot 子命令，目前只接受 help，避免未知子命令落入後續 handler。
export function parseBotInteraction(interaction: DiscordInteraction): "help" | null {
  if (interaction.data?.name !== "bot") {
    return null;
  }

  const subcommand = interaction.data.options?.find(
    (option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND,
  );

  return subcommand?.name === "help" ? "help" : null;
}

// 解析 /public-report 維運子命令，保留 allow-list 以避免未註冊或未知子命令被執行。
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

// 將 /price-report now 的時間視窗選項收斂成小時數；未知值回到預設 24 小時。
function parseWindowHours(value: unknown): number {
  if (value === "6h") {
    return 6;
  }

  if (value === "12h") {
    return 12;
  }

  return 24;
}

// 將 max_items 限制在 handler 支援範圍內；缺值或非整數代表使用 handler 預設。
function parseMaxItems(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }

  return Math.min(Math.max(value, 1), MAX_PRICE_REPORT_ITEMS);
}
