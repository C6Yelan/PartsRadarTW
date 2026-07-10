// apps/crawler/tests/scripts/ops/discord-bot/scheduled-price-report-delivery.test.ts
// 驗證個人排程價格報告會到期送出、記錄 delivery、推進 cursor 與下一次發送時間。

import { describe, expect, it, vi } from "vitest";
import { sendDueScheduledPriceReports } from "../../../../src/scripts/ops/discord-bot/price-report";
import type { DiscordBotMessage } from "../../../../src/scripts/ops/discord-bot/types";

import { createDiscordBotClient, PUBLIC_BASE_URL, priceReportSetting, snapshot } from "./support";

describe("scheduled price report delivery", () => {
  it("sends due scheduled daily reports by DM and advances the next run", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "old-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "old-run",
          price: 12000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueScheduledPriceReports({
        client,
        options: {
          publicBaseUrl: PUBLIC_BASE_URL,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      processedCount: 1,
      sentCount: 1,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendDirectMessages).toHaveBeenCalledWith(
      "111122223333444455",
      expect.arrayContaining([
        expect.objectContaining({
          embeds: [expect.objectContaining({ title: "PartsRadarTW 價格報告 - 價格變動" })],
        }),
      ]),
    );
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordUserId: "111122223333444455",
        kind: "SCHEDULED_PRICE_REPORT",
        status: "SENT",
      }),
    });
    expect(client.discordPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
      },
      data: {
        lastSentAt: new Date("2026-06-07T05:00:00.000Z"),
        notificationCursorAt: new Date("2026-06-07T05:00:00.000Z"),
        nextSendAt: new Date("2026-06-08T04:59:00.000Z"),
      },
    });
  });

  it("does not backfill scheduled reports before the setting cursor", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "old-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "old-run",
          price: 12000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
          notificationCursorAt: new Date("2026-06-07T04:00:00.000Z"),
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueScheduledPriceReports({
        client,
        options: {
          publicBaseUrl: PUBLIC_BASE_URL,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      processedCount: 1,
      sentCount: 1,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(JSON.stringify(sendDirectMessages.mock.calls[0]?.[1])).not.toContain("GPU A");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordUserId: "111122223333444455",
        kind: "SCHEDULED_PRICE_REPORT",
        status: "SENT",
        itemCount: 0,
      }),
    });
    expect(client.discordPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
      },
      data: {
        lastSentAt: new Date("2026-06-07T05:00:00.000Z"),
        notificationCursorAt: new Date("2026-06-07T05:00:00.000Z"),
        nextSendAt: new Date("2026-06-08T04:59:00.000Z"),
      },
    });
  });

  it("keeps the configured daily send time when advancing scheduled reports", async () => {
    const client = createDiscordBotClient(
      [
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T01:30:00.000Z"),
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await sendDueScheduledPriceReports({
      client,
      options: {
        publicBaseUrl: PUBLIC_BASE_URL,
      },
      now: new Date("2026-06-07T05:00:00.000Z"),
      sendDirectMessages,
    });

    expect(client.discordPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
      },
      data: {
        lastSentAt: new Date("2026-06-07T05:00:00.000Z"),
        notificationCursorAt: new Date("2026-06-07T05:00:00.000Z"),
        nextSendAt: new Date("2026-06-08T01:30:00.000Z"),
      },
    });
  });
});
