// apps/crawler/tests/scripts/ops/discord-bot/price-report-reader-crawl-run.test.ts
import { describe, expect, it } from "vitest";
import {
  readCrawlRunPriceChangeSummary,
  readCrawlRunPriceChanges,
} from "../../../../src/scripts/ops/discord-bot/price-report/reader";
import { createPriceChangeClient, snapshot } from "./price-report-reader-support";

describe("readCrawlRunPriceChanges", () => {
  it("returns changed existing products and skips first-seen or unchanged snapshots", async () => {
    const client = createPriceChangeClient([
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
    ]);

    await expect(readCrawlRunPriceChanges(client, "target-run")).resolves.toEqual([
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
    const client = createPriceChangeClient([
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
    ]);

    const changes = await readCrawlRunPriceChanges(client, "target-run");

    expect(changes.map((change) => change.productId)).toEqual(["large", "small"]);
  });
});

describe("readCrawlRunPriceChangeSummary", () => {
  it("reports current-run snapshots that cannot be matched to previous prices", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "new-product-snapshot",
        productId: "product-1",
        productName: "First Seen RAM",
        crawlRunId: "target-run",
        price: 1990,
        capturedAt: "2026-06-07T02:00:00.000Z",
      }),
    ]);

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
});
