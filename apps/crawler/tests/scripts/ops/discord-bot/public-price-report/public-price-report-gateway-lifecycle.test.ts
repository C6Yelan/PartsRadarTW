// 驗證 Discord Guild/Channel lifecycle 只在永久移除事件停用公開報告設定。

import { describe, expect, it, vi } from "vitest";
import {
  handleDiscordGuildLifecycleEvent,
  reconcileDiscordGuildAvailability,
} from "../../../../../src/scripts/ops/discord-bot/gateway";
import { createDiscordBotClient } from "../support/client";
import { publicPriceReportSetting } from "../support/data-factories";

describe("public price report gateway lifecycle", () => {
  it("does not disable a temporarily unavailable Guild", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [publicPriceReportSetting({ id: "setting-1" })],
    });
    const unavailableGuildIds = new Set<string>();
    const onDisabled = vi.fn();

    await handleDiscordGuildLifecycleEvent({
      client,
      eventType: "GUILD_DELETE",
      data: { id: "guild-1", unavailable: true },
      unavailableGuildIds,
      onPublicReportAccessDisabled: onDisabled,
    });

    expect(unavailableGuildIds.has("guild-1")).toBe(true);
    expect(client.discordPublicPriceReportSetting.updateMany).not.toHaveBeenCalled();
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it("disables a removed Guild once", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [publicPriceReportSetting({ id: "setting-1" })],
    });
    const onDisabled = vi.fn();
    const input = {
      client,
      eventType: "GUILD_DELETE" as const,
      data: { id: "guild-1", unavailable: false },
      unavailableGuildIds: new Set<string>(),
      onPublicReportAccessDisabled: onDisabled,
      now: new Date("2026-07-23T10:00:00.000Z"),
    };

    await handleDiscordGuildLifecycleEvent(input);
    await handleDiscordGuildLifecycleEvent(input);

    expect(onDisabled).toHaveBeenCalledTimes(1);
    expect(onDisabled).toHaveBeenCalledWith(
      expect.objectContaining({
        accessStatus: "DISABLED_BOT_REMOVED",
        providerErrorCode: null,
      }),
    );
    expect(client.discordPublicPriceReportSetting.updateMany).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
        accessStatus: "ACTIVE",
      },
      data: expect.objectContaining({
        enabled: false,
        accessStatus: "DISABLED_BOT_REMOVED",
        disabledAt: new Date("2026-07-23T10:00:00.000Z"),
        purgeAfter: new Date("2026-09-21T10:00:00.000Z"),
      }),
    });
  });

  it("treats a GUILD_DELETE without unavailable as bot removal", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [publicPriceReportSetting({ id: "setting-1" })],
    });
    const onDisabled = vi.fn();

    await handleDiscordGuildLifecycleEvent({
      client,
      eventType: "GUILD_DELETE",
      data: { id: "guild-1" },
      unavailableGuildIds: new Set<string>(),
      onPublicReportAccessDisabled: onDisabled,
    });

    expect(onDisabled).toHaveBeenCalledWith(
      expect.objectContaining({
        accessStatus: "DISABLED_BOT_REMOVED",
      }),
    );
  });

  it("disables only the deleted Channel setting", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [
        publicPriceReportSetting({ id: "setting-1", channelId: "channel-1" }),
        publicPriceReportSetting({
          id: "setting-2",
          discordGuildId: "guild-2",
          channelId: "channel-2",
        }),
      ],
    });
    const onDisabled = vi.fn();

    await handleDiscordGuildLifecycleEvent({
      client,
      eventType: "CHANNEL_DELETE",
      data: { id: "channel-1", guild_id: "guild-1" },
      unavailableGuildIds: new Set<string>(),
      onPublicReportAccessDisabled: onDisabled,
    });

    expect(onDisabled).toHaveBeenCalledTimes(1);
    expect(onDisabled).toHaveBeenCalledWith(
      expect.objectContaining({
        setting: expect.objectContaining({ id: "setting-1" }),
        accessStatus: "DISABLED_CHANNEL_GONE",
        providerErrorCode: null,
      }),
    );
  });

  it("marks a Guild available without re-enabling its setting", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "setting-1",
          accessStatus: "DISABLED_BOT_REMOVED",
        }),
      ],
    });
    const unavailableGuildIds = new Set(["guild-1"]);

    await handleDiscordGuildLifecycleEvent({
      client,
      eventType: "GUILD_CREATE",
      data: { id: "guild-1" },
      unavailableGuildIds,
      onPublicReportAccessDisabled: vi.fn(),
    });

    expect(unavailableGuildIds.has("guild-1")).toBe(false);
    expect(client.discordPublicPriceReportSetting.updateMany).not.toHaveBeenCalled();
  });

  it("moves a manually paused setting into definitive removal retention once", async () => {
    const client = createDiscordBotClient({
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "setting-1",
          enabled: false,
        }),
      ],
    });
    const onDisabled = vi.fn();

    const input = {
      client,
      eventType: "GUILD_DELETE" as const,
      data: { id: "guild-1", unavailable: false },
      unavailableGuildIds: new Set<string>(),
      onPublicReportAccessDisabled: onDisabled,
      now: new Date("2026-07-23T10:00:00.000Z"),
    };

    await handleDiscordGuildLifecycleEvent(input);
    await handleDiscordGuildLifecycleEvent(input);

    expect(client.discordPublicPriceReportSetting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accessStatus: "ACTIVE",
        }),
      }),
    );
    expect(client.discordPublicPriceReportSetting.updateMany).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
        accessStatus: "ACTIVE",
      },
      data: expect.objectContaining({
        enabled: false,
        accessStatus: "DISABLED_BOT_REMOVED",
        disabledAt: new Date("2026-07-23T10:00:00.000Z"),
        purgeAfter: new Date("2026-09-21T10:00:00.000Z"),
      }),
    });
    expect(onDisabled).toHaveBeenCalledTimes(1);
  });

  it("rebuilds unavailable Guilds from each READY payload", () => {
    const unavailableGuildIds = new Set(["stale-guild"]);

    reconcileDiscordGuildAvailability(
      {
        guilds: [
          { id: "available-guild", unavailable: false },
          { id: "unavailable-guild", unavailable: true },
        ],
      },
      unavailableGuildIds,
    );

    expect([...unavailableGuildIds]).toEqual(["unavailable-guild"]);

    reconcileDiscordGuildAvailability(
      {
        guilds: [{ id: "available-guild" }],
      },
      unavailableGuildIds,
    );

    expect(unavailableGuildIds.size).toBe(0);
  });
});
