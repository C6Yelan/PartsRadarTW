// apps/web/tests/api/products/[id]/price-history/support.ts
// 提供商品價格歷史 API 測試共用的 fake read client、固定時間與價格資料 builder。

import type { ProductPriceHistoryReadClient } from "../../../../../app/api/products/[id]/price-history/handler";

export const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
export const NOW = new Date("2026-06-01T12:00:00.000Z");

type ProductFindFirstArgs = Parameters<ProductPriceHistoryReadClient["product"]["findFirst"]>[0];
type PriceSnapshotFindManyArgs = Parameters<
  ProductPriceHistoryReadClient["priceSnapshot"]["findMany"]
>[0];
type ProductRecord = Awaited<ReturnType<ProductPriceHistoryReadClient["product"]["findFirst"]>>;
type SnapshotRecord = Awaited<
  ReturnType<ProductPriceHistoryReadClient["priceSnapshot"]["findMany"]>
>[number];

export function fakePriceHistoryClient({
  productResult,
  snapshots,
}: {
  productResult: ProductRecord;
  snapshots: SnapshotRecord[];
}) {
  const state = {
    lastProductFindFirstArgs: undefined as ProductFindFirstArgs | undefined,
    lastPriceSnapshotFindManyArgs: undefined as PriceSnapshotFindManyArgs | undefined,
    productFindFirstCallCount: 0,
    priceSnapshotFindManyCallCount: 0,
  };

  return {
    get lastProductFindFirstArgs() {
      return state.lastProductFindFirstArgs;
    },
    get lastPriceSnapshotFindManyArgs() {
      return state.lastPriceSnapshotFindManyArgs;
    },
    get productFindFirstCallCount() {
      return state.productFindFirstCallCount;
    },
    get priceSnapshotFindManyCallCount() {
      return state.priceSnapshotFindManyCallCount;
    },
    product: {
      async findFirst(args) {
        state.productFindFirstCallCount += 1;
        state.lastProductFindFirstArgs = args;

        return productResult;
      },
    },
    priceSnapshot: {
      async findMany(args) {
        state.priceSnapshotFindManyCallCount += 1;
        state.lastPriceSnapshotFindManyArgs = args;

        return snapshots;
      },
    },
  } satisfies ProductPriceHistoryReadClient & {
    lastProductFindFirstArgs?: ProductFindFirstArgs;
    lastPriceSnapshotFindManyArgs?: PriceSnapshotFindManyArgs;
    productFindFirstCallCount: number;
    priceSnapshotFindManyCallCount: number;
  };
}

export function snapshot(price: number, capturedAt: string): SnapshotRecord {
  return {
    price,
    currency: "TWD",
    capturedAt: new Date(capturedAt),
  };
}

export function productRecord({
  price = 5900,
  capturedAt = "2026-05-20T08:00:00.000Z",
  lastSeenAt = capturedAt,
}: {
  price?: number;
  capturedAt?: string;
  lastSeenAt?: string;
} = {}): NonNullable<ProductRecord> {
  return {
    id: PRODUCT_ID,
    currentPrice: {
      lastSeenAt: new Date(lastSeenAt),
      priceSnapshot: snapshot(price, capturedAt),
    },
  };
}
