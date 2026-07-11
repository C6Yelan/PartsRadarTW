// apps/crawler/tests/scripts/ops/discord-bot/price-report/price-report-filters.test.ts
// 驗證個人價格報告會依分類、內容類型與商品關鍵字篩選查詢與輸出結果。

import { describe, expect, it, vi } from "vitest";
import { sendPriceReportNow } from "../../../../../src/scripts/ops/discord-bot/price-report";
import type { DiscordBotMessage } from "../../../../../src/scripts/ops/discord-bot/types";

import { createDiscordBotClient, PUBLIC_BASE_URL, snapshot } from "../support";

describe("sendPriceReportNow filters", () => {
  it("filters price reports by category and event type", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "old-gpu",
          productId: "product-gpu",
          productName: "GPU A",
          crawlRunId: "old-run",
          price: 12_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "new-gpu",
          productId: "product-gpu",
          productName: "GPU A",
          crawlRunId: "new-run",
          price: 10_990,
          capturedAt: "2026-06-07T03:00:00.000Z",
          categoryIgrp: 12,
          categoryName: "顯示卡",
        }),
        snapshot({
          id: "old-board",
          productId: "product-board",
          productName: "Board A",
          crawlRunId: "old-run",
          price: 6_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
          categoryIgrp: 5,
          categoryName: "主機板",
        }),
        snapshot({
          id: "new-board",
          productId: "product-board",
          productName: "Board A",
          crawlRunId: "new-run",
          price: 6_500,
          capturedAt: "2026-06-07T03:00:00.000Z",
          categoryIgrp: 5,
          categoryName: "主機板",
        }),
        snapshot({
          id: "new-ssd",
          productId: "product-ssd",
          productName: "SSD B",
          crawlRunId: "new-run",
          price: 2_490,
          capturedAt: "2026-06-07T03:30:00.000Z",
          categoryIgrp: 7,
          categoryName: "SSD / HDD",
          vendorSlug: "samsung",
          vendorName: "Samsung",
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
          categoryIgrps: [12],
          productKeyword: null,
          includePriceDrops: true,
          includePriceRises: false,
          includeNewProducts: false,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      changeCount: 1,
      newProductCount: 0,
      listedCount: 1,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];

    expect(JSON.stringify(reportMessage)).toContain("GPU A");
    expect(JSON.stringify(reportMessage)).not.toContain("Board A");
    expect(JSON.stringify(reportMessage)).not.toContain("SSD B");
    expect(client.priceSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: {
            sourceCategory: {
              igrp: {
                in: [12],
              },
            },
          },
        }),
      }),
    );
  });

  it("filters price reports by product keyword", async () => {
    const client = createDiscordBotClient({
      snapshots: [
        snapshot({
          id: "old-rtx",
          productId: "product-rtx",
          productName: "華碩 ROG-RTX5090-O32G",
          crawlRunId: "old-run",
          price: 120_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-rtx",
          productId: "product-rtx",
          productName: "華碩 ROG-RTX5090-O32G",
          crawlRunId: "new-run",
          price: 118_000,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
        snapshot({
          id: "old-rx",
          productId: "product-rx",
          productName: "華碩 PRIME-RX9070XT-O16G",
          crawlRunId: "old-run",
          price: 28_000,
          capturedAt: "2026-06-06T01:00:00.000Z",
        }),
        snapshot({
          id: "new-rx",
          productId: "product-rx",
          productName: "華碩 PRIME-RX9070XT-O16G",
          crawlRunId: "new-run",
          price: 27_000,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
        snapshot({
          id: "new-ddr5",
          productId: "product-ddr5",
          productName: "芝奇 DDR5 6400 記憶體",
          crawlRunId: "new-run",
          price: 12_000,
          capturedAt: "2026-06-07T04:00:00.000Z",
          categoryIgrp: 6,
          categoryName: "記憶體",
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
          productKeyword: "RTX 5090, DDR5",
          includePriceDrops: true,
          includePriceRises: true,
          includeNewProducts: true,
        },
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toMatchObject({
      status: "sent",
      changeCount: 1,
      newProductCount: 1,
      listedCount: 2,
    });

    const reportMessage = sendReportMessages.mock.calls[0]?.[0][0];

    expect(JSON.stringify(reportMessage)).toContain("ROG-RTX5090-O32G");
    expect(JSON.stringify(reportMessage)).toContain("DDR5 6400");
    expect(JSON.stringify(reportMessage)).not.toContain("PRIME-RX9070XT-O16G");
    expect(client.priceSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: expect.objectContaining({
            OR: [
              {
                AND: [
                  { name: { contains: "RTX", mode: "insensitive" } },
                  { name: { contains: "5090", mode: "insensitive" } },
                ],
              },
              { name: { contains: "DDR5", mode: "insensitive" } },
            ],
          }),
        }),
      }),
    );
  });
});
