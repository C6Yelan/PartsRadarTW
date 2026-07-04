// apps/crawler/src/scripts/ops/discord-bot/commands/definitions.ts

import {
  DISCORD_APPLICATION_CONTEXT_BOT_DM,
  DISCORD_APPLICATION_CONTEXT_GUILD,
  DISCORD_COMMAND_TYPE_CHAT_INPUT,
  DISCORD_OPTION_TYPE_INTEGER,
  DISCORD_OPTION_TYPE_STRING,
  DISCORD_OPTION_TYPE_SUBCOMMAND,
  DISCORD_PERMISSION_MANAGE_GUILD,
  MAX_PRICE_REPORT_ITEMS,
} from "../constants";

export function createPriceReportCommand(): Record<string, unknown> {
  return {
    name: "price-report",
    description: "Send PartsRadarTW price change reports.",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
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
        name: "settings",
        description: "查看並管理每日價格報告設定。",
      },
    ],
  };
}

export function createWatchCommand(): Record<string, unknown> {
  return {
    name: "watch",
    description: "設定與管理商品目標價格，集中查看目前價格及追蹤狀態。",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
  };
}

export function createPublicReportCommand(): Record<string, unknown> {
  return {
    name: "public-report",
    description: "管理伺服器公開價格報告。",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD],
    dm_permission: false,
    default_member_permissions: DISCORD_PERMISSION_MANAGE_GUILD.toString(),
    options: [
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "status",
        description: "查看公開價格報告狀態。",
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "manage",
        description: "設定公開價格報告頻道與啟用狀態。",
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "test",
        description: "發送一份測試公開價格報告。",
      },
    ],
  };
}

export function createBotCommand(): Record<string, unknown> {
  return {
    name: "bot",
    description: "查看 PartsRadarTW Discord bot 使用說明。",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
    options: [
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "help",
        description: "查看 watch、price-report、public-report 的使用方式。",
      },
    ],
  };
}
