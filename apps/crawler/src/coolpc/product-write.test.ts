import { describe, expect, it } from "vitest";
import type { ParsedCoolpcProduct } from "./parser";
import { writeCoolpcProductPrices, type CoolpcProductWriteClient } from "./product-write";

describe("CoolPC product price writer", () => {
  it("creates product, price snapshot, and current price for a new item", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const item = productItem({ price: 4880 });

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-1",
      rawSnapshotId: "raw-snapshot-1",
      sourceCategoryId: item.sourceCategoryId,
      fetchedAt: item.fetchedAt,
      items: [item],
    });

    expect(result).toEqual({
      processedItemCount: 1,
      createdProductCount: 1,
      updatedProductCount: 0,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.transactionCallCount).toBe(1);
    expect(client.products[0]).toMatchObject({
      id: "product-1",
      sourceCategoryId: item.sourceCategoryId,
      ibuyToken: item.ibuyToken,
      name: item.name,
      normalizedName: item.normalizedName,
      firstSeenAt: item.fetchedAt,
      lastSeenAt: item.fetchedAt,
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
    });
    expect(client.priceSnapshots[0]).toMatchObject({
      id: "price-snapshot-1",
      productId: "product-1",
      price: 4880,
      currency: "TWD",
      capturedAt: item.fetchedAt,
      crawlRunId: "crawl-run-1",
      rawSnapshotId: "raw-snapshot-1",
    });
    expect(client.currentPrices[0]).toMatchObject({
      productId: "product-1",
      priceSnapshotId: "price-snapshot-1",
      lastSeenAt: item.fetchedAt,
      priceChangedAt: item.fetchedAt,
    });
  });

  it("updates product identity fields and creates a new price snapshot when price changes", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    client.seedProductWithCurrentPrice(
      productItem({
        name: "AMD Ryzen 5 7500F old name",
        normalizedName: "amd ryzen 5 7500f old name",
        price: 4880,
        fetchedAt: previousSeenAt,
      }),
    );
    const nextItem = productItem({
      name: "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
      normalizedName: "amd ryzen 5 7500f mpk【6核/12緒】3.7g",
      price: 4990,
      fetchedAt: new Date("2026-05-27T11:00:00.000Z"),
    });

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: nextItem.sourceCategoryId,
      fetchedAt: nextItem.fetchedAt,
      items: [nextItem],
    });

    expect(result).toMatchObject({
      createdProductCount: 0,
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      name: nextItem.name,
      normalizedName: nextItem.normalizedName,
      lastSeenAt: nextItem.fetchedAt,
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
    });
    expect(client.priceSnapshots).toHaveLength(2);
    expect(client.priceSnapshots[1]).toMatchObject({
      id: "price-snapshot-2",
      price: 4990,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
    });
    expect(client.currentPrices[0]).toMatchObject({
      priceSnapshotId: "price-snapshot-2",
      lastSeenAt: nextItem.fetchedAt,
      priceChangedAt: nextItem.fetchedAt,
    });
  });

  it("does not create duplicate price snapshots when price is unchanged", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    const previousItem = productItem({ price: 4880, fetchedAt: previousSeenAt });
    client.seedProductWithCurrentPrice(previousItem);
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: previousItem.sourceCategoryId,
      fetchedAt: nextSeenAt,
      items: [productItem({ price: 4880, fetchedAt: nextSeenAt })],
    });

    expect(result).toMatchObject({
      createdProductCount: 0,
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 0,
      priceUnchangedCount: 1,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.priceSnapshots).toHaveLength(1);
    expect(client.currentPrices[0]).toMatchObject({
      priceSnapshotId: "price-snapshot-1",
      lastSeenAt: nextSeenAt,
      priceChangedAt: previousSeenAt,
    });
    expect(client.products[0]?.lastSeenAt).toEqual(nextSeenAt);
  });

  it("recreates current price when an existing product has no current price row", async () => {
    const client = new FakeCoolpcProductWriteClient();
    client.seedProductWithoutCurrentPrice(productItem({ price: 4880 }));
    const fetchedAt = new Date("2026-05-27T11:00:00.000Z");

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt,
      items: [productItem({ price: 4880, fetchedAt })],
    });

    expect(result).toMatchObject({
      createdProductCount: 0,
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 1,
      priceUnchangedCount: 0,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.priceSnapshots).toHaveLength(1);
    expect(client.currentPrices).toHaveLength(1);
    expect(client.currentPrices[0]?.priceSnapshotId).toBe("price-snapshot-1");
  });

  it("marks existing products missing when they are absent from a successful category parse", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");
    const presentItem = productItem({
      ibuyToken: "CPU-TOKEN-001",
      price: 4880,
      fetchedAt: previousSeenAt,
    });
    const missingItem = productItem({
      ibuyToken: "CPU-TOKEN-002",
      name: "AMD Ryzen 7 7700 old listing",
      normalizedName: "amd ryzen 7 7700 old listing",
      price: 7990,
      fetchedAt: previousSeenAt,
    });
    client.seedProductWithCurrentPrice(presentItem);
    client.seedProductWithCurrentPrice(missingItem);

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt: nextSeenAt,
      items: [productItem({ ibuyToken: "CPU-TOKEN-001", price: 4880, fetchedAt: nextSeenAt })],
    });

    expect(result).toMatchObject({
      processedItemCount: 1,
      updatedProductCount: 1,
      priceUnchangedCount: 1,
      missingProductUpdatedCount: 1,
      markedInactiveProductCount: 0,
    });
    expect(client.products.find((product) => product.ibuyToken === "CPU-TOKEN-002")).toMatchObject({
      isActive: true,
      missingSince: nextSeenAt,
      missingSeenCount: 1,
      lastSeenAt: previousSeenAt,
    });
    expect(client.products).toHaveLength(2);
    expect(client.priceSnapshots).toHaveLength(2);
  });

  it("marks a product inactive on the sixth successful missing crawl", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const missingSince = new Date("2026-05-27T10:00:00.000Z");
    const fetchedAt = new Date("2026-05-27T11:00:00.000Z");
    client.seedProductWithCurrentPrice(productItem({ price: 4880 }), {
      missingSince,
      missingSeenCount: 5,
    });

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt,
      items: [],
    });

    expect(result).toMatchObject({
      processedItemCount: 0,
      missingProductUpdatedCount: 1,
      markedInactiveProductCount: 1,
      priceSnapshotCreatedCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      isActive: false,
      missingSince,
      missingSeenCount: 6,
    });
    expect(client.priceSnapshots).toHaveLength(1);
    expect(client.currentPrices).toHaveLength(1);
  });

  it("restores an inactive product when the same source identity reappears", async () => {
    const client = new FakeCoolpcProductWriteClient();
    const previousSeenAt = new Date("2026-05-27T10:00:00.000Z");
    const nextSeenAt = new Date("2026-05-27T11:00:00.000Z");
    client.seedProductWithCurrentPrice(productItem({ price: 4880, fetchedAt: previousSeenAt }), {
      isActive: false,
      missingSince: new Date("2026-05-27T10:30:00.000Z"),
      missingSeenCount: 6,
    });

    const result = await writeCoolpcProductPrices({
      client,
      crawlRunId: "crawl-run-2",
      rawSnapshotId: "raw-snapshot-2",
      sourceCategoryId: "category-4",
      fetchedAt: nextSeenAt,
      items: [productItem({ price: 4880, fetchedAt: nextSeenAt })],
    });

    expect(result).toMatchObject({
      updatedProductCount: 1,
      priceSnapshotCreatedCount: 0,
      priceUnchangedCount: 1,
      missingProductUpdatedCount: 0,
      markedInactiveProductCount: 0,
    });
    expect(client.products[0]).toMatchObject({
      isActive: true,
      missingSince: null,
      missingSeenCount: 0,
      lastSeenAt: nextSeenAt,
    });
    expect(client.currentPrices[0]).toMatchObject({
      priceSnapshotId: "price-snapshot-1",
      lastSeenAt: nextSeenAt,
      priceChangedAt: previousSeenAt,
    });
  });
});

