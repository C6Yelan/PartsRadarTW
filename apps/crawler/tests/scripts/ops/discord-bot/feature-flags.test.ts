// apps/crawler/tests/scripts/ops/discord-bot/feature-flags.test.ts
import { describe, expect, it, vi } from "vitest";
import { runDiscordBotNotificationCycle } from "../../../../src/scripts/ops/discord-bot/daemon";
import { handleDiscordInteraction } from "../../../../src/scripts/ops/discord-bot/interactions";
import type { DiscordInteraction } from "../../../../src/scripts/ops/discord-bot/types";
import { CommandCooldowns } from "../../../../src/scripts/ops/discord-bot/cooldowns";
import {
  createDiscordBotClient,
  createDiscordBotOptions,
  createInteraction,
} from "./support";

describe("Discord bot feature flags", () => {
  it("skips disabled notification cycle work without reading or writing delivery state", async () => {
    const client = {
      discordTargetPriceWatch: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      discordPublicPriceReportSetting: {
        findMany: vi.fn(),
      },
      discordPublicPriceReportDelivery: {
        create: vi.fn(),
      },
      discordPriceReportSetting: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      discordNotificationDelivery: {
        create: vi.fn(),
      },
    };
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await runDiscordBotNotificationCycle({
      client: client as never,
      options: createDiscordBotOptions({
        publicReportsEnabled: false,
        personalReportsEnabled: false,
        targetWatchesEnabled: false,
      }),
      fetchImpl: fetchImpl as typeof fetch,
      logMessage: vi.fn(),
      scanIntervalMs: 300_000,
      nextTargetPriceScanAtMs: 0,
      now: new Date("2026-06-07T12:00:00.000Z"),
    });

    expect(result).toEqual({
      nextSleepMs: 300_000,
      nextTargetPriceScanAtMs: 0,
    });
    expect(client.discordTargetPriceWatch.findMany).not.toHaveBeenCalled();
    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    expect(client.discordPublicPriceReportSetting.findMany).not.toHaveBeenCalled();
    expect(client.discordPublicPriceReportDelivery.create).not.toHaveBeenCalled();
    expect(client.discordPriceReportSetting.findMany).not.toHaveBeenCalled();
    expect(client.discordPriceReportSetting.findFirst).not.toHaveBeenCalled();
    expect(client.discordNotificationDelivery.create).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns safe disabled responses for command surfaces", async () => {
    const client = createDiscordBotClient([]);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );
    const options = createDiscordBotOptions({
      publicReportsEnabled: false,
      personalReportsEnabled: false,
      targetWatchesEnabled: false,
    });

    await handleDiscordInteraction({
      client,
      options,
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createInteraction("now"),
    });
    await handleDiscordInteraction({
      client,
      options,
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createPublicReportInteraction("status"),
    });
    await handleDiscordInteraction({
      client,
      options,
      cooldowns: new CommandCooldowns(60),
      fetchImpl: fetchMock as typeof fetch,
      interaction: createWatchInteraction(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(responseContent(fetchMock, 0)).toBe("個人價格報告目前已由維運暫停。");
    expect(responseContent(fetchMock, 1)).toBe("公開價格報告目前已由維運暫停。");
    expect(responseContent(fetchMock, 2)).toBe("目標價提醒目前已由維運暫停。");
    expect(client.discordPriceReportSetting.findUnique).not.toHaveBeenCalled();
    expect(client.discordPublicPriceReportSetting.findUnique).not.toHaveBeenCalled();
    expect(client.discordTargetPriceWatch.findMany).not.toHaveBeenCalled();
  });
});

function createPublicReportInteraction(subcommandName: string): DiscordInteraction {
  return {
    id: "interaction-1",
    token: "interaction-token",
    type: 2,
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
    guild_id: "guild-1",
    channel_id: "channel-1",
  };
}

function createWatchInteraction(): DiscordInteraction {
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

function responseContent(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string {
  const body = JSON.parse(String((fetchMock.mock.calls[callIndex]?.[1] as RequestInit).body));

  expect(body).toMatchObject({
    type: 4,
    data: {
      flags: 64,
    },
  });

  return body.data.content;
}
