// apps/crawler/tests/scripts/ops/discord-bot/support-interactions-watch.ts
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";

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

export function createWatchModalSubmitInteraction({
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

export function createWatchSelectInteraction(
  watchInput: string,
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
      values: [watchInput],
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

export function createWatchBulkRemoveSelectInteraction(
  watchInputs: string[],
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
      values: watchInputs,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}

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
