// apps/web/tests/api/products/query-validation.test.ts
// 驗證商品列表 API 的搜尋、品牌篩選、價格區間與 invalid query 安全中止行為。

import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../app/api/_shared/responses";
import { createGetProductsHandler } from "../../../app/api/products/handler";
import { fakeProductsClient, NOW, searchTokenWhere, vendorOption } from "./support/handler-client";

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
      new Request(
        "https://parts.example/api/products?category=gpu&q=rtx&minPrice=10000&maxPrice=20000&status=inactive&vendors=asus,msi&facet=gpu_chip:nvidia&facet=vram_gb:12",
      ),
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
        OR: [
          {
            sourceCategory: {
              enabled: true,
              igrp: 12,
            },
            currentPrice: {
              is: {
                priceSnapshot: {
                  price: {
                    gte: 10000,
                    lte: 20000,
                  },
                },
              },
            },
            isActive: false,
            AND: [
              searchTokenWhere("rtx"),
              {
                filterTags: {
                  hasSome: ["gpu_chip:nvidia"],
                },
              },
              {
                filterTags: {
                  hasSome: ["vram_gb:12"],
                },
              },
            ],
          },
          {
            vendorSlug: {
              in: ["asus", "msi"],
            },
          },
        ],
      },
      distinct: ["vendorSlug"],
    });
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
                gte: 10000,
                lte: 20000,
              },
            },
          },
        },
        isActive: false,
        AND: [
          searchTokenWhere("rtx"),
          {
            filterTags: {
              hasSome: ["gpu_chip:nvidia"],
            },
          },
          {
            filterTags: {
              hasSome: ["vram_gb:12"],
            },
          },
          {
            vendorSlug: {
              in: ["asus", "msi"],
            },
          },
        ],
      },
    });
    expect(client.lastProductCountArgs?.where).toEqual(client.lastProductFindProductsArgs?.where);
  });

  it("keeps a valid selected vendor removable when other filters have no results", async () => {
    const client = fakeProductsClient({
      products: [],
      vendorOptions: [vendorOption({ vendorSlug: "asus", vendorName: "華碩" })],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request(
        "https://parts.example/api/products?category=gpu&vendors=asus&facet=gpu_chip:amd",
      ),
    );

    expect(response.status).toBe(200);
    expect(client.lastProductVendorOptionsArgs?.where).toMatchObject({
      OR: [
        {
          AND: [
            {
              filterTags: {
                hasSome: ["gpu_chip:amd"],
              },
            },
          ],
        },
        {
          vendorSlug: {
            in: ["asus"],
          },
        },
      ],
    });
    expect(client.lastProductFindProductsArgs?.where).toMatchObject({
      AND: [
        {
          filterTags: {
            hasSome: ["gpu_chip:amd"],
          },
        },
        {
          vendorSlug: {
            in: ["asus"],
          },
        },
      ],
    });
  });

  it("rejects a selected vendor that is unavailable in the selected category", async () => {
    const client = fakeProductsClient({
      products: [],
      vendorOptions: [vendorOption({ vendorSlug: "msi", vendorName: "微星" })],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request("https://parts.example/api/products?category=gpu&vendors=asus"),
    );

    expect(response.status).toBe(400);
    expect(client.productFindVendorOptionsCallCount).toBe(1);
    expect(client.productFindProductsCallCount).toBe(0);
    expect(client.productCountCallCount).toBe(0);
  });

  it("groups same-key facets as OR and different facet keys as AND", async () => {
    const client = fakeProductsClient({
      products: [],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client, { now: () => NOW })(
      new Request(
        "https://parts.example/api/products?category=cpu&facet=socket:am5&facet=socket:am4&facet=cpu_family:ryzen-5",
      ),
    );

    expect(response.status).toBe(200);
    expect(client.lastProductFindProductsArgs).toMatchObject({
      where: {
        sourceCategory: {
          enabled: true,
          igrp: 4,
        },
        AND: [
          {
            filterTags: {
              hasSome: ["socket:am5", "socket:am4"],
            },
          },
          {
            filterTags: {
              hasSome: ["cpu_family:ryzen-5"],
            },
          },
        ],
      },
    });
    expect(client.lastProductCountArgs?.where).toEqual(client.lastProductFindProductsArgs?.where);
  });

  it.each([
    "facet=socket:am5",
    "category=cpu&facet=chipset:b850",
    "category=cpu&facet=socket",
    "category=cpu&facet=socket:am5&facet=socket:am5",
    `category=cpu&${Array.from({ length: 51 }, () => "facet=socket:am5").join("&")}`,
    `category=cpu&facet=${"x".repeat(101)}`,
    "category=cpu&facet=%20",
  ])("rejects invalid or category-incompatible facets before reading data: %s", async (query) => {
    const client = fakeProductsClient({
      products: [],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client)(
      new Request(`https://parts.example/api/products?${query}`),
    );

    expect(response.status).toBe(400);
    expect(client.productFindProductsCallCount).toBe(0);
    expect(client.productFindVendorOptionsCallCount).toBe(0);
    expect(client.productCountCallCount).toBe(0);
    expect(client.sourceCategoryFindManyCallCount).toBe(0);
  });

  it.each([
    "category=unknown",
    "igrp=12",
    "igrp=99",
    "category=cpu&igrp=12",
    "igrp=12&facet=gpu_chip:nvidia",
  ])("rejects an unknown or conflicting category before reading data: %s", async (categoryQuery) => {
    const client = fakeProductsClient({
      products: [],
      totalItems: 0,
      sourceCategories: [],
    });

    const response = await createGetProductsHandler(client)(
      new Request(`https://parts.example/api/products?${categoryQuery}`),
    );

    expect(response.status).toBe(400);
    expect(client.productFindProductsCallCount).toBe(0);
    expect(client.productFindVendorOptionsCallCount).toBe(0);
    expect(client.productCountCallCount).toBe(0);
    expect(client.priceSnapshotFindManyCallCount).toBe(0);
    expect(client.sourceCategoryFindManyCallCount).toBe(0);
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
