// apps/crawler/tests/scripts/ops/discord-bot/support-interactions-public-report.ts
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";

export function createPublicReportInteraction({
  guildId = "guild-1",
  channelId = "999988887777666655",
  subcommandName = "manage",
  appPermissions = "18432",
}: {
  guildId?: string;
  channelId?: string;
  subcommandName?: "status" | "manage" | "test";
  appPermissions?: string;
} = {}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
    guild_id: guildId,
    channel_id: channelId,
    app_permissions: appPermissions,
    data: {
      name: "public-report",
      options: [
        {
          type: 1,
          name: subcommandName,
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

export function createPublicReportButtonInteraction(
  customId: string,
  {
    guildId = "guild-1",
    channelId = "999988887777666655",
    appPermissions = "18432",
  }: {
    guildId?: string;
    channelId?: string;
    appPermissions?: string;
  } = {},
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    guild_id: guildId,
    channel_id: channelId,
    app_permissions: appPermissions,
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

export function createPublicReportSelectInteraction(
  customId: string,
  values: string[],
  {
    guildId = "guild-1",
    channelId = "999988887777666655",
    appPermissions = "18432",
  }: {
    guildId?: string;
    channelId?: string;
    appPermissions?: string;
  } = {},
): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 3,
    guild_id: guildId,
    channel_id: channelId,
    app_permissions: appPermissions,
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

export function createPublicReportLimitModalSubmitInteraction({
  maxItems,
  guildId = "guild-1",
  channelId = "999988887777666655",
}: {
  maxItems: string;
  guildId?: string;
  channelId?: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    guild_id: guildId,
    channel_id: channelId,
    data: {
      custom_id: "public-report:limit-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "public-report:max-items",
            value: maxItems,
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

export function createPublicReportKeywordModalSubmitInteraction({
  keyword,
  guildId = "guild-1",
  channelId = "999988887777666655",
}: {
  keyword: string;
  guildId?: string;
  channelId?: string;
}): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 5,
    guild_id: guildId,
    channel_id: channelId,
    data: {
      custom_id: "public-report:keyword-modal",
      components: [
        {
          type: 18,
          component: {
            type: 4,
            custom_id: "public-report:keyword-input",
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
