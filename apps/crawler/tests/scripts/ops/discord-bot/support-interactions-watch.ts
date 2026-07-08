// apps/crawler/tests/scripts/ops/discord-bot/support-interactions-watch.ts
// 建立 /watch 指令與目標價管理面板測試用的 Discord interaction payload。
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";

// 建立 /watch slash command interaction。
export function createWatchOpenInteraction(): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
    data: {
      name: "watch",
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

// 建立新增目標價 watch 的 modal submit interaction。
export function createTargetPriceWatchModalSubmitInteraction({
  productInput,
  targetPrice,
}: {
  productInput: string;
  targetPrice: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: "watch:create-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "watch:product",
            value: productInput,
          },
        },
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "watch:target-price",
            value: targetPrice,
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

// 建立 watch 管理面板上的 button interaction。
export function createWatchButtonInteraction(customId: string): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: customId,
      component_type: 2,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

// 建立選取單筆 watch 的 string select interaction。
export function createWatchSelectInteraction(
  targetPriceWatchInput: string,
  page: number,
  statusFilter = "all",
  sortKey = "recent",
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: `watch:select:${page}:${statusFilter}:${sortKey}`,
      component_type: 3,
      values: [targetPriceWatchInput],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

// 建立批次移除 watch 的 string select interaction。
export function createWatchBulkRemoveSelectInteraction(
  targetPriceWatchInputs: string[],
  page: number,
  statusFilter = "all",
  sortKey = "recent",
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: `watch:bulk-remove-select:${page}:${statusFilter}:${sortKey}`,
      component_type: 3,
      values: targetPriceWatchInputs,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

// 建立 watch 篩選或排序 select interaction。
export function createWatchStateSelectInteraction(
  customId: string,
  value: string,
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: customId,
      component_type: 3,
      values: [value],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

// 建立編輯目標價 watch 的 modal submit interaction。
export function createWatchEditModalSubmitInteraction({
  watchId,
  targetPrice,
  page,
  statusFilter = "all",
  sortKey = "recent",
}: {
  watchId: string;
  targetPrice: string;
  page: number;
  statusFilter?: string;
  sortKey?: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    data: {
      custom_id: `watch:edit-modal:${watchId}:${page}:${statusFilter}:${sortKey}`,
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "watch:target-price",
            value: targetPrice,
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
