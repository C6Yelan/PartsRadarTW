// packages/db/tests/price-report/reader-crawl-run.test.ts
// 驗證指定 crawl run 的價格報告 reader 會區分變價、新商品、未變價並排序變動幅度。

import { describe, expect, it } from "vitest";
import {
  PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
  PRICE_REPORT_PREVIOUS_SNAPSHOT_LIMIT,
  PriceReportWorkBudgetExceededError,
  readCrawlRunPriceChangeSummary,
} from "../../src/price-report";
import { createPriceReportReaderClient, snapshot } from "./support";

describe("readCrawlRunPriceChangeSummary changes", () => {
  it("returns changed existing products and skips first-seen or unchanged snapshots", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "old-1",
          productId: "product-1",
          productName: "Changed GPU",
          crawlRunId: "old-run",
          price: 10000,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "new-1",
          productId: "product-1",
          productName: "Changed GPU",
          crawlRunId: "target-run",
          price: 9500,
          capturedAt: "2026-06-07T02:00:00.000Z",
        }),
        snapshot({
          id: "new-2",
          productId: "product-2",
          productName: "New Product",
          crawlRunId: "target-run",
          price: 1500,
          capturedAt: "2026-06-07T02:01:00.000Z",
        }),
        snapshot({
          id: "old-3",
          productId: "product-3",
          productName: "Unchanged PSU",
          crawlRunId: "old-run",
          price: 3200,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "new-3",
          productId: "product-3",
          productName: "Unchanged PSU",
          crawlRunId: "target-run",
          price: 3200,
          capturedAt: "2026-06-07T02:02:00.000Z",
        }),
      ],
    });

    const result = await readCrawlRunPriceChangeSummary(client, "target-run");

    expect(result.changes).toEqual([
      {
        productId: "product-1",
        productName: "Changed GPU",
        category: {
          igrp: 12,
          displayName: "顯示卡",
        },
        subcategory: {
          slug: "asus",
          displayName: "華碩",
        },
        previousPrice: 10000,
        currentPrice: 9500,
        currency: "TWD",
        changedAt: new Date("2026-06-07T02:00:00.000Z"),
        delta: -500,
      },
    ]);
    expect(client.priceSnapshot.findMany).toHaveBeenCalledTimes(2);
  });

  it("orders larger absolute price moves first", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "old-small",
          productId: "small",
          productName: "Small Move",
          crawlRunId: "old-run",
          price: 1000,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "new-small",
          productId: "small",
          productName: "Small Move",
          crawlRunId: "target-run",
          price: 1100,
          capturedAt: "2026-06-07T02:00:00.000Z",
        }),
        snapshot({
          id: "old-large",
          productId: "large",
          productName: "Large Move",
          crawlRunId: "old-run",
          price: 8000,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "new-large",
          productId: "large",
          productName: "Large Move",
          crawlRunId: "target-run",
          price: 7200,
          capturedAt: "2026-06-07T02:01:00.000Z",
        }),
      ],
    });

    const { changes } = await readCrawlRunPriceChangeSummary(client, "target-run");

    expect(changes.map((change) => change.productId)).toEqual(["large", "small"]);
  });

  it("uses the latest eligible previous snapshot for each current snapshot", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "old-twd",
          productId: "product-1",
          productName: "Multi snapshot GPU",
          crawlRunId: "old-run",
          price: 100,
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "current-drop",
          productId: "product-1",
          productName: "Multi snapshot GPU",
          crawlRunId: "target-run",
          price: 90,
          capturedAt: "2026-06-07T02:00:00.000Z",
        }),
        snapshot({
          id: "current-rise",
          productId: "product-1",
          productName: "Multi snapshot GPU",
          crawlRunId: "target-run",
          price: 95,
          capturedAt: "2026-06-07T03:00:00.000Z",
        }),
        snapshot({
          id: "old-usd",
          productId: "product-2",
          productName: "Currency mismatch GPU",
          crawlRunId: "old-run",
          price: 100,
          currency: "USD",
          capturedAt: "2026-06-07T01:00:00.000Z",
        }),
        snapshot({
          id: "current-twd",
          productId: "product-2",
          productName: "Currency mismatch GPU",
          crawlRunId: "target-run",
          price: 90,
          currency: "TWD",
          capturedAt: "2026-06-07T02:00:00.000Z",
        }),
      ],
    });

    const result = await readCrawlRunPriceChangeSummary(client, "target-run");

    expect(
      result.changes.map(({ currentPrice, previousPrice }) => ({
        currentPrice,
        previousPrice,
      })),
    ).toEqual([
      { currentPrice: 90, previousPrice: 100 },
      { currentPrice: 95, previousPrice: 100 },
    ]);
    expect(result.currencyMismatchCount).toBe(1);
  });
});

