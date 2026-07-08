// apps/crawler/tests/scripts/ops/discord-bot/support-interactions-price-report.ts
// 建立個人價格報告設定 modal 測試用 interaction payload。
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";

// 建立時間與最多商品數設定 modal submit interaction。
export function createSettingsModalSubmitInteraction({
  maxItems = "50",
  time = "09:00",
}: {
  maxItems?: string;
  time?: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "price-report:settings:time-limit-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "price-report:settings:max-items",
            value: maxItems,
          },
        },
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "price-report:settings:time",
            value: time,
          },
        },
      ],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

// 建立商品關鍵字設定 modal submit interaction。
export function createKeywordModalSubmitInteraction({
  keyword,
}: {
  keyword: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "price-report:settings:keyword-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "price-report:settings:keyword-input",
            value: keyword,
          },
        },
      ],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}
