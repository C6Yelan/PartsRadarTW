import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../_shared/responses";
import {
  SOURCE_STATUS_CATEGORY_QUERY,
  type SourceStatusCategoryRecord,
} from "../source-status/handler";
import { createGetProductsHandler, type ProductsReadClient } from "./handler";

const NOW = new Date("2026-05-28T12:00:00.000Z");

describe("GET /api/products handler", () => {
  it("returns paginated products with public-safe fields and source status meta", async () => {
    const client = fakeProductsClient({
      products: [product()],
      totalItems: 12,
      sourceCategories: [
        sourceStatusCategory({
          igrp: 12,
          displayName: "顯示卡",
          sourceName: "顯示卡 VGA",
          lastSuccessAt: new Date("2026-05-28T11:50:00.000Z"),
          products: [{ id: "product-1" }],
        }),
      ],
    });
    const request = new Request(
      "https://parts.example/api/products?q=RTX&igrp=12&minPrice=4000&maxPrice=9000&status=all&sort=name_asc&page=2&pageSize=1",
    );

    const response = await createGetProductsHandler(client, { now: () => NOW })(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.lastProductFindProductsArgs).toMatchObject({
      where: {
        sourceCategory: {
          enabled: true,
          igrp: 12,
        },
        primaryImageUrl: {
          not: null,
        },
        primaryImageCheckedAt: {
          not: null,
        },
        currentPrice: {
          is: {
            priceSnapshot: {
              price: {
                gte: 4000,
                lte: 9000,
              },
            },
          },
        },
        OR: [
          {
            name: {
              contains: "RTX",
              mode: "insensitive",
            },
          },
          {
            normalizedName: {
              contains: "RTX",
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
      skip: 1,
      take: 1,
    });
    expect(client.lastProductFindProductsArgs?.select).not.toHaveProperty("ibuyToken");
    expect(client.lastProductFindProductsArgs?.select).not.toHaveProperty("sourceUrl");
    expect(client.lastProductCountArgs?.where).toEqual(client.lastProductFindProductsArgs?.where);
    expect(client.lastSourceCategoryFindManyArgs).toEqual(SOURCE_STATUS_CATEGORY_QUERY);
    expect(body).toEqual({
      data: [
        {
          id: "product-1",
          name: "GPU RTX 4070",
          category: {
            id: "category-12",
            igrp: 12,
            displayName: "顯示卡",
            sourceName: "顯示卡 VGA",
          },
          image: {
            url: "https://www.coolpc.com.tw/eval/12/gpu-rtx-4070.jpg",
            alt: "GPU RTX 4070",
            capturedAt: "2026-05-28T11:55:00.000Z",
          },
          price: {
            amount: 6990,
            currency: "TWD",
            capturedAt: "2026-05-28T11:45:00.000Z",
            lastSeenAt: "2026-05-28T11:55:00.000Z",
          },
          source: {
            name: "coolpc",
            url: "https://www.coolpc.com.tw/eachview.php?IGrp=12",
          },
          status: {
            isActive: true,
            missingSince: null,
          },
        },
      ],
      pagination: {
        page: 2,
        pageSize: 1,
        totalItems: 12,
        totalPages: 12,
      },
      meta: {
        sourceStatus: "ok",
        lastSuccessAt: "2026-05-28T11:50:00.000Z",
        vendors: [],
      },
    });
    expect(JSON.stringify(body)).not.toContain("iBuyToken");
    expect(JSON.stringify(body)).not.toContain("source_item_key");
    expect(JSON.stringify(body)).not.toContain("PHPSESSID");
  });

  it("applies default active filtering and price sorting", async () => {
    const client = fakeProductsClient({
      products: [],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request("https://parts.example/api/products"),
    );

    expect(response.status).toBe(200);
    expect(client.lastProductFindProductsArgs).toMatchObject({
      where: {
        isActive: true,
        sourceCategory: {
          enabled: true,
        },
        primaryImageUrl: {
          not: null,
        },
        primaryImageCheckedAt: {
          not: null,
        },
      },
      orderBy: [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }],
      skip: 0,
      take: 24,
    });
    expect(await response.json()).toMatchObject({
      pagination: {
        page: 1,
        pageSize: 24,
        totalItems: 0,
        totalPages: 0,
      },
      meta: {
        sourceStatus: "unavailable",
        lastSuccessAt: null,
        vendors: [],
      },
    });
  });

  it("applies vendor filtering within the selected category", async () => {
    const client = fakeProductsClient({
      products: [],
      vendorOptions: [
        vendorOption({ vendorSlug: "asus", vendorName: "華碩" }),
        vendorOption({ vendorSlug: "msi", vendorName: "微星" }),
      ],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request("https://parts.example/api/products?igrp=12&vendors=asus,msi"),
    );

    expect(response.status).toBe(200);
    expect(client.lastProductVendorOptionsArgs).toMatchObject({
      where: {
        sourceCategory: {
          enabled: true,
          igrp: 12,
        },
        primaryImageUrl: {
          not: null,
        },
        primaryImageCheckedAt: {
          not: null,
        },
        currentPrice: {
          isNot: null,
        },
        vendorSlug: { not: null },
        vendorName: { not: null },
      },
      distinct: ["vendorSlug"],
    });
    expect(client.lastProductFindProductsArgs).toMatchObject({
      where: {
        sourceCategory: {
          enabled: true,
          igrp: 12,
        },
        AND: [
          {
            vendorSlug: {
              in: ["asus", "msi"],
            },
          },
        ],
      },
    });
  });

  it("rejects vendor filtering without a selected category", async () => {
    const client = fakeProductsClient({
      products: [],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client)(
      new Request("https://parts.example/api/products?vendors=asus"),
    );

    expect(response.status).toBe(400);
    expect(client.productFindProductsCallCount).toBe(0);
    expect(client.productFindVendorOptionsCallCount).toBe(0);
  });

  it("rejects invalid query values before reading data", async () => {
    const client = fakeProductsClient({
      products: [],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client)(
      new Request("https://parts.example/api/products?sort=updated_desc"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_query",
        message: API_ERROR_MESSAGES.invalidQuery,
      },
    });
    expect(client.productFindProductsCallCount).toBe(0);
    expect(client.productFindVendorOptionsCallCount).toBe(0);
    expect(client.productCountCallCount).toBe(0);
    expect(client.sourceCategoryFindManyCallCount).toBe(0);
  });

  it("rejects an inverted price range", async () => {
    const response = await createGetProductsHandler(
      fakeProductsClient({
        products: [],
        totalItems: 0,
        sourceCategories: [],
      }),
    )(new Request("https://parts.example/api/products?minPrice=9000&maxPrice=4000"));

    expect(response.status).toBe(400);
  });

  it("returns a generic 500 response when product lookup fails", async () => {
    const response = await createGetProductsHandler({
      ...fakeProductsClient({
        products: [],
        totalItems: 0,
        sourceCategories: [],
      }),
      product: {
        findProducts: async () => {
          throw new Error("Prisma stack with DATABASE_URL and iBuyToken");
        },
        findVendorOptions: async () => [],
        count: async () => 0,
      },
    })(new Request("https://parts.example/api/products"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });
});

type ProductFindProductsArgs = Parameters<ProductsReadClient["product"]["findProducts"]>[0];
type ProductFindVendorOptionsArgs = Parameters<
  ProductsReadClient["product"]["findVendorOptions"]
>[0];
type ProductCountArgs = Parameters<ProductsReadClient["product"]["count"]>[0];
type SourceCategoryFindManyArgs = Parameters<ProductsReadClient["sourceCategory"]["findMany"]>[0];
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

function fakeProductsClient(options: FakeProductsClientOptions) {
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

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "product-1",
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

function vendorOption(overrides: Partial<ProductVendorRecord> = {}): ProductVendorRecord {
  return {
    vendorSlug: "asus",
    vendorName: "華碩",
    ...overrides,
  };
}

function sourceStatusCategory(
  overrides: Partial<SourceStatusCategoryRecord> = {},
): SourceStatusCategoryRecord {
  return {
    igrp: 12,
    displayName: "顯示卡",
    sourceName: "顯示卡 VGA",
    lastCheckedAt: new Date("2026-05-28T11:55:00.000Z"),
    lastSuccessAt: new Date("2026-05-28T11:50:00.000Z"),
    products: [{ id: "product-1" }],
    ...overrides,
  };
}
