// apps/crawler/tests/scripts/ops/discord-bot/price-report/price-report-delivery.test.ts
// 驗證個人即時價格報告的 Discord 訊息組裝、delivery 紀錄與長內容分段限制。

import { describe, expect, it, vi } from "vitest";
import { DISCORD_MESSAGE_EMBED_TOTAL_MAX_LENGTH } from "../../../../../src/scripts/ops/discord-bot/constants";
import { sendPriceReportNow } from "../../../../../src/scripts/ops/discord-bot/price-report";
import type { DiscordBotMessage } from "../../../../../src/scripts/ops/discord-bot/types";

import {
  calculateMessageEmbedTextLength,
  createDiscordBotClient,
  PUBLIC_BASE_URL,
  snapshot,
} from "../support";

describe("sendPriceReportNow delivery", () => {
  it("sends a recent price report in the command context and records the delivery", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "old-1",
          productId: "product-1",
          productName: "華碩 GPU A",
          categoryIgrp: 12,
          categoryName: "顯示卡",
          vendorName: "華碩",
          crawlRunId: "old-run",
          price: 12000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "華碩 GPU A",
          categoryIgrp: 12,
          categoryName: "顯示卡",
          vendorName: "華碩",
          crawlRunId: "new-run",
          price: 10990,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
        snapshot({
          id: "new-2",
          productId: "product-2",
          productName: "Samsung SSD B",
          categoryIgrp: 8,
          categoryName: "SSD/硬碟",
          vendorName: "Samsung",
          crawlRunId: "new-run",
          price: 2490,
          capturedAt: "2026-06-07T04:00:00.000Z",
        }),
      ],
    });
    const sendReportMessages = vi.fn(async (_messages: DiscordBotMessage[]) => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));

    await expect(
      sendPriceReportNow({
        client,
        discordUserId: "111122223333444455",
        windowHours: 24,
        publicBaseUrl: PUBLIC_BASE_URL,
        filters: {
          categoryIgrps: [],
          productKeyword: null,
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: true,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toEqual({
      status: "sent",
      changeCount: 1,
      newProductCount: 1,
      listedCount: 2,
      messageCount: 1,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];
    expect(reportMessage).toMatchObject({
      embeds: [
        expect.objectContaining({
          title: "PartsRadarTW 價格報告 - 價格變動",
          description: expect.stringContaining("過去 **24 小時**：**降價 1**，**漲價 0**"),
        }),
        expect.objectContaining({
          title: "PartsRadarTW 價格報告 - 新增商品",
          description: expect.stringContaining("過去 **24 小時**：**1 個新增商品**"),
        }),
      ],
    });
    const priceChangeDescription = reportMessage?.embeds?.[0]?.description ?? "";
    const newProductDescription = reportMessage?.embeds?.[1]?.description ?? "";

    expect(priceChangeDescription).toContain(
      "\n__**降價 (1)**__\n**顯示卡**\n**華碩**\n- **-NT$1,010** NT$12,000 -> NT$10,990 [GPU A]",
    );
    expect(newProductDescription).toContain("\n**SSD/硬碟**\n**Samsung**\n- **NT$2,490** [SSD B]");
    expect(reportMessage?.embeds?.[0]?.fields).toBeUndefined();
    expect(reportMessage?.embeds?.[1]?.fields).toBeUndefined();
    expect(JSON.stringify(reportMessage)).toContain("GPU A");
    expect(JSON.stringify(reportMessage)).toContain("SSD B");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: {
        discordUserId: "111122223333444455",
        kind: "PRICE_REPORT_NOW",
        status: "SENT",
        itemCount: 2,
        messageCount: 1,
        deliveredAt: new Date("2026-06-07T05:00:00.000Z"),
        errorCategory: null,
        errorMessage: null,
        httpStatus: null,
        providerErrorCode: null,
      },
    });
  });

  it("keeps long report content continuous without blank embed fields", async () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      snapshot({
        id: `new-${index}`,
        productId: `product-${index}`,
        productName: `Long New Product ${index} ${"A".repeat(90)}`,
        crawlRunId: "new-run",
        price: 1000 + index,
        capturedAt: `2026-06-07T03:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const client = createDiscordBotClient({
      snapshots,
    });
    const sendReportMessages = vi.fn(async (_messages: DiscordBotMessage[]) => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));

    await sendPriceReportNow({
      client,
      discordUserId: "111122223333444455",
      windowHours: 24,
      publicBaseUrl: PUBLIC_BASE_URL,
      filters: {
        categoryIgrps: [],
        productKeyword: null,
        includePriceDrops: true,
        includePriceRises: true,
        includeNewProducts: true,
      },
      now: new Date("2026-06-07T05:00:00.000Z"),
      sendReportMessages,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];
    const description = reportMessage?.embeds?.[0]?.description ?? "";

    expect(reportMessage?.embeds?.[0]?.fields).toBeUndefined();
    expect(description).toContain("**顯示卡**\n**華碩**\n- **NT$1,013** [Long New Product 13");
    expect(description).not.toContain("\u200b");
    expect(description).not.toContain("續");
  });

  it("splits long price reports by Discord message embed size", async () => {
    const snapshots = Array.from({ length: 51 }, (_, index) =>
      snapshot({
        id: `long-new-${index}`,
        productId: `long-product-${index}`,
        productName: `Long New Product ${index} ${"A".repeat(120)}`,
        crawlRunId: "new-run",
        price: 1000 + index,
        capturedAt: `2026-06-07T03:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const client = createDiscordBotClient({
      snapshots,
    });
    const sendReportMessages = vi.fn(async (messages: DiscordBotMessage[]) => ({
      status: "sent" as const,
      messageCount: messages.length,
      httpStatuses: messages.map(() => 200),
    }));

    await expect(
      sendPriceReportNow({
        client,
        discordUserId: "111122223333444455",
        windowHours: 24,
        publicBaseUrl: PUBLIC_BASE_URL,
        filters: {
          categoryIgrps: [],
          productKeyword: null,
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: true,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      newProductCount: 51,
      listedCount: 50,
    });

    const reportMessages = sendReportMessages.mock.calls[0]?.[0] ?? [];

    expect(reportMessages.length).toBeGreaterThan(1);
    expect(JSON.stringify(reportMessages)).toContain("long-product-50");
    expect(JSON.stringify(reportMessages)).not.toContain("long-product-0");

    for (const message of reportMessages) {
      expect(message.embeds?.length ?? 0).toBeLessThanOrEqual(10);
      expect(calculateMessageEmbedTextLength(message)).toBeLessThanOrEqual(
        DISCORD_MESSAGE_EMBED_TOTAL_MAX_LENGTH,
      );
    }
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SENT",
        itemCount: 50,
        messageCount: reportMessages.length,
      }),
    });
  });
});
