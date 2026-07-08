// apps/crawler/tests/scripts/ops/discord-bot/scheduled-price-report-retry.test.ts
// 驗證個人排程價格報告在發送失敗或 Discord 限流後會保留 cursor 並安排短時間重試。

import { describe, expect, it, vi } from "vitest";
import { sendDueScheduledPriceReports } from "../../../../src/scripts/ops/discord-bot/price-report";
import type { DiscordBotMessage } from "../../../../src/scripts/ops/discord-bot/types";

import { createDiscordBotClient, priceReportSetting, PUBLIC_BASE_URL, snapshot } from "./support";

describe("scheduled price report retry", () => {
  it("retries scheduled reports soon after a failed delivery", async () => {
    const lastSentAt = new Date("2026-06-06T05:00:00.000Z");
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
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
          lastSentAt,
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "failed" as const,
        messageCount: 1,
        sentMessageCount: 0,
        httpStatus: 400,
        message: "MAX_EMBED_SIZE_EXCEEDED",
      }),
    );

    await expect(
      sendDueScheduledPriceReports({
        client,
        options: {
          publicBaseUrl: PUBLIC_BASE_URL,
          priceReportMaxItems: 50,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      processedCount: 1,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 1,
    });

    expect(client.discordPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
      },
      data: {
        lastSentAt,
        nextSendAt: new Date("2026-06-07T05:10:00.000Z"),
      },
    });
  });

  it("retries scheduled reports soon after rate limits", async () => {
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
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
        }),
      ],
    );
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "rate_limited" as const,
        messageCount: 1,
        sentMessageCount: 0,
        retryAfterMs: 60_000,
        global: false,
      }),
    );

    await expect(
      sendDueScheduledPriceReports({
        client,
        options: {
          publicBaseUrl: PUBLIC_BASE_URL,
          priceReportMaxItems: 50,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({
      processedCount: 1,
      sentCount: 0,
      rateLimitedCount: 1,
      failedCount: 0,
    });

    expect(client.discordPriceReportSetting.update).toHaveBeenCalledWith({
      where: {
        id: "setting-1",
      },
      data: {
        lastSentAt: null,
        nextSendAt: new Date("2026-06-07T05:10:00.000Z"),
      },
    });
  });
});
