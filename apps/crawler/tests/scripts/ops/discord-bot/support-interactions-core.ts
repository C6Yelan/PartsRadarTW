// apps/crawler/tests/scripts/ops/discord-bot/support-interactions-core.ts
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";

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
