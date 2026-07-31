// apps/web/tests/api/products/support/handler-client.ts
// 提供商品列表 API 測試共用的 fake read client、固定資料與查詢條件 builder。

import type {
  SOURCE_STATUS_CATEGORY_QUERY,
  SourceStatusCategoryRecord,
} from "../../../../app/api/source-status/data";
import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  type ProductsReadClient,
} from "../../../../app/api/products/data";

export const NOW = new Date("2026-05-28T12:00:00.000Z");
export const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

type ProductFindProductsArgs = Parameters<ProductsReadClient["product"]["findProducts"]>[0];
type ProductFindVendorOptionsArgs = Parameters<
  ProductsReadClient["product"]["findVendorOptions"]
>[0];
type ProductCountArgs = Parameters<ProductsReadClient["product"]["count"]>[0];
type SourceCategoryFindManyArgs = typeof SOURCE_STATUS_CATEGORY_QUERY;
type ProductRecord = Awaited<ReturnType<ProductsReadClient["product"]["findProducts"]>>[number];
type ProductVendorRecord = Awaited<
  ReturnType<ProductsReadClient["product"]["findVendorOptions"]>
>[number];
interface PriceSnapshotRecord {
  capturedAt: Date;
  price: number;
  productId: string;
}

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
    lastSourceCategoryFindManyArgs: undefined as SourceCategoryFindManyArgs | undefined,
    productFindProductsCallCount: 0,
    productFindVendorOptionsCallCount: 0,
    productCountCallCount: 0,
    movementFindPageCallCount: 0,
    movementFindSummariesCallCount: 0,
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
    get movementFindPageCallCount() {
      return state.movementFindPageCallCount;
    },
    get movementFindSummariesCallCount() {
      return state.movementFindSummariesCallCount;
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
    movement: {
      async findSummaries(productIds, now) {
        state.movementFindSummariesCallCount += 1;
        const selected = options.products.filter((product) => productIds.includes(product.id));
        const movement = buildFakeMovementMap(selected, options.priceSnapshots ?? [], now);
        return selected.map((product) => ({
          productId: product.id,
          ...requireMovement(movement, product.id),
        }));
      },
      async findPage(args) {
        state.movementFindPageCallCount += 1;
        const movement = buildFakeMovementMap(
          options.products,
          options.priceSnapshots ?? [],
          args.now,
        );
        const direction = args.sort === "price_drop_desc" ? -1 : 1;
        const sorted = [...options.products].sort((left, right) => {
          const leftMovement = requireMovement(movement, left.id);
          const rightMovement = requireMovement(movement, right.id);
          const leftDirectional =
            leftMovement.deltaAmount !== null &&
            leftMovement.deltaPercent !== null &&
            leftMovement.deltaAmount * direction > 0 &&
            leftMovement.deltaPercent * direction > 0;
          const rightDirectional =
            rightMovement.deltaAmount !== null &&
            rightMovement.deltaPercent !== null &&
            rightMovement.deltaAmount * direction > 0 &&
            rightMovement.deltaPercent * direction > 0;
          if (leftDirectional !== rightDirectional) return leftDirectional ? -1 : 1;
          if (leftDirectional && rightDirectional) {
            const percent =
              direction * ((rightMovement.deltaPercent ?? 0) - (leftMovement.deltaPercent ?? 0));
            if (percent !== 0) return percent;
            const amount =
              direction * ((rightMovement.deltaAmount ?? 0) - (leftMovement.deltaAmount ?? 0));
            if (amount !== 0) return amount;
          }
          return left.id.localeCompare(right.id);
        });
        const start = Math.min((args.page - 1) * args.pageSize, sorted.length);
        const page = sorted.slice(start, start + args.pageSize);
        return {
          productIds: page.map((product) => product.id),
          summaries: page.map((product) => ({
            productId: product.id,
            ...requireMovement(movement, product.id),
          })),
          totalItems: options.totalItems,
        };
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
    lastSourceCategoryFindManyArgs?: SourceCategoryFindManyArgs;
    productFindProductsCallCount: number;
    productFindVendorOptionsCallCount: number;
    productCountCallCount: number;
    movementFindPageCallCount: number;
    movementFindSummariesCallCount: number;
    sourceCategoryFindManyCallCount: number;
  };
}

function requireMovement<T>(movement: ReadonlyMap<string, T>, productId: string): T {
  const value = movement.get(productId);
  if (!value) throw new Error("Fake movement fixture is missing a product summary.");
  return value;
}

function buildFakeMovementMap(
  products: ProductRecord[],
  snapshots: PriceSnapshotRecord[],
  now: Date,
): Map<string, { deltaAmount: number | null; deltaPercent: number | null }> {
  const since = new Date(
    now.getTime() - PRODUCT_PRICE_MOVEMENT_RANGE_DAYS * 24 * 60 * 60 * 1000,
  );
  return new Map<string, { deltaAmount: number | null; deltaPercent: number | null }>(
    products.map((product) => {
      const history = snapshots
        .filter((snapshot) => snapshot.productId === product.id && snapshot.capturedAt <= now)
        .sort((left, right) => left.capturedAt.getTime() - right.capturedAt.getTime());
      const inRange = history.filter((snapshot) => snapshot.capturedAt >= since);
      const before = history.findLast((snapshot) => snapshot.capturedAt < since);
      const baseline = before ?? inRange[0] ?? null;
      const current = product.currentPrice;
      const onlyInitial =
        !before &&
        inRange.length === 1 &&
        inRange[0]?.capturedAt.getTime() === current?.lastSeenAt.getTime();
      if (!baseline || !current || current.lastSeenAt < since || onlyInitial) {
        return [product.id, { deltaAmount: null, deltaPercent: null }] as const;
      }
      const deltaAmount = current.priceSnapshot.price - baseline.price;
      return [
        product.id,
        {
          deltaAmount,
          deltaPercent:
            baseline.price === 0 ? null : Number(((deltaAmount / baseline.price) * 100).toFixed(2)),
        },
      ] as const;
    }),
  );
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
    imageCachedAt: new Date("2026-05-28T11:50:00.000Z"),
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