describe("readCrawlRunPriceChangeSummary", () => {
  it("reports current-run snapshots that cannot be matched to previous prices", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "new-product-snapshot",
          productId: "product-1",
          productName: "First Seen RAM",
          crawlRunId: "target-run",
          price: 1990,
          capturedAt: "2026-06-07T02:00:00.000Z",
        }),
      ],
    });

    await expect(readCrawlRunPriceChangeSummary(client, "target-run")).resolves.toEqual({
      changes: [],
      newProducts: [
        {
          productId: "product-1",
          productName: "First Seen RAM",
          category: {
            igrp: 12,
            displayName: "顯示卡",
          },
          subcategory: {
            slug: "asus",
            displayName: "華碩",
          },
          currentPrice: 1990,
          currency: "TWD",
          firstSeenAt: new Date("2026-06-07T02:00:00.000Z"),
        },
      ],
      snapshotCount: 1,
      unmatchedSnapshotCount: 1,
      unchangedSnapshotCount: 0,
      currencyMismatchCount: 0,
    });
  });

  it("bounds current and previous queries with separate work budgets", async () => {
    const client = createPriceReportReaderClient({
      snapshots: [
        snapshot({
          id: "old",
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
          crawlRunId: "target-run",
          price: 90,
          capturedAt: "2026-06-07T02:00:00.000Z",
        }),
      ],
    });

    await readCrawlRunPriceChangeSummary(client, "target-run");

    expect(client.priceSnapshot.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
      }),
    );
    expect(client.priceSnapshot.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: PRICE_REPORT_PREVIOUS_SNAPSHOT_LIMIT + 1,
      }),
    );
  });

  it("fails closed before reading history when the current run exceeds its budget", async () => {
    const client = createPriceReportReaderClient({
      snapshots: Array.from({ length: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1 }, (_, index) =>
        snapshot({
          id: `current-${index}`,
          productId: `product-${index}`,
          productName: `Product ${index}`,
          crawlRunId: "target-run",
          price: 1_000 + index,
          capturedAt: "2026-06-07T02:00:00.000Z",
        }),
      ),
    });

    await expect(readCrawlRunPriceChangeSummary(client, "target-run")).rejects.toEqual(
      new PriceReportWorkBudgetExceededError(
        "crawl_run_current",
        PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
        PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
      ),
    );
    expect(client.priceSnapshot.findMany).toHaveBeenCalledTimes(1);
  });

  it("fails closed when bounded previous history overflows", async () => {
    const previousRows = Array.from(
      { length: PRICE_REPORT_PREVIOUS_SNAPSHOT_LIMIT + 1 },
      (_, index) => ({
        id: `previous-${index}`,
        productId: "product-1",
        price: index,
        currency: "TWD",
        capturedAt: new Date("2026-06-07T01:00:00.000Z"),
      }),
    );
    const client = {
      priceSnapshot: {
        findMany: async (args: { where: { crawlRunId?: string } }) =>
          typeof args.where.crawlRunId === "string"
            ? [
                {
                  id: "current",
                  productId: "product-1",
                  price: 90,
                  currency: "TWD",
                  capturedAt: new Date("2026-06-07T02:00:00.000Z"),
                  product: {
                    id: "product-1",
                    name: "Overflow GPU",
                    vendorSlug: null,
                    vendorName: null,
                    sourceCategory: { igrp: 12, displayName: "顯示卡" },
                  },
                },
              ]
            : previousRows,
      },
    };

    await expect(readCrawlRunPriceChangeSummary(client as never, "target-run")).rejects.toEqual(
      new PriceReportWorkBudgetExceededError(
        "crawl_run_previous",
        PRICE_REPORT_PREVIOUS_SNAPSHOT_LIMIT,
        PRICE_REPORT_PREVIOUS_SNAPSHOT_LIMIT + 1,
      ),
    );
  });
});
