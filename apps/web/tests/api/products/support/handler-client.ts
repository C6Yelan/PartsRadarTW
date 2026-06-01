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
type SourceCategoryFindManyArgs = typeof SOURCE_STATUS_CATEGORY_QUERY;
type ProductRecord = Awaited<ReturnType<ProductsReadClient["product"]["findProducts"]>>[number];
type ProductVendorRecord = Awaited<
  ReturnType<ProductsReadClient["product"]["findVendorOptions"]>
>[number];

interface FakeProductsClientOptions {
  products: ProductRecord[];
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
    sourceCategoryFindManyCallCount: number;
  };
}

export function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: PRODUCT_ID,
    name: "GPU RTX 4070",
    primaryImageUrl: "https://www.coolpc.com.tw/eval/12/gpu-rtx-4070.jpg",
    primaryImageCheckedAt: new Date("2026-05-28T11:55:00.000Z"),
    isActive: true,
    missingSince: null,
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
