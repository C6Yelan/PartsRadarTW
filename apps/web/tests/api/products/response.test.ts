// apps/web/tests/api/products/response.test.ts
// 驗證商品列表 API 的 public response shape、價格變動、來源狀態 meta 與安全欄位邊界。

import { describe, expect, it } from "vitest";

import { createGetProductsHandler } from "../../../app/api/products/handler";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../../../app/api/source-status/handler";
import {
  fakeProductsClient,
  NOW,
  PRODUCT_ID,
  product,
  priceSnapshot,
  searchTokenWhere,
  sourceStatusCategory,
} from "./support/handler-client";

describe("GET /api/products response", () => {
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
      "https://parts.example/api/products?q=RTX&category=gpu&minPrice=4000&maxPrice=9000&status=all&sort=name_asc&page=2&pageSize=1",
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
    expect(client.lastProductFindProductsArgs?.select).toHaveProperty("ibuyToken", true);
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
            url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
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

  it("returns searchable products with nullable images when primary image data is missing", async () => {
    const client = fakeProductsClient({
      products: [
        product({
          primaryImageUrl: null,
          primaryImageCheckedAt: null,
        }),
      ],
      totalItems: 1,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request("https://parts.example/api/products?q=RTX"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.lastProductFindProductsArgs).toMatchObject({
      where: {
        sourceCategory: {
          enabled: true,
        },
        currentPrice: {
          is: {
            priceSnapshot: {
              price: {},
            },
          },
        },
        AND: [searchTokenWhere("RTX")],
      },
    });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: PRODUCT_ID,
      image: null,
      price: {
        amount: 6990,
      },
    });
  });
});
