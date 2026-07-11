// apps/crawler/src/scripts/ops/discord-bot/commands/definitions.ts
// 定義要註冊到 Discord 的 slash command 結構，集中管理指令名稱、選項、context 與權限邊界。

import {
  DISCORD_APPLICATION_CONTEXT_BOT_DM,
  DISCORD_APPLICATION_CONTEXT_GUILD,
  DISCORD_COMMAND_TYPE_CHAT_INPUT,
  DISCORD_OPTION_TYPE_STRING,
  DISCORD_OPTION_TYPE_SUBCOMMAND,
  DISCORD_PERMISSION_MANAGE_GUILD,
} from "../constants";

// 建立 /price-report 指令定義，包含即時價格報告與每日私訊價格報告設定。
export function createPriceReportCommand(): Record<string, unknown> {
  return {
    name: "price-report",
    description: "查看即時價格報告並管理每日私訊價格報告。",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
    options: [
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "now",
        description: "立即在目前頻道或私訊顯示即時價格報告。",
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
        ],
      },
      {
        type: DISCORD_OPTION_TYPE_SUBCOMMAND,
        name: "settings",
        description: "查看並管理每日私訊價格報告設定。",
      },
    ],
  };
}

// 建立 /watch 指令定義，作為目標價提醒管理介面的入口。
export function createWatchCommand(): Record<string, unknown> {
  return {
    name: "watch",
    description: "設定與管理商品目標價格，集中查看目前價格及追蹤狀態。",
    type: DISCORD_COMMAND_TYPE_CHAT_INPUT,
    contexts: [DISCORD_APPLICATION_CONTEXT_GUILD, DISCORD_APPLICATION_CONTEXT_BOT_DM],
    dm_permission: true,
  };
}

// 建立 /public-report 指令定義；限制在 guild context 並要求管理伺服器權限。
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

// 建立 /bot help 指令定義，提供 Discord bot 內建功能說明入口。
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
