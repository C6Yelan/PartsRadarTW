// apps/crawler/tests/scripts/ops/discord-bot/public-price-report/public-price-report-scheduler-delivery.test.ts
// 驗證公開價格報告排程會發送待處理 crawl run、記錄 delivery，並遵守設定 cursor。

import { describe, expect, it, vi } from "vitest";
import { sendPendingPublicPriceReports } from "../../../../../src/scripts/ops/discord-bot/public-price-report";
import type { DiscordBotMessage } from "../../../../../src/scripts/ops/discord-bot/types";
import { createDiscordBotClient } from "../support/client";
import {
  crawlRun,
  publicPriceReportDelivery,
  publicPriceReportSetting,
  snapshot,
} from "../support/data-factories";
import { createDiscordBotOptions } from "../support/options";

describe("public price report scheduler delivery", () => {
  it("sends pending public price reports to the configured channel", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "old-public-1",
          productId: "product-public-1",
          productName: "華碩 GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-public-1",
          productId: "product-public-1",
          productName: "華碩 GPU A",
          crawlRunId: "public-run-1",
          price: 10_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      crawlRuns: [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-1" })],
    });
    const sendChannelMessages = vi.fn(
      async (_channelId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
        ...ACTIVE_ACCESS_DEPENDENCIES,
      }),
    ).resolves.toEqual({
      settingCount: 1,
      processedCount: 1,
      sentCount: 1,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    });

    expect(sendChannelMessages).toHaveBeenCalledWith(
      "999988887777666655",
      expect.arrayContaining([
        expect.objectContaining({
          embeds: [
            expect.objectContaining({
              title: "PartsRadarTW 公開價格報告 - 價格變動",
              description: expect.stringContaining("GPU A"),
            }),
          ],
        }),
      ]),
    );
    expect(client.discordPublicPriceReportDelivery.upsert).toHaveBeenCalledWith({
      where: {
        crawlRunId_channelId: {
          crawlRunId: "public-run-1",
          channelId: "999988887777666655",
        },
      },
      create: expect.objectContaining({
        crawlRunId: "public-run-1",
        channelId: "999988887777666655",
        status: "SENT",
        itemCount: 1,
        messageCount: 1,
        deliveredAt: new Date("2026-06-07T05:00:00.000Z"),
      }),
      update: expect.objectContaining({
        status: "SENT",
        itemCount: 1,
        messageCount: 1,
        deliveredAt: new Date("2026-06-07T05:00:00.000Z"),
      }),
    });
  });

  it("stores public rate limits as structured fields without concatenated technical details", async () => {
    const legacyDelivery = publicPriceReportDelivery({
      id: "legacy-public-delivery",
      crawlRunId: "public-run-rate-limit",
      channelId: "999988887777666655",
      status: "FAILED",
      errorMessage: "legacy provider body DISCORD_BOT_TOKEN=legacy-private-token",
    });
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "old-public-rate-limit",
          productId: "product-public-rate-limit",
          productName: "華碩 GPU Rate Limit",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-public-rate-limit",
          productId: "product-public-rate-limit",
          productName: "華碩 GPU Rate Limit",
          crawlRunId: "public-run-rate-limit",
          price: 10_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      publicPriceReportDeliveries: [legacyDelivery],
      crawlRuns: [
        crawlRun({
          id: "public-run-rate-limit",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [publicPriceReportSetting({ id: "public-setting-rate-limit" })],
    });
    const sendChannelMessages = vi.fn(
      async (_channelId: string, _messages: DiscordBotMessage[]) => ({
        status: "rate_limited" as const,
        messageCount: 2,
        sentMessageCount: 1,
        httpStatus: 429 as const,
        errorCategory: "RATE_LIMITED" as const,
        providerErrorCode: null,
        retryAfterMs: 2500,
        global: true,
        rawTechnicalSummary:
          "sentMessages=1/2 retryAfterMs=2500 global=yes DISCORD_BOT_TOKEN=private-token",
      }),
    );

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
        ...ACTIVE_ACCESS_DEPENDENCIES,
      }),
    ).resolves.toMatchObject({
      processedCount: 1,
      rateLimitedCount: 1,
      failedCount: 0,
    });

    expect(client.discordPublicPriceReportDelivery.upsert).toHaveBeenCalledWith({
      where: {
        crawlRunId_channelId: {
          crawlRunId: "public-run-rate-limit",
          channelId: "999988887777666655",
        },
      },
      create: expect.objectContaining({
        status: "RATE_LIMITED",
        errorCategory: "RATE_LIMITED",
        errorMessage: null,
        httpStatus: 429,
        providerErrorCode: null,
      }),
      update: expect.objectContaining({
        status: "RATE_LIMITED",
        errorCategory: "RATE_LIMITED",
        errorMessage: null,
        httpStatus: 429,
        providerErrorCode: null,
      }),
    });
    const upsert = client.discordPublicPriceReportDelivery.upsert.mock.calls[0]?.[0];

    expect(upsert?.update).toHaveProperty("errorMessage", null);
    expect(legacyDelivery.errorMessage).toBeNull();
    const persisted = JSON.stringify(client.discordPublicPriceReportDelivery.upsert.mock.calls);

    expect(persisted).not.toContain("sentMessages");
    expect(persisted).not.toContain("retryAfterMs");
    expect(persisted).not.toContain("global=yes");
    expect(persisted).not.toContain("private-token");
    expect(client.discordPublicPriceReportSetting.updateMany).toHaveBeenCalledWith({
      where: {
        id: "public-setting-rate-limit",
        accessStatus: "ACTIVE",
      },
      data: {
        lastDiscordErrorCode: null,
        lastAccessCheckedAt: new Date("2026-06-07T05:00:00.000Z"),
        consecutiveAccessFailures: {
          increment: 1,
        },
        retryNotBefore: new Date("2026-06-07T05:00:02.500Z"),
      },
    });
  });

  it("sends pending public reports for new products when enabled", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "new-public-product-1",
          productId: "product-public-new-1",
          productName: "華碩 RTX 5090 新品顯示卡",
          crawlRunId: "public-run-1",
          price: 99_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      crawlRuns: [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "public-setting-1",
          includeNewProducts: true,
        }),
      ],
    });
    const sendChannelMessages = vi.fn(
      async (_channelId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
        ...ACTIVE_ACCESS_DEPENDENCIES,
      }),
    ).resolves.toMatchObject({
      settingCount: 1,
      processedCount: 1,
      sentCount: 1,
    });

    const reportText = JSON.stringify(sendChannelMessages.mock.calls[0]?.[1]);

    expect(reportText).toContain("PartsRadarTW 公開價格報告 - 新增商品");
    expect(reportText).toContain("RTX 5090 新品顯示卡");
    expect(client.discordPublicPriceReportDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          itemCount: 1,
        }),
      }),
    );
  });

  it("does not backfill public reports from crawl runs before the setting cursor", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "old-public-1",
          productId: "product-public-1",
          productName: "華碩 GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-public-1",
          productId: "product-public-1",
          productName: "華碩 GPU A",
          crawlRunId: "public-run-1",
          price: 10_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      crawlRuns: [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "public-setting-1",
          notificationCursorAt: new Date("2026-06-07T04:00:00.000Z"),
        }),
      ],
    });
    const sendChannelMessages = vi.fn();

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
        ...ACTIVE_ACCESS_DEPENDENCIES,
      }),
    ).resolves.toEqual({
      settingCount: 1,
      processedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    });

    expect(sendChannelMessages).not.toHaveBeenCalled();
    expect(client.discordPublicPriceReportDelivery.upsert).not.toHaveBeenCalled();
  });

  it("disables a setting after 50001 is confirmed as Unknown Guild and does not retry it", async () => {
    const client = createDiscordBotClient({
      snapshots: publicReportPriceChangeSnapshots("public-run-removed"),
      crawlRuns: [crawlRun({ id: "public-run-removed" })],
      publicPriceReportSettings: [publicPriceReportSetting({ id: "setting-removed" })],
    });
    const sendChannelMessages = vi.fn(async () => ({
      status: "failed" as const,
      messageCount: 1,
      sentMessageCount: 0,
      errorCategory: "PERMISSIONS" as const,
      httpStatus: 403,
      providerErrorCode: 50001,
    }));
    const probeAccess = vi.fn(async () => ({
      status: "unavailable" as const,
      resource: "guild" as const,
      result: {
        status: "failed" as const,
        errorCategory: "PROVIDER" as const,
        httpStatus: 404,
        providerErrorCode: 10004,
      },
    }));
    const onAccessDisabled = vi.fn();
    const input = {
      client,
      options: createDiscordBotOptions(),
      now: new Date("2026-07-23T10:00:00.000Z"),
      sendChannelMessages,
      probeAccess,
      onAccessDisabled,
    };

    await sendPendingPublicPriceReports(input);
    await sendPendingPublicPriceReports(input);

    expect(sendChannelMessages).toHaveBeenCalledTimes(1);
    expect(probeAccess).toHaveBeenCalledTimes(1);
    expect(onAccessDisabled).toHaveBeenCalledTimes(1);
    expect(onAccessDisabled).toHaveBeenCalledWith(
      expect.objectContaining({
        accessStatus: "DISABLED_BOT_REMOVED",
        providerErrorCode: 10004,
      }),
    );
    expect(client.discordPublicPriceReportSetting.updateMany).toHaveBeenCalledWith({
      where: {
        id: "setting-removed",
        enabled: true,
        accessStatus: "ACTIVE",
      },
      data: expect.objectContaining({
        enabled: false,
        accessStatus: "DISABLED_BOT_REMOVED",
      }),
    });
  });

  it("aborts remaining Guilds after a global authentication failure", async () => {
    const client = createDiscordBotClient({
      snapshots: publicReportPriceChangeSnapshots("public-run-auth"),
      crawlRuns: [crawlRun({ id: "public-run-auth" })],
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "setting-a",
          discordGuildId: "guild-a",
          channelId: "channel-a",
        }),
        publicPriceReportSetting({
          id: "setting-b",
          discordGuildId: "guild-b",
          channelId: "channel-b",
        }),
      ],
    });
    const sendChannelMessages = vi.fn(async () => ({
      status: "failed" as const,
      messageCount: 1,
      sentMessageCount: 0,
      errorCategory: "PROVIDER" as const,
      httpStatus: 401,
      providerErrorCode: 50014,
    }));

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-07-23T10:00:00.000Z"),
        sendChannelMessages,
        ...ACTIVE_ACCESS_DEPENDENCIES,
      }),
    ).resolves.toMatchObject({
      settingCount: 2,
      processedCount: 1,
      failedCount: 1,
      globalAuthFailed: true,
    });

    expect(sendChannelMessages).toHaveBeenCalledTimes(1);
    expect(client.discordPublicPriceReportSetting.updateMany).not.toHaveBeenCalled();
  });

  it("continues delivering other Guilds after one Channel is permanently gone", async () => {
    const client = createDiscordBotClient({
      snapshots: publicReportPriceChangeSnapshots("public-run-multi"),
      crawlRuns: [crawlRun({ id: "public-run-multi" })],
      publicPriceReportSettings: [
        publicPriceReportSetting({
          id: "setting-a",
          discordGuildId: "guild-a",
          channelId: "channel-a",
        }),
        publicPriceReportSetting({
          id: "setting-b",
          discordGuildId: "guild-b",
          channelId: "channel-b",
        }),
      ],
    });
    const sendChannelMessages = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failed",
        messageCount: 1,
        sentMessageCount: 0,
        errorCategory: "PROVIDER",
        httpStatus: 404,
        providerErrorCode: 10003,
      })
      .mockResolvedValueOnce({
        status: "sent",
        messageCount: 1,
        httpStatuses: [200],
      });

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-07-23T10:00:00.000Z"),
        sendChannelMessages,
        ...ACTIVE_ACCESS_DEPENDENCIES,
      }),
    ).resolves.toMatchObject({
      settingCount: 2,
      processedCount: 2,
      failedCount: 1,
      sentCount: 1,
    });

    expect(sendChannelMessages).toHaveBeenNthCalledWith(1, "channel-a", expect.any(Array));
    expect(sendChannelMessages).toHaveBeenNthCalledWith(2, "channel-b", expect.any(Array));
  });

  it("does not send or recreate metadata when the guild setting disappears before transport", async () => {
    const client = createDiscordBotClient({
      snapshots: publicReportPriceChangeSnapshots("public-run-race"),
      crawlRuns: [crawlRun({ id: "public-run-race" })],
      publicPriceReportSettings: [publicPriceReportSetting({ id: "setting-race" })],
    });
    client.discordPublicPriceReportSetting.findFirst.mockResolvedValueOnce(null);
    const sendChannelMessages = vi.fn();

    await sendPendingPublicPriceReports({
      client,
      options: createDiscordBotOptions(),
      now: new Date("2026-07-23T10:00:00.000Z"),
      sendChannelMessages,
      ...ACTIVE_ACCESS_DEPENDENCIES,
    });

    expect(sendChannelMessages).not.toHaveBeenCalled();
    expect(client.discordPublicPriceReportDelivery.upsert).not.toHaveBeenCalled();
  });
});

const ACTIVE_ACCESS_DEPENDENCIES = {
  probeAccess: async () => ({ status: "accessible" as const }),
  onAccessDisabled: vi.fn(),
};

function publicReportPriceChangeSnapshots(crawlRunId: string) {
  return [
    snapshot({
      id: `${crawlRunId}-old`,
      productId: `${crawlRunId}-product`,
      productName: "公開報告測試商品",
      crawlRunId: "old-run",
      price: 12_000,
      capturedAt: "2026-07-22T03:00:00.000Z",
    }),
    snapshot({
      id: `${crawlRunId}-new`,
      productId: `${crawlRunId}-product`,
      productName: "公開報告測試商品",
      crawlRunId,
      price: 10_000,
      capturedAt: "2026-07-23T03:00:00.000Z",
    }),
  ];
}
