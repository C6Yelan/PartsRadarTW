// apps/crawler/tests/scripts/ops/discord-bot/price-report-reader-recent.test.ts
// 驗證近期時間窗價格報告 reader 會彙整最新變價、新商品與商品關鍵字篩選結果。

import { describe, expect, it } from "vitest";
import {
  readRecentPriceChanges,
  readRecentPriceReport,
} from "../../../../src/scripts/ops/discord-bot/price-report/reader";
import { createPriceChangeClient, snapshot } from "./price-report-reader-support";

describe("readRecentPriceChanges", () => {
  it("returns each product's latest price change inside the requested window", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "old-run",
        price: 10000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "mid-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "run-1",
        price: 9300,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "run-2",
        price: 9000,
        capturedAt: "2026-06-07T04:00:00.000Z",
      }),
      snapshot({
        id: "new-product",
        productId: "product-2",
        productName: "First Seen SSD",
        crawlRunId: "run-2",
        price: 2500,
        capturedAt: "2026-06-07T04:10:00.000Z",
      }),
    ]);

    await expect(
      readRecentPriceChanges(client, {
        since: new Date("2026-06-07T02:00:00.000Z"),
        until: new Date("2026-06-07T05:00:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        productId: "product-1",
        productName: "GPU A",
        category: {
          igrp: 12,
          displayName: "顯示卡",
        },
        subcategory: {
          slug: "asus",
          displayName: "華碩",
        },
        previousPrice: 9300,
        currentPrice: 9000,
        currency: "TWD",
        changedAt: new Date("2026-06-07T04:00:00.000Z"),
        delta: -300,
      },
    ]);
  });
});

describe("readRecentPriceReport", () => {
  it("separates recent price changes from new products", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-gpu",
        productId: "gpu",
        productName: "Changed GPU",
        crawlRunId: "old-run",
        price: 12000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-gpu",
        productId: "gpu",
        productName: "Changed GPU",
        crawlRunId: "new-run",
        price: 10990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-ssd",
        productId: "ssd",
        productName: "Brand New SSD",
        crawlRunId: "new-run",
        price: 2490,
        capturedAt: "2026-06-07T04:00:00.000Z",
      }),
      snapshot({
        id: "newer-ssd",
        productId: "ssd",
        productName: "Brand New SSD",
        crawlRunId: "newer-run",
        price: 2390,
        capturedAt: "2026-06-07T04:30:00.000Z",
      }),
    ]);

    await expect(
      readRecentPriceReport(client, {
        since: new Date("2026-06-07T02:00:00.000Z"),
        until: new Date("2026-06-07T05:00:00.000Z"),
      }),
    ).resolves.toEqual({
      priceChanges: [
        {
          productId: "gpu",
          productName: "Changed GPU",
          category: {
            igrp: 12,
            displayName: "顯示卡",
          },
          subcategory: {
            slug: "asus",
            displayName: "華碩",
          },
          previousPrice: 12000,
          currentPrice: 10990,
          currency: "TWD",
          changedAt: new Date("2026-06-07T03:00:00.000Z"),
          delta: -1010,
        },
      ],
      newProducts: [
        {
          productId: "ssd",
          productName: "Brand New SSD",
          category: {
            igrp: 12,
            displayName: "顯示卡",
          },
          subcategory: {
            slug: "asus",
            displayName: "華碩",
          },
          currentPrice: 2390,
          currency: "TWD",
          firstSeenAt: new Date("2026-06-07T04:00:00.000Z"),
        },
      ],
    });
  });

  it("filters recent reports by product keyword tokens", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-rtx",
        productId: "rtx",
        productName: "華碩 ROG-RTX5090-O32G",
        crawlRunId: "old-run",
        price: 120000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-rtx",
        productId: "rtx",
        productName: "華碩 ROG-RTX5090-O32G",
        crawlRunId: "new-run",
        price: 118000,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-rtx-ti",
        productId: "rtx-ti",
        productName: "微星 RTX5090Ti 測試卡",
        crawlRunId: "new-run",
        price: 160000,
        capturedAt: "2026-06-07T03:30:00.000Z",
      }),
      snapshot({
        id: "new-ddr5",
        productId: "ddr5",
        productName: "芝奇 DDR5 6400 記憶體",
        crawlRunId: "new-run",
        price: 12000,
        capturedAt: "2026-06-07T03:40:00.000Z",
        categoryIgrp: 6,
        categoryName: "記憶體",
      }),
      snapshot({
        id: "old-rx",
        productId: "rx",
        productName: "華碩 PRIME-RX9070XT-O16G",
        crawlRunId: "old-run",
        price: 28000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-rx",
        productId: "rx",
        productName: "華碩 PRIME-RX9070XT-O16G",
        crawlRunId: "new-run",
        price: 27000,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
    ]);

    const report = await readRecentPriceReport(client, {
      since: new Date("2026-06-07T02:00:00.000Z"),
      until: new Date("2026-06-07T05:00:00.000Z"),
      filters: {
        productKeyword: "RTX 5090, DDR5",
      },
    });

    expect(report.priceChanges.map((item) => item.productId)).toEqual(["rtx"]);
    expect(report.newProducts.map((item) => item.productId)).toEqual(["ddr5", "rtx-ti"]);
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
