// apps/crawler/tests/scripts/ops/discord-bot/support-interactions-public-report.ts
// 建立公開價格報告設定與預覽測試用的 Discord interaction payload。
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";

// 建立 /public-report slash command interaction，含 guild/channel 與 app permission context。
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

// 建立公開報告設定面板上的 button interaction。
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

// 建立公開報告設定面板上的 string select interaction。
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

// 建立公開報告最多商品數 modal submit interaction。
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

// 建立公開報告商品關鍵字 modal submit interaction。
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