interface FakeProduct {
  id: string;
  sourceCategoryId: string;
  ibuyToken: string;
  name: string;
  normalizedName: string;
  sourceUrl: string;
  isActive: boolean;
  missingSince: Date | null;
  missingSeenCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface FakePriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
  capturedAt: Date;
  crawlRunId: string;
  rawSnapshotId: string | null;
}

interface FakeCurrentPrice {
  productId: string;
  priceSnapshotId: string;
  lastSeenAt: Date;
  priceChangedAt: Date;
}

// This fake mirrors only the product writer's read/write contract. It is not a
// general in-memory Prisma replacement, which keeps this slice from growing a
// shared test database abstraction too early.
class FakeCoolpcProductWriteClient implements CoolpcProductWriteClient {
  readonly products: FakeProduct[] = [];
  readonly priceSnapshots: FakePriceSnapshot[] = [];
  readonly currentPrices: FakeCurrentPrice[] = [];
  transactionCallCount = 0;

  async $transaction<T>(operation: (client: CoolpcProductWriteClient) => Promise<T>): Promise<T> {
    // Rollback behavior belongs to Prisma integration tests. These unit tests
    // only need to prove that the writer uses a transaction boundary.
    this.transactionCallCount += 1;
    return operation(this);
  }

  product = {
    findUnique: async ({
      where,
    }: Parameters<CoolpcProductWriteClient["product"]["findUnique"]>[0]) => {
      const identity = where.sourceCategoryId_ibuyToken;
      const product =
        this.products.find(
          (candidate) =>
            candidate.sourceCategoryId === identity.sourceCategoryId &&
            candidate.ibuyToken === identity.ibuyToken,
        ) ?? null;

      if (!product) {
        return null;
      }

      const currentPrice =
        this.currentPrices.find((candidate) => candidate.productId === product.id) ?? null;
      // The production query includes currentPrice.priceSnapshot because price
      // comparisons must use the latest persisted history row, not a cached field.
      const priceSnapshot = currentPrice
        ? (this.priceSnapshots.find((candidate) => candidate.id === currentPrice.priceSnapshotId) ??
          null)
        : null;

      return {
        id: product.id,
        currentPrice:
          currentPrice && priceSnapshot
            ? {
                ...currentPrice,
                priceSnapshot,
              }
            : null,
      };
    },
    findMany: async ({ where }: Parameters<CoolpcProductWriteClient["product"]["findMany"]>[0]) =>
      this.products
        .filter((product) => product.sourceCategoryId === where.sourceCategoryId)
        .map((product) => ({
          id: product.id,
          ibuyToken: product.ibuyToken,
          isActive: product.isActive,
          missingSince: product.missingSince,
          missingSeenCount: product.missingSeenCount,
        })),
    create: async ({ data }: Parameters<CoolpcProductWriteClient["product"]["create"]>[0]) => {
      const product: FakeProduct = {
        id: `product-${this.products.length + 1}`,
        sourceCategoryId: data.sourceCategoryId,
        ibuyToken: data.ibuyToken,
        name: data.name,
        normalizedName: data.normalizedName,
        sourceUrl: data.sourceUrl,
        isActive: data.isActive,
        missingSince: data.missingSince,
        missingSeenCount: data.missingSeenCount,
        firstSeenAt: data.firstSeenAt,
        lastSeenAt: data.lastSeenAt,
      };
      this.products.push(product);

      return { id: product.id };
    },
    update: async ({
      where,
      data,
    }: Parameters<CoolpcProductWriteClient["product"]["update"]>[0]) => {
      const product = this.products.find((candidate) => candidate.id === where.id);

      if (!product) {
        throw new Error(`Unknown product: ${where.id}`);
      }

      Object.assign(product, data);
      return { id: product.id };
    },
  };

