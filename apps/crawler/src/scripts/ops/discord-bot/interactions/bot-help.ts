// apps/crawler/src/scripts/ops/discord-bot/interactions/bot-help.ts
// 組裝 /bot help 回覆訊息，提供 Discord 使用者可見的 bot 功能摘要。

import { DISCORD_EMBED_COLOR } from "../constants";
import type { DiscordBotMessage } from "../types";

// 建立 Discord bot 說明 embed，依任務與使用範圍列出主要 slash command。
export function createBotHelpMessage(): DiscordBotMessage {
  return {
    embeds: [
      {
        title: "PartsRadarTW Discord bot 說明",
        color: DISCORD_EMBED_COLOR,
        description: [
          "**目標價提醒｜`/watch`**",
          "貼上商品頁網址並設定目標價；可查看、編輯或單筆移除追蹤。價格達標時會嘗試透過 DM 傳送目標價提醒，管理清單只會回覆給你。",
          "",
          "**即時價格報告｜`/price-report now`**",
          "在目前伺服器頻道或 DM 取得近期價格變動；可選 6、12 或 24 小時統計區間。",
          "",
          "**每日私訊價格報告｜`/price-report settings`**",
          "設定每日台北時間、分類、關鍵字與內容；報告與預覽會傳到你的 DM，請先確認允許 bot 私訊。",
          "",
          "**公開價格報告｜`/public-report status/manage/test`**",
          "只限伺服器使用。具備「管理伺服器」權限的成員可設定固定頻道；bot 在該頻道需要「傳送訊息」與「嵌入連結」權限。",
          "",
          "**DM、伺服器與權限**",
          "`/watch` 與 `/price-report` 可在 DM 或伺服器使用；個人追蹤清單、目標價提醒與每日私訊價格報告不會公開到伺服器頻道。",
        ].join("\n"),
      },
    ],
  };
}
