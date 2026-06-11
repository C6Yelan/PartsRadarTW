// apps/crawler/src/scripts/ops/discord-bot/commands.ts

import {
  DISCORD_APPLICATION_CONTEXT_BOT_DM,
  DISCORD_APPLICATION_CONTEXT_GUILD,
  DISCORD_COMMAND_TYPE_CHAT_INPUT,
  DISCORD_OPTION_TYPE_INTEGER,
  DISCORD_OPTION_TYPE_STRING,
  DISCORD_OPTION_TYPE_SUBCOMMAND,
  MAX_PRICE_REPORT_ITEMS,
} from "./constants";
import type { DiscordInteraction, ParsedPriceReportCommand } from "./types";

export function createPriceReportCommand({
  includeDmContexts,
}: {
  includeDmContexts: boolean;
}): Record<string, unknown> {
  return {
    name: "price-report",
    description: "Send PartsRadarTW price change reports.",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    ...(includeDmContexts
      ? {
          contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
          dm_permission: true,
        }
      : {}),
    options: [
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "now",
        description: "立即在目前頻道或私訊顯示價格報告。",
        options: [
          {
            type: DISCORD_OPTION_TYPE_STRING,
            name: "window",
            description: "報告統計區間。",
            required: false,
            choices: [
              { name: "過去 24 小時", value: "24h" },
              { name: "過去 12 小時", value: "12h" },
              { name: "過去 6 小時", value: "6h" },
            ],
          },
          {
            type: DISCORD_OPTION_TYPE_INTEGER,
            name: "max_items",
            description: "最多列出的商品數。",
            required: false,
            min_value: 1,
            max_value: MAX_PRICE_REPORT_ITEMS,
          },
        ],
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "enable",
        description: "開啟每日價格報告私訊。",
        options: [
          {
            type: DISCORD_OPTION_TYPE_STRING,
            name: "window",
            description: "每天報告要統計的時間區間。",
            required: false,
            choices: [
              { name: "過去 24 小時", value: "24h" },
              { name: "過去 12 小時", value: "12h" },
              { name: "過去 6 小時", value: "6h" },
            ],
          },
          {
            type: DISCORD_OPTION_TYPE_INTEGER,
            name: "max_items",
            description: "每天最多列出的商品數。",
            required: false,
            min_value: 1,
            max_value: MAX_PRICE_REPORT_ITEMS,
          },
          {
            type: DISCORD_OPTION_TYPE_STRING,
            name: "time",
            description: "每日私訊發送時間，台北時間 HH:mm。",
            required: false,
          },
        ],
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "disable",
        description: "關閉每日價格報告私訊。",
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "settings",
        description: "查看每日價格報告設定。",
      },
    ],
  };
}

export function parsePriceReportInteraction(interaction: DiscordInteraction): ParsedPriceReportCommand | null {
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
      windowHours: parseWindowHours(windowOption?.value),
      maxItems: parseMaxItems(maxItemsOption?.value),
    };
  }

  if (subcommand.name === "enable") {
    const timeOption = subcommand.options?.find((option) => option.name === "time");
    const timeOfDay = parseTimeOfDay(timeOption?.value);

    return {
      name: subcommand.name,
      windowHours: parseWindowHours(windowOption?.value),
      maxItems: parseMaxItems(maxItemsOption?.value),
      timeOfDay,
      timeInputValid:
        timeOption?.value === undefined ||
        (typeof timeOption.value === "string" && timeOption.value.trim() === "") ||
        timeOfDay !== null,
    };
  }

  if (subcommand.name === "disable" || subcommand.name === "settings") {
    return {
      name: subcommand.name,
    };
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

function parseTimeOfDay(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}
