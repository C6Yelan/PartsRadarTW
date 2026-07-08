// apps/crawler/tests/scripts/ops/discord-bot/public-price-report-scheduler-delivery.test.ts
// 驗證公開價格報告排程會發送待處理 crawl run、記錄 delivery，並遵守設定 cursor。

import { describe, expect, it, vi } from "vitest";
import { sendPendingPublicPriceReports } from "../../../../src/scripts/ops/discord-bot/public-price-report";
import type { DiscordBotMessage } from "../../../../src/scripts/ops/discord-bot/types";
import {
  crawlRun,
  createDiscordBotClient,
  createDiscordBotOptions,
  publicPriceReportSetting,
  snapshot,
  TEST_SOURCE_CATEGORIES,
} from "./support";

describe("public price report scheduler delivery", () => {
  it("sends pending public price reports to the configured channel", async () => {
    const client = createDiscordBotClient(
      [
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
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      [publicPriceReportSetting({ id: "public-setting-1" })],
    );
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
      }),
    ).resolves.toEqual({
      settingCount: 1,
      processedCount: 1,
      sentCount: 1,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
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

  it("sends pending public reports for new products when enabled", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "new-public-product-1",
          productId: "product-public-new-1",
          productName: "華碩 RTX 5090 新品顯示卡",
          crawlRunId: "public-run-1",
          price: 99_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      [
        publicPriceReportSetting({
          id: "public-setting-1",
          includeNewProducts: true,
        }),
      ],
    );
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
    const client = createDiscordBotClient(
      [
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
      [],
      [],
      [...TEST_SOURCE_CATEGORIES],
      [],
      [],
      [
        crawlRun({
          id: "public-run-1",
          finishedAt: new Date("2026-06-07T03:05:00.000Z"),
        }),
      ],
      [
        publicPriceReportSetting({
          id: "public-setting-1",
          notificationCursorAt: new Date("2026-06-07T04:00:00.000Z"),
        }),
      ],
    );
    const sendChannelMessages = vi.fn();

    await expect(
      sendPendingPublicPriceReports({
        client,
        options: createDiscordBotOptions(),
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendChannelMessages,
      }),
    ).resolves.toEqual({
      settingCount: 1,
      processedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendChannelMessages).not.toHaveBeenCalled();
    expect(client.discordPublicPriceReportDelivery.upsert).not.toHaveBeenCalled();
  });
});
