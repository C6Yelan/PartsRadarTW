import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../app/api/_shared/responses";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../../../app/api/source-status/handler";
import { createGetProductsHandler } from "../../../app/api/products/handler";
import {
  fakeProductsClient,
  NOW,
  PRODUCT_ID,
  product,
  priceSnapshot,
  searchTokenWhere,
  sourceStatusCategory,
  vendorOption,
} from "./support/handler-client";

describe("GET /api/products handler", () => {
  it("returns paginated products with public-safe fields and source status meta", async () => {
    const client = fakeProductsClient({
      products: [product()],
      priceSnapshots: [
        priceSnapshot(),
        priceSnapshot({
          price: 6990,
          capturedAt: new Date("2026-05-28T11:45:00.000Z"),
        }),
      ],
      totalItems: 12,
      sourceCategories: [
        sourceStatusCategory({
          igrp: 12,
          displayName: "顯示卡",
          sourceName: "顯示卡 VGA",
          lastSuccessAt: new Date("2026-05-28T11:50:00.000Z"),
          products: [{ id: PRODUCT_ID }],
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
        AND: [searchTokenWhere("RTX")],
      },
      orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
      skip: 1,
      take: 1,
    });
    expect(client.lastProductFindProductsArgs?.select).not.toHaveProperty("ibuyToken");
    expect(client.lastProductFindProductsArgs?.select).not.toHaveProperty("sourceUrl");
    expect(client.lastProductCountArgs?.where).toEqual(client.lastProductFindProductsArgs?.where);
    expect(client.lastPriceSnapshotFindManyArgs).toMatchObject({
      where: {
        productId: {
          in: [PRODUCT_ID],
        },
        capturedAt: {
          lte: NOW,
        },
      },
      orderBy: [{ productId: "asc" }, { capturedAt: "asc" }],
    });
    expect(client.lastSourceCategoryFindManyArgs).toEqual(SOURCE_STATUS_CATEGORY_QUERY);
    expect(body).toEqual({
      data: [
        {
          id: PRODUCT_ID,
          name: "GPU RTX 4070",
          category: {
            id: "category-12",
            igrp: 12,
            displayName: "顯示卡",
            sourceName: "顯示卡 VGA",
          },
          image: {
            url: `/api/product-images/${PRODUCT_ID}.webp`,
            alt: "GPU RTX 4070",
            capturedAt: "2026-05-28T11:55:00.000Z",
          },
          price: {
            amount: 6990,
            currency: "TWD",
            capturedAt: "2026-05-28T11:45:00.000Z",
            lastSeenAt: "2026-05-28T11:55:00.000Z",
          },
          priceMovement: {
            rangeDays: 30,
            deltaAmount: -600,
            deltaPercent: -7.91,
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
    expect(client.priceSnapshotFindManyCallCount).toBe(0);
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

  it("sorts products by the largest 30-day price drop before paginating", async () => {
    const largestDropProduct = product({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Largest drop GPU",
      currentPrice: currentPrice(1500),
    });
    const smallerDropProduct = product({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Smaller drop GPU",
      currentPrice: currentPrice(900),
    });
    const flatProduct = product({
      id: "33333333-3333-3333-3333-333333333333",
      name: "Flat GPU",
      currentPrice: currentPrice(1000),
    });
    const noHistoryProduct = product({
      id: "44444444-4444-4444-4444-444444444444",
      name: "No history GPU",
      currentPrice: currentPrice(1200),
    });
    const client = fakeProductsClient({
      products: [flatProduct, noHistoryProduct, smallerDropProduct, largestDropProduct],
      priceSnapshots: [
        priceSnapshot({
          productId: largestDropProduct.id,
          price: 3000,
        }),
        priceSnapshot({
          productId: smallerDropProduct.id,
          price: 1000,
        }),
        priceSnapshot({
          productId: flatProduct.id,
          price: 1000,
        }),
      ],
      totalItems: 4,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request("https://parts.example/api/products?sort=price_drop_desc&page=1&pageSize=2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.lastProductFindProductsArgs).toMatchObject({
      orderBy: [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }],
    });
    expect(client.lastProductFindProductsArgs?.skip).toBeUndefined();
    expect(client.lastProductFindProductsArgs?.take).toBeUndefined();
    expect(client.lastPriceSnapshotFindManyArgs?.where).toMatchObject({
      productId: {
        in: [
          flatProduct.id,
          noHistoryProduct.id,
          smallerDropProduct.id,
          largestDropProduct.id,
        ],
      },
    });
    expect(body.data.map((item: { id: string }) => item.id)).toEqual([
      largestDropProduct.id,
      smallerDropProduct.id,
    ]);
    expect(
      body.data.map(
        (item: { priceMovement: { deltaPercent: number | null } }) =>
          item.priceMovement.deltaPercent,
      ),
    ).toEqual([-50, -10]);
    expect(body.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      totalItems: 4,
      totalPages: 2,
    });
  });

  it("sorts products by the largest 30-day price rise before paginating", async () => {
    const largestRiseProduct = product({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Largest rise GPU",
      currentPrice: currentPrice(2000),
    });
    const smallerRiseProduct = product({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Smaller rise GPU",
      currentPrice: currentPrice(1200),
    });
    const flatProduct = product({
      id: "33333333-3333-3333-3333-333333333333",
      name: "Flat GPU",
      currentPrice: currentPrice(1000),
    });
    const dropProduct = product({
      id: "44444444-4444-4444-4444-444444444444",
      name: "Drop GPU",
      currentPrice: currentPrice(900),
    });
    const noHistoryProduct = product({
      id: "55555555-5555-5555-5555-555555555555",
      name: "No history GPU",
      currentPrice: currentPrice(1500),
    });
    const client = fakeProductsClient({
      products: [
        flatProduct,
        noHistoryProduct,
        smallerRiseProduct,
        dropProduct,
        largestRiseProduct,
      ],
      priceSnapshots: [
        priceSnapshot({
          productId: largestRiseProduct.id,
          price: 1000,
        }),
        priceSnapshot({
          productId: smallerRiseProduct.id,
          price: 1000,
        }),
        priceSnapshot({
          productId: flatProduct.id,
          price: 1000,
        }),
        priceSnapshot({
          productId: dropProduct.id,
          price: 1000,
        }),
      ],
      totalItems: 5,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request("https://parts.example/api/products?sort=price_rise_desc&page=1&pageSize=2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.lastProductFindProductsArgs).toMatchObject({
      orderBy: [{ currentPrice: { priceSnapshot: { price: "desc" } } }, { id: "asc" }],
    });
    expect(client.lastProductFindProductsArgs?.skip).toBeUndefined();
    expect(client.lastProductFindProductsArgs?.take).toBeUndefined();
    expect(client.lastPriceSnapshotFindManyArgs?.where).toMatchObject({
      productId: {
        in: [
          flatProduct.id,
          noHistoryProduct.id,
          smallerRiseProduct.id,
          dropProduct.id,
          largestRiseProduct.id,
        ],
      },
    });
    expect(body.data.map((item: { id: string }) => item.id)).toEqual([
      largestRiseProduct.id,
      smallerRiseProduct.id,
    ]);
    expect(
      body.data.map(
        (item: { priceMovement: { deltaPercent: number | null } }) =>
          item.priceMovement.deltaPercent,
      ),
    ).toEqual([100, 20]);
    expect(body.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      totalItems: 5,
      totalPages: 3,
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

  it("splits search text into required order-independent tokens", async () => {
    const client = fakeProductsClient({
      products: [],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request("https://parts.example/api/products?q=4070%20asus"),
    );

    expect(response.status).toBe(200);
    expect(client.lastProductFindProductsArgs).toMatchObject({
      where: {
        AND: [searchTokenWhere("4070"), searchTokenWhere("asus")],
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
    expect(client.priceSnapshotFindManyCallCount).toBe(0);
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

function currentPrice(price: number) {
  return {
    lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
    priceSnapshot: {
      price,
      currency: "TWD" as const,
      capturedAt: new Date("2026-05-28T11:45:00.000Z"),
    },
  };
}
