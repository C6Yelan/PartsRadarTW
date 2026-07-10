// apps/crawler/tests/scripts/ops/discord-bot/support-interactions-price-report.ts
// 建立個人價格報告設定 modal 測試用 interaction payload。
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";

// 建立每日發送時間設定 modal submit interaction。
export function createSettingsModalSubmitInteraction({
  time = "09:00",
}: {
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
  keywords,
}: {
  keywords: string[];
}): DiscordInteraction {
  const customIds = [
    "price-report:settings:keyword-input",
    "price-report:settings:keyword-input:2",
    "price-report:settings:keyword-input:3",
    "price-report:settings:keyword-input:4",
    "price-report:settings:keyword-input:5",
  ];

  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "price-report:settings:keyword-modal",
      components: customIds.map((customId, index) => ({
        type: 18,
        component: {
          type: 4,
          custom_id: customId,
          value: keywords[index] ?? "",
        },
      })),
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}
