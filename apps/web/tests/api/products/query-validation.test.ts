// apps/web/tests/api/products/query-validation.test.ts
// 驗證商品列表 API 的搜尋、品牌篩選、價格區間與 invalid query 安全中止行為。

import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../app/api/_shared/responses";
import { createGetProductsHandler } from "../../../app/api/products/handler";
import {
  fakeProductsClient,
  NOW,
  searchTokenWhere,
  vendorOption,
} from "./support/handler-client";

describe("GET /api/products query validation", () => {
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
