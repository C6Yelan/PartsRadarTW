// apps/crawler/src/scripts/ops/discord-bot/interactions/bot-help.ts
// 組裝 /bot help 回覆訊息，提供 Discord 使用者可見的 bot 功能摘要。

import {
  DISCORD_BUTTON_STYLE_LINK,
  DISCORD_COMPONENT_TYPE_ACTION_ROW,
  DISCORD_COMPONENT_TYPE_BUTTON,
  DISCORD_EMBED_COLOR,
} from "../constants";
import type { DiscordBotMessage } from "../types";

// 建立 Discord bot 說明 embed，依任務與使用範圍列出主要 slash command。
export function createBotHelpMessage(publicBaseUrl: string): DiscordBotMessage {
  return {
    embeds: [
      {
        title: "PartsRadarTW 使用說明",
        color: DISCORD_EMBED_COLOR,
        description: "選擇你想完成的事情，再使用對應指令。所有設定面板只會顯示給操作者。",
        fields: [
          {
            name: "追蹤商品目標價",
            value: "`/watch`\n價格降到你設定的金額時，bot 會嘗試透過私訊提醒你。",
          },
          {
            name: "查看價格變動",
            value: "`/price-report now`\n立即查看最近 6、12 或 24 小時的降價、漲價與新增商品。",
          },
          {
            name: "設定每日私訊",
            value: "`/price-report settings`\n設定每天的發送時間、分類、內容與商品名稱關鍵字。",
          },
          {
            name: "伺服器公開報告",
            value:
              "`/public-report settings`\n需要「管理伺服器」權限。設定公開頻道、分類、內容與測試發送。",
          },
          {
            name: "可使用的位置",
            value:
              "`/watch` 與 `/price-report` 可在私訊或伺服器使用。`/public-report settings` 只在伺服器使用。",
          },
        ],
      },
    ],
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE_BUTTON,
            style: DISCORD_BUTTON_STYLE_LINK,
            label: "查看完整使用教學",
            url: new URL("/discord", publicBaseUrl).toString(),
          },
        ],
      },
    ],
  };
}
