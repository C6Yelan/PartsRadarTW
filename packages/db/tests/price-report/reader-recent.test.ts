// packages/db/tests/price-report/reader-recent.test.ts
// 驗證近期時間窗價格報告 reader 會彙整最新變價、新商品與商品關鍵字篩選結果。

import { describe, expect, it } from "vitest";
import { readRecentPriceReport } from "../../src/price-report";
import { createPriceReportReaderClient, snapshot } from "./support";

describe("readRecentPriceReport price changes", () => {
  it("returns each product's latest price change inside the requested window", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
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
      ],
    });

    const report = await readRecentPriceReport(client, {
      since: new Date("2026-06-07T02:00:00.000Z"),
      until: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(report.priceChanges).toEqual([
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

  it("filters direction after selecting each product's latest valid change", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "baseline",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "old-run",
          price: 100,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "drop",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "run-1",
          price: 90,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
        snapshot({
          id: "latest-rise",
          productId: "product-1",
          productName: "GPU A",
          crawlRunId: "run-2",
          price: 95,
          capturedAt: "2026-06-07T04:00:00.000Z",
        }),
      ],
    });
    const range = {
      since: new Date("2026-06-07T02:00:00.000Z"),
      until: new Date("2026-06-07T05:00:00.000Z"),
    };

    const drops = await readRecentPriceReport(client, {
      ...range,
      filters: {
        includePriceDrops: true,
        includePriceRises: false,
        includeNewProducts: false,
      },
    });
    expect(drops.priceChanges).toEqual([]);

    const rises = await readRecentPriceReport(client, {
      ...range,
      filters: {
        includePriceDrops: false,
        includePriceRises: true,
        includeNewProducts: false,
      },
    });
    expect(rises.priceChanges).toHaveLength(1);
    expect(rises.priceChanges[0]).toMatchObject({
      previousPrice: 90,
      currentPrice: 95,
      delta: 5,
      changedAt: new Date("2026-06-07T04:00:00.000Z"),
    });
  });

  it("excludes same-price and cross-currency snapshots", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "same-baseline",
          productId: "same",
          productName: "Same Price GPU",
          crawlRunId: "old-run",
          price: 100,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "same-current",
          productId: "same",
          productName: "Same Price GPU",
          crawlRunId: "new-run",
          price: 100,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
        snapshot({
          id: "currency-baseline",
          productId: "currency",
          productName: "Currency GPU",
          crawlRunId: "old-run",
          price: 100,
          currency: "TWD",
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "currency-current",
          productId: "currency",
          productName: "Currency GPU",
          crawlRunId: "new-run",
          price: 90,
          currency: "USD",
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
    });

    const report = await readRecentPriceReport(client, {
      since: new Date("2026-06-07T02:00:00.000Z"),
      until: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(report.priceChanges).toEqual([]);
    expect(report.newProducts).toEqual([]);
  });
});

describe("readRecentPriceReport", () => {
  it("separates recent price changes from new products", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
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
      ],
    });

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
});
