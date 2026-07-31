// apps/crawler/tests/scripts/ops/discord-bot/scheduled-price-report/scheduled-price-report-retry.test.ts
// 驗證個人排程價格報告會持久化有界 retry、終止狀態與 claim。

import { describe, expect, it, vi } from "vitest";
import { sendDueScheduledPriceReports } from "../../../../../src/scripts/ops/discord-bot/price-report";
import type { DiscordBotMessage } from "../../../../../src/scripts/ops/discord-bot/types";

import { createDiscordBotClient } from "../support/client";
import { priceReportSetting, snapshot } from "../support/data-factories";
import { PUBLIC_BASE_URL } from "../support/options";

describe("scheduled price report retry", () => {
  it("backs off transient failures without advancing delivery cursors", async () => {
    const lastSentAt = new Date("2026-06-06T05:00:00.000Z");
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      settings: [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
          lastSentAt,
        }),
      ],
    });
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "failed" as const,
        messageCount: 1,
        sentMessageCount: 0,
        httpStatus: 503,
        errorCategory: "PROVIDER" as const,
        providerErrorCode: null,
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
        random: () => 0,
      }),
    ).resolves.toEqual({
      processedCount: 1,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 1,
      retryScheduledCount: 1,
      pausedPermanentCount: 0,
      pausedRetryExhaustedCount: 0,
      pausedPartialDeliveryCount: 0,
    });

    expect(client.discordPriceReportSetting.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "setting-1",
        discordUserId: "111122223333444455",
        enabled: true,
        deliveryState: "ACTIVE",
        deliveryClaimedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
      data: {
        deliveryState: "ACTIVE",
        consecutiveDeliveryFailures: 1,
        deliveryClaimedAt: null,
        nextSendAt: new Date("2026-06-07T05:05:00.000Z"),
      },
    });
    expect(client.discordPriceReportSetting.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastSentAt }) }),
    );
  });

  it("retries scheduled reports soon after rate limits", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
      settings: [
        priceReportSetting({
          id: "setting-1",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
        }),
      ],
    });
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "rate_limited" as const,
        messageCount: 1,
        sentMessageCount: 0,
        httpStatus: 429 as const,
        errorCategory: "RATE_LIMITED" as const,
        providerErrorCode: null,
        retryAfterMs: 10 * 60_000,
        global: false,
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
        random: () => 0,
      }),
    ).resolves.toMatchObject({
      processedCount: 1,
      sentCount: 0,
      rateLimitedCount: 1,
      failedCount: 0,
      retryScheduledCount: 1,
      pausedPermanentCount: 0,
      pausedRetryExhaustedCount: 0,
      pausedPartialDeliveryCount: 0,
    });

    expect(client.discordPriceReportSetting.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "setting-1",
        discordUserId: "111122223333444455",
        enabled: true,
        deliveryState: "ACTIVE",
        deliveryClaimedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
      data: {
        deliveryState: "ACTIVE",
        consecutiveDeliveryFailures: 1,
        deliveryClaimedAt: null,
        nextSendAt: new Date("2026-06-07T05:10:00.000Z"),
      },
    });
  });

  it("lets only one concurrent scheduler claim and send the same setting", async () => {
    const client = createDiscordBotClient({
      settings: [
        priceReportSetting({
          id: "setting-concurrent",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
        }),
      ],
    });
    const sendDirectMessages = vi.fn(async () => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));
    const input = {
      client,
      options: { publicBaseUrl: PUBLIC_BASE_URL },
      now: new Date("2026-06-07T05:00:00.000Z"),
      sendDirectMessages,
    };

    const summaries = await Promise.all([
      sendDueScheduledPriceReports(input),
      sendDueScheduledPriceReports(input),
    ]);

    expect(sendDirectMessages).toHaveBeenCalledTimes(1);
    expect(summaries.map((summary) => summary.processedCount).sort()).toEqual([0, 1]);
  });

  it("keeps retry budget across a daemon restart and pauses the final attempt", async () => {
    const now = new Date("2026-06-07T05:00:00.000Z");
    const clientAfterRestart = createDiscordBotClient({
      settings: [
        priceReportSetting({
          id: "setting-restarted",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
          consecutiveDeliveryFailures: 4,
        }),
      ],
    });
    const sendDirectMessages = vi.fn(async () => ({
      status: "failed" as const,
      messageCount: 1,
      sentMessageCount: 0,
      httpStatus: null,
      errorCategory: "TRANSPORT" as const,
      providerErrorCode: null,
    }));

    const summary = await sendDueScheduledPriceReports({
      client: clientAfterRestart,
      options: { publicBaseUrl: PUBLIC_BASE_URL },
      now,
      sendDirectMessages,
    });

    expect(summary.pausedRetryExhaustedCount).toBe(1);
    expect(clientAfterRestart.discordPriceReportSetting.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "setting-restarted",
        discordUserId: "111122223333444455",
        enabled: true,
        deliveryState: "ACTIVE",
        deliveryClaimedAt: now,
      },
      data: {
        deliveryState: "PAUSED_RETRY_EXHAUSTED",
        consecutiveDeliveryFailures: 5,
        deliveryClaimedAt: null,
        nextSendAt: null,
        enabled: false,
        disabledAt: now,
      },
    });
  });

  it("does not process an unexpired claim but reclaims a stale one", async () => {
    const now = new Date("2026-06-07T05:00:00.000Z");
    const sendDirectMessages = vi.fn(async () => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));
    const client = createDiscordBotClient({
      settings: [
        priceReportSetting({
          id: "setting-fresh-claim",
          discordUserId: "111122223333444455",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
          deliveryClaimedAt: new Date("2026-06-07T04:50:00.000Z"),
        }),
        priceReportSetting({
          id: "setting-stale-claim",
          discordUserId: "222233334444555566",
          nextSendAt: new Date("2026-06-07T04:59:00.000Z"),
          deliveryClaimedAt: new Date("2026-06-07T04:44:59.000Z"),
        }),
      ],
    });

    const summary = await sendDueScheduledPriceReports({
      client,
      options: { publicBaseUrl: PUBLIC_BASE_URL },
      now,
      sendDirectMessages,
    });

    expect(summary.processedCount).toBe(1);
    expect(sendDirectMessages).toHaveBeenCalledWith("222233334444555566", expect.any(Array));
  });
});