  priceSnapshot = {
    create: async ({
      data,
    }: Parameters<CoolpcProductWriteClient["priceSnapshot"]["create"]>[0]) => {
      const priceSnapshot: FakePriceSnapshot = {
        id: `price-snapshot-${this.priceSnapshots.length + 1}`,
        productId: data.productId,
        price: data.price,
        currency: data.currency,
        capturedAt: data.capturedAt,
        crawlRunId: data.crawlRunId,
        rawSnapshotId: data.rawSnapshotId,
      };
      this.priceSnapshots.push(priceSnapshot);

      return { id: priceSnapshot.id };
    },
  };

  currentPrice = {
    create: async ({ data }: Parameters<CoolpcProductWriteClient["currentPrice"]["create"]>[0]) => {
      const currentPrice: FakeCurrentPrice = {
        productId: data.productId,
        priceSnapshotId: data.priceSnapshotId,
        lastSeenAt: data.lastSeenAt,
        priceChangedAt: data.priceChangedAt,
      };
      this.currentPrices.push(currentPrice);

      return { productId: currentPrice.productId };
    },
    update: async ({
      where,
      data,
    }: Parameters<CoolpcProductWriteClient["currentPrice"]["update"]>[0]) => {
      const currentPrice = this.currentPrices.find(
        (candidate) => candidate.productId === where.productId,
      );

      if (!currentPrice) {
        throw new Error(`Unknown current price: ${where.productId}`);
      }

      Object.assign(currentPrice, data);
      return { productId: currentPrice.productId };
    },
  };

