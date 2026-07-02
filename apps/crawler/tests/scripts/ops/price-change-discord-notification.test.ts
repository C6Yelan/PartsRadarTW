// apps/crawler/tests/scripts/ops/price-change-discord-notification.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  type PriceChangeDiscordClient,
  readCrawlRunPriceChangeSummary,
  readCrawlRunPriceChanges,
  readRecentPriceChanges,
  readRecentPriceReport,
} from "../../../src/scripts/ops/price-change-discord-notification";

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

interface TestSnapshot {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  currency: string;
  capturedAt: Date;
  categoryIgrp: number;
  categoryName: string;
  vendorSlug: string | null;
  vendorName: string | null;
}

interface TestProductWhere {
  sourceCategory?: {
    igrp?: {
      in?: number[];
    };
  };
  name?: {
    contains?: string;
  };
  AND?: TestProductWhere[];
  OR?: TestProductWhere[];
}

function snapshot({
  id,
  productId,
  productName,
  crawlRunId,
  price,
  capturedAt,
  currency = "TWD",
  categoryIgrp = 12,
  categoryName = "顯示卡",
  vendorSlug = "asus",
  vendorName = "華碩",
}: {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  capturedAt: string;
  currency?: string;
  categoryIgrp?: number;
  categoryName?: string;
  vendorSlug?: string | null;
  vendorName?: string | null;
}): TestSnapshot {
  return {
    id,
    productId,
    productName,
    crawlRunId,
    price,
    currency,
    capturedAt: new Date(capturedAt),
    categoryIgrp,
    categoryName,
    vendorSlug,
    vendorName,
  };
}

function createPriceChangeClient(snapshots: TestSnapshot[]): PriceChangeDiscordClient & {
  priceSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
  };
} {
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;

    if (typeof where.crawlRunId === "string") {
      return snapshots
        .filter((snapshot) => snapshot.crawlRunId === where.crawlRunId)
        .sort(compareCapturedAtAsc)
        .map(toPrismaSnapshotWithProduct);
    }

    if (
      !where.productId &&
      typeof where.capturedAt === "object" &&
      where.capturedAt !== null &&
      "gte" in where.capturedAt &&
      "lte" in where.capturedAt
    ) {
      const capturedAtFilter = where.capturedAt as { gte: Date; lte: Date };
      const productFilter = where.product as TestProductWhere | undefined;

      return snapshots
        .filter(
          (snapshot) =>
            snapshot.capturedAt.getTime() >= capturedAtFilter.gte.getTime() &&
            snapshot.capturedAt.getTime() <= capturedAtFilter.lte.getTime() &&
            matchesProductWhere(snapshot, productFilter),
        )
        .sort(compareCapturedAtAsc)
        .map(toPrismaSnapshotWithProduct);
    }

    const productIdFilter = where.productId as { in: string[] };
    const crawlRunFilter = where.crawlRunId as { not: string } | undefined;
    const capturedAtFilter = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (snapshot) =>
          productIdFilter.in.includes(snapshot.productId) &&
          (!crawlRunFilter || snapshot.crawlRunId !== crawlRunFilter.not) &&
          snapshot.capturedAt.getTime() < capturedAtFilter.lt.getTime(),
      )
      .sort(comparePreviousSnapshotOrder)
      .map((snapshot) => ({
        id: snapshot.id,
        productId: snapshot.productId,
        price: snapshot.price,
        currency: snapshot.currency,
        capturedAt: snapshot.capturedAt,
      }));
  });

  return {
    priceSnapshot: {
      findMany,
    },
  } as unknown as PriceChangeDiscordClient & {
    priceSnapshot: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
}

function toPrismaSnapshotWithProduct(snapshot: TestSnapshot) {
  return {
    id: snapshot.id,
    productId: snapshot.productId,
    price: snapshot.price,
    currency: snapshot.currency,
    capturedAt: snapshot.capturedAt,
    product: {
      id: snapshot.productId,
      name: snapshot.productName,
      vendorSlug: snapshot.vendorSlug,
      vendorName: snapshot.vendorName,
      sourceCategory: {
        igrp: snapshot.categoryIgrp,
        displayName: snapshot.categoryName,
      },
    },
  };
}

function matchesProductWhere(snapshot: TestSnapshot, where: TestProductWhere | undefined): boolean {
  if (!where) {
    return true;
  }

  const categoryIgrps = where.sourceCategory?.igrp?.in ?? [];

  if (categoryIgrps.length > 0 && !categoryIgrps.includes(snapshot.categoryIgrp)) {
    return false;
  }

  const nameContains = where.name?.contains;

  if (
    nameContains &&
    !snapshot.productName.toLocaleLowerCase().includes(nameContains.toLocaleLowerCase())
  ) {
    return false;
  }

  if (!(where.AND ?? []).every((condition) => matchesProductWhere(snapshot, condition))) {
    return false;
  }

  return !where.OR || where.OR.some((condition) => matchesProductWhere(snapshot, condition));
}

function compareCapturedAtAsc(left: TestSnapshot, right: TestSnapshot): number {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

function comparePreviousSnapshotOrder(left: TestSnapshot, right: TestSnapshot): number {
  return (
    left.productId.localeCompare(right.productId) ||
    right.capturedAt.getTime() - left.capturedAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
