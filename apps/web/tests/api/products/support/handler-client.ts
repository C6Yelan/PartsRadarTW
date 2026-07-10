// apps/web/tests/api/products/support/handler-client.ts
// 提供商品列表 API 測試共用的 fake read client、固定資料與查詢條件 builder。

import type {
  SOURCE_STATUS_CATEGORY_QUERY,
  SourceStatusCategoryRecord,
} from "../../../../app/api/source-status/handler";
import type { ProductsReadClient } from "../../../../app/api/products/handler";

export const NOW = new Date("2026-05-28T12:00:00.000Z");
export const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

type ProductFindProductsArgs = Parameters<ProductsReadClient["product"]["findProducts"]>[0];
type ProductFindVendorOptionsArgs = Parameters<
  ProductsReadClient["product"]["findVendorOptions"]
>[0];
type ProductCountArgs = Parameters<ProductsReadClient["product"]["count"]>[0];
type PriceSnapshotFindManyArgs = Parameters<ProductsReadClient["priceSnapshot"]["findMany"]>[0];
type SourceCategoryFindManyArgs = typeof SOURCE_STATUS_CATEGORY_QUERY;
type ProductRecord = Awaited<ReturnType<ProductsReadClient["product"]["findProducts"]>>[number];
type ProductVendorRecord = Awaited<
  ReturnType<ProductsReadClient["product"]["findVendorOptions"]>
>[number];
type PriceSnapshotRecord = Awaited<
  ReturnType<ProductsReadClient["priceSnapshot"]["findMany"]>
>[number];

interface FakeProductsClientOptions {
  products: ProductRecord[];
  priceSnapshots?: PriceSnapshotRecord[];
  vendorOptions?: ProductVendorRecord[];
  totalItems: number;
  sourceCategories: SourceStatusCategoryRecord[];
}

export function fakeProductsClient(options: FakeProductsClientOptions) {
  const state = {
    lastProductFindProductsArgs: undefined as ProductFindProductsArgs | undefined,
    lastProductVendorOptionsArgs: undefined as ProductFindVendorOptionsArgs | undefined,
    lastProductCountArgs: undefined as ProductCountArgs | undefined,
    lastPriceSnapshotFindManyArgs: undefined as PriceSnapshotFindManyArgs | undefined,
    lastSourceCategoryFindManyArgs: undefined as SourceCategoryFindManyArgs | undefined,
    productFindProductsCallCount: 0,
    productFindVendorOptionsCallCount: 0,
    productCountCallCount: 0,
    priceSnapshotFindManyCallCount: 0,
    sourceCategoryFindManyCallCount: 0,
  };

  return {
    get lastProductFindProductsArgs() {
      return state.lastProductFindProductsArgs;
    },
    get lastProductVendorOptionsArgs() {
      return state.lastProductVendorOptionsArgs;
    },
    get lastProductCountArgs() {
      return state.lastProductCountArgs;
    },
    get lastPriceSnapshotFindManyArgs() {
      return state.lastPriceSnapshotFindManyArgs;
    },
    get lastSourceCategoryFindManyArgs() {
      return state.lastSourceCategoryFindManyArgs;
    },
    get productFindProductsCallCount() {
      return state.productFindProductsCallCount;
    },
    get productFindVendorOptionsCallCount() {
      return state.productFindVendorOptionsCallCount;
    },
    get productCountCallCount() {
      return state.productCountCallCount;
    },
    get priceSnapshotFindManyCallCount() {
      return state.priceSnapshotFindManyCallCount;
    },
    get sourceCategoryFindManyCallCount() {
      return state.sourceCategoryFindManyCallCount;
    },
    product: {
      async findProducts(args) {
        state.productFindProductsCallCount += 1;
        state.lastProductFindProductsArgs = args;

        return options.products;
      },
      async findVendorOptions(args) {
        state.productFindVendorOptionsCallCount += 1;
        state.lastProductVendorOptionsArgs = args;

        return options.vendorOptions ?? [];
      },
      async count(args) {
        state.productCountCallCount += 1;
        state.lastProductCountArgs = args;

        return options.totalItems;
      },
    },
    priceSnapshot: {
      async findMany(args) {
        state.priceSnapshotFindManyCallCount += 1;
        state.lastPriceSnapshotFindManyArgs = args;

        return options.priceSnapshots ?? [];
      },
    },
    sourceCategory: {
      async findMany(args) {
        state.sourceCategoryFindManyCallCount += 1;
        state.lastSourceCategoryFindManyArgs = args;

        return options.sourceCategories;
      },
    },
  } satisfies ProductsReadClient & {
    lastProductFindProductsArgs?: ProductFindProductsArgs;
    lastProductVendorOptionsArgs?: ProductFindVendorOptionsArgs;
    lastProductCountArgs?: ProductCountArgs;
    lastPriceSnapshotFindManyArgs?: PriceSnapshotFindManyArgs;
    lastSourceCategoryFindManyArgs?: SourceCategoryFindManyArgs;
    productFindProductsCallCount: number;
    productFindVendorOptionsCallCount: number;
    productCountCallCount: number;
    priceSnapshotFindManyCallCount: number;
    sourceCategoryFindManyCallCount: number;
  };
}

export function priceSnapshot(overrides: Partial<PriceSnapshotRecord> = {}): PriceSnapshotRecord {
  return {
    productId: PRODUCT_ID,
    price: 7590,
    capturedAt: new Date("2026-05-01T08:00:00.000Z"),
    ...overrides,
  };
}

export function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: PRODUCT_ID,
    ibuyToken: "GPU-RTX-4070",
    name: "GPU RTX 4070",
    primaryImageUrl: "https://www.coolpc.com.tw/eval/12/gpu-rtx-4070.jpg",
    isActive: true,
    currentPrice: {
      lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
      priceSnapshot: {
        price: 6990,
        currency: "TWD",
        capturedAt: new Date("2026-05-28T11:45:00.000Z"),
      },
    },
    sourceCategory: {
      id: "category-12",
      igrp: 12,
      displayName: "顯示卡",
      sourceName: "顯示卡 VGA",
    },
    ...overrides,
  };
}

export function vendorOption(overrides: Partial<ProductVendorRecord> = {}): ProductVendorRecord {
  return {
    vendorSlug: "asus",
    vendorName: "華碩",
    ...overrides,
  };
}

export function searchTokenWhere(token: string) {
  return {
    OR: [
      {
        name: {
          contains: token,
          mode: "insensitive",
        },
      },
      {
        normalizedName: {
          contains: token,
          mode: "insensitive",
        },
      },
      {
        vendorSlug: {
          contains: token,
          mode: "insensitive",
        },
      },
      {
        vendorName: {
          contains: token,
          mode: "insensitive",
        },
      },
    ],
  };
}

export function sourceStatusCategory(
  overrides: Partial<SourceStatusCategoryRecord> = {},
): SourceStatusCategoryRecord {
  return {
    igrp: 12,
    displayName: "顯示卡",
    sourceName: "顯示卡 VGA",
    lastCheckedAt: new Date("2026-05-28T11:55:00.000Z"),
    lastSuccessAt: new Date("2026-05-28T11:50:00.000Z"),
    products: [{ id: PRODUCT_ID }],
    ...overrides,
  };
}