  seedProductWithCurrentPrice(
    item: ParsedCoolpcProduct,
    overrides: Partial<Pick<FakeProduct, "isActive" | "missingSince" | "missingSeenCount">> = {},
  ): void {
    this.seedProductWithoutCurrentPrice(item, overrides);
    const productId = this.products[this.products.length - 1]?.id;

    if (!productId) {
      throw new Error("Missing seeded product.");
    }

    this.priceSnapshots.push({
      id: "price-snapshot-1",
      productId,
      price: item.price,
      currency: item.currency,
      capturedAt: item.fetchedAt,
      crawlRunId: "crawl-run-1",
      rawSnapshotId: "raw-snapshot-1",
    });
    this.currentPrices.push({
      productId,
      priceSnapshotId: "price-snapshot-1",
      lastSeenAt: item.fetchedAt,
      priceChangedAt: item.fetchedAt,
    });
  }

  seedProductWithoutCurrentPrice(
    item: ParsedCoolpcProduct,
    overrides: Partial<Pick<FakeProduct, "isActive" | "missingSince" | "missingSeenCount">> = {},
  ): void {
    this.products.push({
      id: `product-${this.products.length + 1}`,
      sourceCategoryId: item.sourceCategoryId,
      ibuyToken: item.ibuyToken,
      name: item.name,
      normalizedName: item.normalizedName,
      sourceUrl: item.sourceUrl,
      isActive: overrides.isActive ?? true,
      missingSince: overrides.missingSince ?? null,
      missingSeenCount: overrides.missingSeenCount ?? 0,
      firstSeenAt: item.fetchedAt,
      lastSeenAt: item.fetchedAt,
    });
  }
}

function productItem({
  sourceCategoryId = "category-4",
  ibuyToken = "CPU-TOKEN-001",
  name = "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
  normalizedName = "amd ryzen 5 7500f mpk【6核/12緒】3.7g",
  price,
  fetchedAt = new Date("2026-05-27T10:30:00.000Z"),
}: {
  sourceCategoryId?: string;
  ibuyToken?: string;
  name?: string;
  normalizedName?: string;
  price: number;
  fetchedAt?: Date;
}): ParsedCoolpcProduct {
  return {
    sourceCategoryId,
    igrp: 4,
    sourceName: "處理器 CPU",
    displayName: "CPU",
    ibuyToken,
    sourceItemKey: `coolpc:igrp:4:ibuy:${ibuyToken}`,
    name,
    normalizedName,
    price,
    currency: "TWD",
    sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
    fetchedAt,
  };
}
