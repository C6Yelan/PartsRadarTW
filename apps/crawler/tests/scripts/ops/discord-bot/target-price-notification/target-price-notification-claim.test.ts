// apps/crawler/tests/scripts/ops/discord-bot/target-price-notification/target-price-notification-claim.test.ts
// 驗證目標價通知 claim lease 會避免重複發送，且失敗後可釋放給下一輪重試。

import { describe, expect, it, vi } from "vitest";
import { sendDueTargetPriceNotifications } from "../../../../../src/scripts/ops/discord-bot/target-price-notification";
import type { DiscordBotMessage } from "../../../../../src/scripts/ops/discord-bot/types";

import { createDiscordBotClient } from "../support/client";
import { snapshot, targetPriceWatch } from "../support/data-factories";
import { PUBLIC_BASE_URL, WATCH_PRODUCT_ID, WATCH_ROW_ID } from "../support/options";

describe("target price notification claims", () => {
  it("releases a failed delivery claim so a later scan can retry", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "snapshot-target-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 15_000,
          capturedAt: "2026-06-07T04:55:00.000Z",
        }),
      ],
      watches: [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
        }),
      ],
    });
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, _messages: DiscordBotMessage[]) => ({
        status: "failed" as const,
        messageCount: 1,
        sentMessageCount: 0,
        httpStatus: 403,
        errorCategory: "DM_UNAVAILABLE" as const,
        providerErrorCode: 50007,
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({ processedCount: 1, failedCount: 1 });
    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:05:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({ processedCount: 1, failedCount: 1 });

    expect(sendDirectMessages).toHaveBeenCalledTimes(2);
    expect(client.discordNotificationDelivery.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        kind: "TARGET_PRICE",
        status: "FAILED",
        dedupeKey: null,
        deliveredAt: null,
        errorMessage: null,
        errorCategory: "DM_UNAVAILABLE",
        httpStatus: 403,
        providerErrorCode: 50007,
      }),
    });
  });

  it("does not take over a fresh notification claim", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "snapshot-target-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "new-run",
          price: 15_000,
          capturedAt: "2026-06-07T04:55:00.000Z",
        }),
      ],
      watches: [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
          notificationClaimedAt: new Date("2026-06-07T04:55:00.000Z"),
        }),
      ],
    });
    const sendDirectMessages = vi.fn();

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({ scannedCount: 1, processedCount: 0 });
    expect(sendDirectMessages).not.toHaveBeenCalled();
  });
});
