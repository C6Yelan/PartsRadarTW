// apps/web/tests/api/products/[id]/handler.test.ts
// 驗證商品詳細 API handler 的公開 response shape、購買連結重建、availability 與安全錯誤回應。

import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../../app/api/_shared/responses";
import {
  createGetProductHandler,
  type ProductDetailReadClient,
} from "../../../../app/api/products/[id]/handler";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/products/{id} handler", () => {
  it("returns product details with public-safe fields", async () => {
    const client = fakeProductDetailClient(product());

    const response = await createGetProductHandler(client)(PRODUCT_ID.toUpperCase());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.lastProductFindFirstArgs).toMatchObject({
      where: {
        id: PRODUCT_ID,
        sourceCategory: {
          enabled: true,
        },
        currentPrice: {
          isNot: null,
        },
      },
    });
    expect(client.lastProductFindFirstArgs?.select).toHaveProperty("ibuyToken", true);
    expect(client.lastProductFindFirstArgs?.select).not.toHaveProperty("sourceUrl");
    expect(body).toEqual({
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
        priceChangedAt: "2026-05-28T11:45:00.000Z",
      },
      source: {
        name: "coolpc",
        url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
      },
      status: {
        isActive: true,
        missingSince: null,
      },
      firstSeenAt: "2026-05-28T10:00:00.000Z",
      lastSeenAt: "2026-05-28T11:55:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("iBuyToken");
    expect(JSON.stringify(body)).not.toContain("source_item_key");
    expect(JSON.stringify(body)).not.toContain("PHPSESSID");
    expect(body).not.toHaveProperty("introduction");
    expect(body.source).not.toHaveProperty("health");
  });

  it("returns product details with a nullable image when primary image data is missing", async () => {
    const response = await createGetProductHandler(
      fakeProductDetailClient(
        product({
          primaryImageUrl: null,
          primaryImageCheckedAt: null,
        }),
      ),
    )(PRODUCT_ID);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: PRODUCT_ID,
      image: null,
      price: {
        amount: 6990,
      },
    });
  });

  it("returns inactive product details when the product still has a current price", async () => {
    const response = await createGetProductHandler(
      fakeProductDetailClient(
        product({
          isActive: false,
          missingSince: new Date("2026-05-28T12:00:00.000Z"),
        }),
      ),
    )(PRODUCT_ID);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: {
        isActive: false,
        missingSince: "2026-05-28T12:00:00.000Z",
      },
    });
  });

  it("returns 404 when the product id is malformed without reading data", async () => {
    const client = fakeProductDetailClient(product());

    const response = await createGetProductHandler(client)("not-a-product-id");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: API_ERROR_MESSAGES.notFound,
      },
    });
    expect(client.productFindFirstCallCount).toBe(0);
  });

  it("returns 404 when the product does not exist", async () => {
    const response = await createGetProductHandler(fakeProductDetailClient(null))(PRODUCT_ID);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: API_ERROR_MESSAGES.notFound,
      },
    });
  });

  it("returns a generic 500 response when product lookup fails", async () => {
    const response = await createGetProductHandler({
      product: {
        findFirst: async () => {
          throw new Error("Prisma stack with DATABASE_URL and iBuyToken");
        },
      },
    })(PRODUCT_ID);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });
});

type ProductFindFirstArgs = Parameters<ProductDetailReadClient["product"]["findFirst"]>[0];
type ProductRecord = Awaited<ReturnType<ProductDetailReadClient["product"]["findFirst"]>>;

function fakeProductDetailClient(productResult: ProductRecord) {
  const state = {
    lastProductFindFirstArgs: undefined as ProductFindFirstArgs | undefined,
    productFindFirstCallCount: 0,
  };

  return {
    get lastProductFindFirstArgs() {
      return state.lastProductFindFirstArgs;
    },
    get productFindFirstCallCount() {
      return state.productFindFirstCallCount;
    },
    product: {
      async findFirst(args) {
        state.productFindFirstCallCount += 1;
        state.lastProductFindFirstArgs = args;

        return productResult;
      },
    },
  } satisfies ProductDetailReadClient & {
    lastProductFindFirstArgs?: ProductFindFirstArgs;
    productFindFirstCallCount: number;
  };
}

function product(overrides: Partial<NonNullable<ProductRecord>> = {}): NonNullable<ProductRecord> {
  return {
    id: PRODUCT_ID,
    ibuyToken: "GPU-RTX-4070",
    name: "GPU RTX 4070",
    primaryImageUrl: "https://www.coolpc.com.tw/eval/12/gpu-rtx-4070.jpg",
    primaryImageCheckedAt: new Date("2026-05-28T11:55:00.000Z"),
    isActive: true,
    missingSince: null,
    firstSeenAt: new Date("2026-05-28T10:00:00.000Z"),
    lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
    currentPrice: {
      lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
      priceChangedAt: new Date("2026-05-28T11:45:00.000Z"),
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
