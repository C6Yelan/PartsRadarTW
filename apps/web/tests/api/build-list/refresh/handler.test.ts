// apps/web/tests/api/build-list/refresh/handler.test.ts
// 驗證配單 refresh handler 的單次 query、request-order response、missing 與安全錯誤。

import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../../app/api/_shared/responses";
import {
  type BuildListRefreshReadClient,
  createPostBuildListRefreshHandler,
} from "../../../../app/api/build-list/refresh/handler";

const PRODUCT_ID_1 = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID_2 = "22222222-2222-2222-2222-222222222222";

describe("POST /api/build-list/refresh handler", () => {
  it("uses one query and returns found products in request order with partial missing IDs", async () => {
    const client = fakeBuildListRefreshClient([
      product({
        id: PRODUCT_ID_2,
        isActive: false,
        primaryImageUrl: null,
        currentPrice: null,
      }),
    ]);

    const response = await createPostBuildListRefreshHandler(client)(
      request([PRODUCT_ID_1, PRODUCT_ID_2]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.productFindManyCallCount).toBe(1);
    expect(client.lastProductFindManyArgs).toMatchObject({
      where: {
        id: {
          in: [PRODUCT_ID_1, PRODUCT_ID_2],
        },
        sourceCategory: {
          enabled: true,
        },
      },
    });
    expect(client.lastProductFindManyArgs?.where).not.toHaveProperty("isActive");
    expect(client.lastProductFindManyArgs?.where).not.toHaveProperty("currentPrice");
    expect(client.lastProductFindManyArgs?.select).toHaveProperty("ibuyToken", true);
    expect(client.lastProductFindManyArgs?.select).not.toHaveProperty("sourceUrl");
    expect(body).toEqual({
      data: [
        {
          id: PRODUCT_ID_2,
          name: "GPU RTX 4070",
          image: null,
          category: {
            displayName: "顯示卡",
          },
          price: null,
          source: {
            url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
          },
          status: {
            isActive: false,
          },
          lastSeenAt: "2026-05-28T11:55:00.000Z",
        },
      ],
      missingProductIds: [PRODUCT_ID_1],
    });
    expect(JSON.stringify(body)).not.toContain("ibuyToken");
    expect(JSON.stringify(body)).not.toContain("coolpc.com.tw/eval/12/");
  });

  it("reorders a complete DB result and keeps inactive priced products", async () => {
    const client = fakeBuildListRefreshClient([
      product({ id: PRODUCT_ID_2, isActive: false }),
      product({ id: PRODUCT_ID_1 }),
    ]);

    const response = await createPostBuildListRefreshHandler(client)(
      request([PRODUCT_ID_1, PRODUCT_ID_2]),
    );
    const body = await response.json();

    expect(body.data.map((item: { id: string }) => item.id)).toEqual([PRODUCT_ID_1, PRODUCT_ID_2]);
    expect(body.data[1]).toMatchObject({
      price: {
        amount: 6990,
        currency: "TWD",
      },
      status: {
        isActive: false,
      },
    });
    expect(body.missingProductIds).toEqual([]);
  });

  it("returns all IDs as missing when the query finds no public products", async () => {
    const response = await createPostBuildListRefreshHandler(fakeBuildListRefreshClient([]))(
      request([PRODUCT_ID_1, PRODUCT_ID_2]),
    );

    expect(await response.json()).toEqual({
      data: [],
      missingProductIds: [PRODUCT_ID_1, PRODUCT_ID_2],
    });
  });

  it("returns an empty result without querying the database", async () => {
    const client = fakeBuildListRefreshClient([product()]);
    const response = await createPostBuildListRefreshHandler(client)(request([]));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [], missingProductIds: [] });
    expect(client.productFindManyCallCount).toBe(0);
  });

  it("rejects invalid input before querying the database", async () => {
    const client = fakeBuildListRefreshClient([product()]);
    const response = await createPostBuildListRefreshHandler(client)(request(["not-a-uuid"]));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_request",
        message: API_ERROR_MESSAGES.invalidRequest,
      },
    });
    expect(client.productFindManyCallCount).toBe(0);
  });

  it("returns a generic 500 when the database query fails", async () => {
    const response = await createPostBuildListRefreshHandler({
      product: {
        async findMany() {
          throw new Error("Prisma stack with DATABASE_URL and iBuyToken");
        },
      },
    })(request([PRODUCT_ID_1]));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });
});

type ProductFindManyArgs = Parameters<BuildListRefreshReadClient["product"]["findMany"]>[0];
type ProductRecord = Awaited<ReturnType<BuildListRefreshReadClient["product"]["findMany"]>>[number];

function fakeBuildListRefreshClient(productResults: ProductRecord[]) {
  const state = {
    lastProductFindManyArgs: undefined as ProductFindManyArgs | undefined,
    productFindManyCallCount: 0,
  };

  return {
    get lastProductFindManyArgs() {
      return state.lastProductFindManyArgs;
    },
    get productFindManyCallCount() {
      return state.productFindManyCallCount;
    },
    product: {
      async findMany(args) {
        state.productFindManyCallCount += 1;
        state.lastProductFindManyArgs = args;
        return productResults;
      },
    },
  } satisfies BuildListRefreshReadClient & {
    lastProductFindManyArgs?: ProductFindManyArgs;
    productFindManyCallCount: number;
  };
}

function request(productIds: string[]): Request {
  return new Request("https://partsradar.test/api/build-list/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(productIds),
  });
}

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: PRODUCT_ID_1,
    ibuyToken: "GPU-RTX-4070",
    name: "GPU RTX 4070",
    primaryImageUrl: "https://www.coolpc.com.tw/eval/12/gpu-rtx-4070.jpg",
    isActive: true,
    lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
    currentPrice: {
      priceSnapshot: {
        price: 6990,
        currency: "TWD",
      },
    },
    sourceCategory: {
      displayName: "顯示卡",
    },
    ...overrides,
  };
}
