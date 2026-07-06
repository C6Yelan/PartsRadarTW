// apps/crawler/src/scripts/ops/discord-bot/interactions/bot-help.ts
// 組裝 /bot help 回覆訊息，提供 Discord 使用者可見的 bot 功能摘要。

import { DISCORD_EMBED_COLOR } from "../constants";
import type { DiscordBotMessage } from "../types";

// 建立 Discord bot 說明 embed，列出目前公開註冊的主要 slash command。
export function createBotHelpMessage(): DiscordBotMessage {
  return {
    embeds: [
      {
        title: "PartsRadarTW Discord bot 說明",
        color: DISCORD_EMBED_COLOR,
        description: [
          "**/watch**",
          "個人商品目標價追蹤。新增商品頁網址與目標價格後，價格達標時會私訊通知你，也可以集中查看目前追蹤狀態。",
          "",
          "**/price-report**",
          "個人價格報告。可以立即產生近期價格變動報告，也能設定每日私訊報告與篩選條件。",
          "",
          "**/public-report**",
          "伺服器公開價格報告。可設定固定頻道發送公開報告；只有具備「管理伺服器」權限的成員可以管理。",
        ].join("\n"),
      },
    ],
  };
}
