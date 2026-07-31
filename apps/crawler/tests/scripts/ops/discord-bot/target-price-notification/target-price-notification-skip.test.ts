// apps/crawler/tests/scripts/ops/discord-bot/target-price-notification/target-price-notification-skip.test.ts
// 驗證目標價通知在未達標或早於 watch cursor 時不會誤送與寫入 delivery。

import { describe, expect, it, vi } from "vitest";
import { sendDueTargetPriceNotifications } from "../../../../../src/scripts/ops/discord-bot/target-price-notification";

import { createDiscordBotClient } from "../support/client";
import { snapshot, targetPriceWatch } from "../support/data-factories";
import { PUBLIC_BASE_URL, WATCH_PRODUCT_ID, WATCH_ROW_ID } from "../support/options";
import { createWatchManagerClient } from "../support/watch-clients";

describe("target price notification skips", () => {
  it("does not send when the current price is above the target", async () => {
    const client = createWatchManagerClient();
    const sendDirectMessages = vi.fn();

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 1,
      dueCount: 0,
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });
    expect(sendDirectMessages).not.toHaveBeenCalled();
    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    expect(client.discordNotificationDelivery.create).not.toHaveBeenCalled();
  });

  it("does not notify for a target price reached before the watch cursor", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "snapshot-target-1",
          productId: WATCH_PRODUCT_ID,
          productName: "RTX 5070 測試卡",
          crawlRunId: "old-run",
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
          notificationCursorAt: new Date("2026-06-07T05:00:00.000Z"),
        }),
      ],
    });
    const sendDirectMessages = vi.fn();

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:05:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 1,
      dueCount: 0,
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendDirectMessages).not.toHaveBeenCalled();
    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
    expect(client.discordNotificationDelivery.create).not.toHaveBeenCalled();
  });

  it("does not claim a reached price when the current currency differs from the watch", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "snapshot-currency-mismatch",
          productId: WATCH_PRODUCT_ID,
          productName: "Currency mismatch product",
          crawlRunId: "new-run",
          price: 15_000,
          currency: "USD",
          capturedAt: "2026-06-07T04:55:00.000Z",
        }),
      ],
      watches: [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "test-currency-user",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
          currency: "TWD",
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
    ).resolves.toMatchObject({
      scannedCount: 1,
      dueCount: 0,
      processedCount: 0,
    });
    expect(sendDirectMessages).not.toHaveBeenCalled();
    expect(client.discordTargetPriceWatch.updateMany).not.toHaveBeenCalled();
  });
});
