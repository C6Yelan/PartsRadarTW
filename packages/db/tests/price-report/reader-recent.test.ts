// packages/db/tests/price-report/reader-recent.test.ts
// 驗證近期時間窗價格報告 reader 會彙整最新變價、新商品與商品關鍵字篩選結果。

import { describe, expect, it, vi } from "vitest";
import {
  PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
  PriceReportWorkBudgetExceededError,
  readRecentPriceReport,
} from "../../src/price-report";
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

  it("bounds current rows and reads at most one baseline per product", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "baseline",
          productId: "product-1",
          productName: "Bounded GPU",
          crawlRunId: "old-run",
          price: 100,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "current",
          productId: "product-1",
          productName: "Bounded GPU",
          crawlRunId: "new-run",
          price: 90,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ],
    });

    await readRecentPriceReport(client, {
      since: new Date("2026-06-07T02:00:00.000Z"),
      until: new Date("2026-06-07T05:00:00.000Z"),
    });

    expect(client.priceSnapshot.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
      }),
    );
    expect(client.priceSnapshot.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 1,
      }),
    );
  });

  it("accepts exactly the current-row budget and fails closed at budget plus one", async () => {
    const atBudget = createPriceReportReaderClient({
      snapshots: Array.from({ length: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT }, (_, index) =>
        snapshot({
          id: `current-${index}`,
          productId: `product-${index}`,
          productName: `Product ${index}`,
          crawlRunId: "new-run",
          price: 1_000 + index,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ),
    });
    const overBudget = createPriceReportReaderClient({
      snapshots: Array.from({ length: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1 }, (_, index) =>
        snapshot({
          id: `overflow-${index}`,
          productId: `overflow-product-${index}`,
          productName: `Overflow ${index}`,
          crawlRunId: "new-run",
          price: 1_000 + index,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
      ),
    });
    const range = {
      since: new Date("2026-06-07T02:00:00.000Z"),
      until: new Date("2026-06-07T05:00:00.000Z"),
    };

    await expect(readRecentPriceReport(atBudget, range)).resolves.toMatchObject({
      newProducts: { length: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT },
    });
    await expect(readRecentPriceReport(overBudget, range)).rejects.toEqual(
      new PriceReportWorkBudgetExceededError(
        "recent_current",
        PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
        PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
      ),
    );
    expect(overBudget.priceSnapshot.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not materialize one product's high-cardinality baseline history", async () => {
    const baseline = {
      id: "latest-baseline",
      productId: "product-1",
      price: 100,
      currency: "TWD",
      capturedAt: new Date("2026-06-07T01:00:00.000Z"),
    };
    const findMany = vi.fn(async (args: { where: { productId?: unknown }; take?: number }) =>
      args.where.productId
        ? [baseline]
        : [
            {
              id: "current",
              productId: "product-1",
              price: 90,
              currency: "TWD",
              capturedAt: new Date("2026-06-07T03:00:00.000Z"),
              product: {
                id: "product-1",
                name: "High-cardinality GPU",
                vendorSlug: null,
                vendorName: null,
                sourceCategory: { igrp: 12, displayName: "顯示卡" },
              },
            },
          ],
    );
    const client = {
      priceSnapshot: {
        findMany,
      },
    };

    await expect(
      readRecentPriceReport(client as never, {
        since: new Date("2026-06-07T02:00:00.000Z"),
        until: new Date("2026-06-07T05:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      priceChanges: [
        expect.objectContaining({
          previousPrice: 100,
          currentPrice: 90,
        }),
      ],
    });
    expect(findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ take: 1 }));
  });
});
