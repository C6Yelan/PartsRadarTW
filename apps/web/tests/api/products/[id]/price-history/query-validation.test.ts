// apps/web/tests/api/products/[id]/price-history/query-validation.test.ts
// 驗證商品價格歷史 API 的 query / product id 驗證失敗時，會安全回應且避免不必要 DB 讀取。

import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../../../app/api/_shared/responses";
import { createGetProductPriceHistoryHandler } from "../../../../../app/api/products/[id]/price-history/handler";
import { fakePriceHistoryClient, NOW, PRODUCT_ID, productRecord } from "./support";

describe("GET /api/products/{id}/price-history query validation", () => {
  it("returns 400 for unsupported range days", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord(),
      snapshots: [],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history?days=14",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_query",
        message: API_ERROR_MESSAGES.invalidQuery,
      },
    });
    expect(client.productFindFirstCallCount).toBe(0);
    expect(client.transactionCallCount).toBe(0);
  });

  it("returns 400 for unsupported range values", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord(),
      snapshots: [],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history?range=365d",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_query",
        message: API_ERROR_MESSAGES.invalidQuery,
      },
    });
    expect(client.productFindFirstCallCount).toBe(0);
    expect(client.transactionCallCount).toBe(0);
  });

  it("returns 404 when the product id is malformed without reading data", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord(),
      snapshots: [],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      "not-a-product-id",
      "https://partsradar.test/api/products/not-a-product-id/price-history",
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: API_ERROR_MESSAGES.notFound,
      },
    });
    expect(client.productFindFirstCallCount).toBe(0);
    expect(client.transactionCallCount).toBe(0);
  });

  it("returns 404 when the product does not exist", async () => {
    const client = fakePriceHistoryClient({
      productResult: null,
      snapshots: [],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history",
    );

    expect(response.status).toBe(404);
    expect(client.transactionCallCount).toBe(0);
  });

  it("returns a generic 500 response when lookup fails", async () => {
    const response = await createGetProductPriceHistoryHandler(
      {
        product: {
          findFirst: async () => {
            throw new Error("Prisma stack with DATABASE_URL and iBuyToken");
          },
        },
        $transaction: async (callback) =>
          callback({
            $queryRaw: async <T>() => [] as T,
          }),
      },
      { now: NOW },
    )(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history",
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });
});
