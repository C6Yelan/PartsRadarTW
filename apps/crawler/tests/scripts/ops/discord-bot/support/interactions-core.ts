// apps/crawler/tests/scripts/ops/discord-bot/support/interactions-core.ts
// 建立 Discord bot 測試共用的基本 interaction payload。
import type { DiscordInteraction } from "../../../../../src/scripts/ops/discord-bot/types";

// 建立個人價格報告 slash command interaction，預設使用測試使用者。
export function createInteraction(
  subcommandName: string,
  subcommandOptions: NonNullable<NonNullable<DiscordInteraction["data"]>["options"]> = [],
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
    data: {
      name: "price-report",
      options: [
        {
          type: 1,
          name: subcommandName,
          options: subcommandOptions,
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

// 建立 /bot help slash command interaction。
export function createBotHelpInteraction(): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
    data: {
      name: "bot",
      options: [
        {
          type: 1,
          name: "help",
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

// 建立 button component interaction。
export function createComponentInteraction(customId: string): DiscordInteraction {
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

// 建立 string select component interaction。
export function createSelectComponentInteraction(
  customId: string,
  values: string[],
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    data: {
      custom_id: customId,
      component_type: 3,
      values,
    },
    member: {
      user: {
        id: "111122223333444455",
      },
    },
  };
}
