// apps/crawler/tests/scripts/ops/discord-bot/target-price-notification/target-price-notification-delivery.test.ts
// 驗證目標價通知達標發送、同使用者 digest、長訊息拆分與 delivery 紀錄。

import { describe, expect, it, vi } from "vitest";
import { sendDueTargetPriceNotifications } from "../../../../../src/scripts/ops/discord-bot/target-price-notification";
import type { DiscordBotMessage } from "../../../../../src/scripts/ops/discord-bot/types";

import { createDiscordBotClient } from "../support/client";
import { snapshot, targetPriceWatch } from "../support/data-factories";
import { PUBLIC_BASE_URL, WATCH_PRODUCT_ID, WATCH_ROW_ID } from "../support/options";

describe("target price notification delivery", () => {
  it("sends a reached target price once and records the delivery", async () => {
    const now = new Date("2026-06-07T05:00:00.000Z");
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
        status: "sent" as const,
        messageCount: 1,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now,
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 1,
      dueCount: 1,
      processedCount: 1,
      sentCount: 1,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendDirectMessages).toHaveBeenCalledWith("111122223333444455", [
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            title: "商品已達到目標價格",
            description: expect.stringContaining(
              `https://partsradar.test/products/${WATCH_PRODUCT_ID}`,
            ),
            fields: [
              { name: "目前價格", value: "NT$15,000", inline: true },
              { name: "目標價格", value: "NT$17,500", inline: true },
            ],
          }),
        ],
      }),
    ]);
    expect(sendDirectMessages.mock.calls[0]?.[1][0]?.embeds?.[0]).not.toHaveProperty("timestamp");
    expect(JSON.stringify(sendDirectMessages.mock.calls[0]?.[1])).not.toContain("只會通知一次");
    expect(JSON.stringify(sendDirectMessages.mock.calls[0]?.[1])).not.toContain("達標差額");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: {
        discordUserId: "111122223333444455",
        kind: "TARGET_PRICE",
        status: "SENT",
        productId: WATCH_PRODUCT_ID,
        targetPriceWatchId: WATCH_ROW_ID,
        dedupeKey: `target-price:${WATCH_ROW_ID}:2026-06-07T00:00:00.000Z`,
        itemCount: 1,
        messageCount: 1,
        deliveredAt: now,
        errorCategory: null,
        errorMessage: null,
        httpStatus: null,
        providerErrorCode: null,
      },
    });

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:05:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 0,
      dueCount: 0,
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    });
    expect(sendDirectMessages).toHaveBeenCalledTimes(1);
  });

  it("combines same-user target price notifications into one DM digest", async () => {
    const now = new Date("2026-06-07T05:00:00.000Z");
    const secondProductId = "33333333-3333-4333-8333-333333333333";
    const secondWatchId = "44444444-4444-4444-8444-444444444444";
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
        snapshot({
          id: "snapshot-target-2",
          productId: secondProductId,
          productName: "DDR5 64GB 測試記憶體",
          crawlRunId: "new-run",
          price: 4_500,
          capturedAt: "2026-06-07T04:56:00.000Z",
        }),
      ],
      watches: [
        targetPriceWatch({
          id: WATCH_ROW_ID,
          discordUserId: "111122223333444455",
          productId: WATCH_PRODUCT_ID,
          targetPrice: 17_500,
        }),
        targetPriceWatch({
          id: secondWatchId,
          discordUserId: "111122223333444455",
          productId: secondProductId,
          targetPrice: 5_000,
        }),
      ],
    });
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: messages.length,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now,
        sendDirectMessages,
      }),
    ).resolves.toEqual({
      scannedCount: 2,
      dueCount: 2,
      processedCount: 2,
      sentCount: 2,
      rateLimitedCount: 0,
      failedCount: 0,
    });

    expect(sendDirectMessages).toHaveBeenCalledTimes(1);
    expect(sendDirectMessages).toHaveBeenCalledWith("111122223333444455", [
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            title: "商品目標價達標",
            description: expect.stringContaining("共有 **2** 項追蹤達到目標價格。"),
          }),
        ],
      }),
    ]);
    const digest = JSON.stringify(sendDirectMessages.mock.calls[0]?.[1]);
    expect(digest).toContain("RTX 5070 測試卡");
    expect(digest).toContain("DDR5 64GB 測試記憶體");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledTimes(2);
    expect(client.discordNotificationDelivery.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        kind: "TARGET_PRICE",
        status: "SENT",
        targetPriceWatchId: WATCH_ROW_ID,
        messageCount: 1,
      }),
    });
    expect(client.discordNotificationDelivery.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        kind: "TARGET_PRICE",
        status: "SENT",
        targetPriceWatchId: secondWatchId,
        messageCount: 1,
      }),
    });
  });

  it("splits long target price notification digests into multiple embeds", async () => {
    const snapshots = Array.from({ length: 25 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");
      const productId = `50000000-0000-4000-8000-${suffix}-${"x".repeat(160)}`;

      return snapshot({
        id: `snapshot-target-${index + 1}`,
        productId,
        productName: `超長商品名稱測試 ${index + 1} RTX 5090 WHITE OC 32GB GDDR7 三風扇 顯示卡 限量版本 搭優惠到月底`,
        crawlRunId: "new-run",
        price: 30_000 + index,
        capturedAt: "2026-06-07T04:55:00.000Z",
      });
    });
    const watches = snapshots.map((item, index) =>
      targetPriceWatch({
        id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        discordUserId: "111122223333444455",
        productId: item.productId,
        targetPrice: 35_000 + index,
      }),
    );
    const client = createDiscordBotClient({
      snapshots,
      watches,
    });
    const sendDirectMessages = vi.fn(
      async (_discordUserId: string, messages: DiscordBotMessage[]) => ({
        status: "sent" as const,
        messageCount: messages.length,
        httpStatuses: [200],
      }),
    );

    await expect(
      sendDueTargetPriceNotifications({
        client,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendDirectMessages,
      }),
    ).resolves.toMatchObject({
      processedCount: 25,
      sentCount: 25,
    });

    const messages = sendDirectMessages.mock.calls[0]?.[1] ?? [];
    const embedCount = messages.reduce(
      (count, message) => count + (message.embeds?.length ?? 0),
      0,
    );

    expect(sendDirectMessages).toHaveBeenCalledTimes(1);
    expect(embedCount).toBeGreaterThan(1);
    expect(messages[0]?.embeds?.[0]?.title).toMatch(/^商品目標價達標 \(1\/[0-9]+\)$/);
    expect(messages.at(-1)?.embeds?.at(-1)?.title).toBe(
      `商品目標價達標 (${embedCount}/${embedCount})`,
    );
  });
});
