import type { ParsedCoolpcProduct } from "../../../src/coolpc/parser";
import type { CoolpcProductWriteClient } from "../../../src/coolpc/product-write";

export interface FakeProduct {
  id: string;
  sourceCategoryId: string;
  ibuyToken: string;
  name: string;
  normalizedName: string;
  vendorSlug: string | null;
  vendorName: string | null;
  primaryImageUrl: string | null;
  primaryImageCheckedAt: Date | null;
  introductionUrl: string | null;
  sourceUrl: string;
  isActive: boolean;
  missingSince: Date | null;
  missingSeenCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface FakePriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: ParsedCoolpcProduct["currency"];
  capturedAt: Date;
  crawlRunId: string;
  rawSnapshotId: string | null;
}

export interface FakeCurrentPrice {
  productId: string;
  priceSnapshotId: string;
  lastSeenAt: Date;
  priceChangedAt: Date;
}

// This fake mirrors only the product writer's read/write contract. It is not a
// general in-memory Prisma replacement, which keeps this slice from growing a
// shared test database abstraction too early.
export class FakeCoolpcProductWriteClient implements CoolpcProductWriteClient {
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
        vendorSlug: data.vendorSlug,
        vendorName: data.vendorName,
        primaryImageUrl: data.primaryImageUrl,
        primaryImageCheckedAt: data.primaryImageCheckedAt,
        introductionUrl: data.introductionUrl,
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
      vendorSlug: item.vendorSlug,
      vendorName: item.vendorName,
      primaryImageUrl: item.primaryImageUrl,
      primaryImageCheckedAt: item.fetchedAt,
      introductionUrl: item.introductionUrl,
      sourceUrl: item.sourceUrl,
      isActive: overrides.isActive ?? true,
      missingSince: overrides.missingSince ?? null,
      missingSeenCount: overrides.missingSeenCount ?? 0,
      firstSeenAt: item.fetchedAt,
      lastSeenAt: item.fetchedAt,
    });
  }
}

export function productItem({
  sourceCategoryId = "category-4",
  ibuyToken = "CPU-TOKEN-001",
  name = "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
  normalizedName = "amd ryzen 5 7500f mpk【6核/12緒】3.7g",
  vendorSlug = "amd",
  vendorName = "AMD",
  primaryImageUrl = "https://www.coolpc.com.tw/eval/4/amd7500f.jpg",
  introductionUrl = "https://www.amd.com/zh-tw/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7500f.html",
  price,
  fetchedAt = new Date("2026-05-27T10:30:00.000Z"),
}: {
  sourceCategoryId?: string;
  ibuyToken?: string;
  name?: string;
  normalizedName?: string;
  vendorSlug?: string | null;
  vendorName?: string | null;
  primaryImageUrl?: string | null;
  introductionUrl?: string | null;
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
    vendorSlug,
    vendorName,
    primaryImageUrl,
    introductionUrl,
    price,
    currency: "TWD",
    sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=4",
    fetchedAt,
  };
}
