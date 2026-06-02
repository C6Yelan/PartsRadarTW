import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../../../app/api/_shared/responses";
import {
  createGetProductPriceHistoryHandler,
  type ProductPriceHistoryReadClient,
} from "../../../../../app/api/products/[id]/price-history/handler";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-06-01T12:00:00.000Z");

describe("GET /api/products/{id}/price-history handler", () => {
  it("returns price history points and summary for a display-ready product", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: 5600,
        capturedAt: "2026-05-31T08:00:00.000Z",
        lastSeenAt: "2026-05-31T08:00:00.000Z",
      }),
      snapshots: [
        snapshot(5900, "2026-05-20T08:00:00.000Z"),
        snapshot(6200, "2026-05-25T08:00:00.000Z"),
        snapshot(5600, "2026-05-31T08:00:00.000Z"),
      ],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID.toUpperCase(),
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history?days=30",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.lastProductFindFirstArgs).toMatchObject({
      where: {
        id: PRODUCT_ID,
        sourceCategory: {
          enabled: true,
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
      },
    });
    expect(client.lastPriceSnapshotFindManyArgs).toMatchObject({
      where: {
        productId: PRODUCT_ID,
        capturedAt: {
          gte: new Date("2026-05-02T12:00:00.000Z"),
        },
      },
      orderBy: {
        capturedAt: "asc",
      },
    });
    expect(body).toEqual({
      productId: PRODUCT_ID,
      range: "30d",
      rangeDays: 30,
      points: [
        {
          amount: 5900,
          currency: "TWD",
          observedAt: "2026-05-20T08:00:00.000Z",
          source: "price_snapshot",
        },
        {
          amount: 6200,
          currency: "TWD",
          observedAt: "2026-05-25T08:00:00.000Z",
          source: "price_snapshot",
        },
        {
          amount: 5600,
          currency: "TWD",
          observedAt: "2026-05-31T08:00:00.000Z",
          source: "price_snapshot",
        },
      ],
      summary: {
        pointCount: 3,
        startedAt: "2026-05-20T08:00:00.000Z",
        endedAt: "2026-05-31T08:00:00.000Z",
        lowest: {
          amount: 5600,
          observedAt: "2026-05-31T08:00:00.000Z",
        },
        highest: {
          amount: 6200,
          observedAt: "2026-05-25T08:00:00.000Z",
        },
        first: {
          amount: 5900,
          observedAt: "2026-05-20T08:00:00.000Z",
        },
        latest: {
          amount: 5600,
          observedAt: "2026-05-31T08:00:00.000Z",
        },
        deltaAmount: -300,
        deltaPercent: -5.08,
      },
    });
  });

  it("adds a current price confirmation point when unchanged price was seen again", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: 5900,
        capturedAt: "2026-05-20T08:00:00.000Z",
        lastSeenAt: "2026-06-01T05:30:00.000Z",
      }),
      snapshots: [snapshot(5900, "2026-05-20T08:00:00.000Z")],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history?days=90",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      productId: PRODUCT_ID,
      range: "90d",
      rangeDays: 90,
      points: [
        {
          amount: 5900,
          currency: "TWD",
          observedAt: "2026-05-20T08:00:00.000Z",
          source: "price_snapshot",
        },
        {
          amount: 5900,
          currency: "TWD",
          observedAt: "2026-06-01T05:30:00.000Z",
          source: "current_price_confirmation",
        },
      ],
      summary: {
        pointCount: 2,
        startedAt: "2026-05-20T08:00:00.000Z",
        endedAt: "2026-06-01T05:30:00.000Z",
        lowest: {
          amount: 5900,
          observedAt: "2026-05-20T08:00:00.000Z",
        },
        highest: {
          amount: 5900,
          observedAt: "2026-05-20T08:00:00.000Z",
        },
        first: {
          amount: 5900,
          observedAt: "2026-05-20T08:00:00.000Z",
        },
        latest: {
          amount: 5900,
          observedAt: "2026-06-01T05:30:00.000Z",
        },
        deltaAmount: 0,
        deltaPercent: 0,
      },
    });
  });

  it("defaults to the 90 day range", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        capturedAt: "2026-01-01T08:00:00.000Z",
        lastSeenAt: "2026-01-02T08:00:00.000Z",
      }),
      snapshots: [],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history",
    );

    expect(response.status).toBe(200);
    expect(client.lastPriceSnapshotFindManyArgs).toMatchObject({
      where: {
        capturedAt: {
          gte: new Date("2026-03-03T12:00:00.000Z"),
        },
      },
    });
    expect(await response.json()).toMatchObject({
      range: "90d",
      rangeDays: 90,
      points: [],
      summary: {
        pointCount: 0,
        startedAt: null,
        endedAt: null,
        lowest: null,
        highest: null,
        first: null,
        latest: null,
        deltaAmount: null,
        deltaPercent: null,
      },
    });
  });

  it("returns all retained price history when range is all", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: 5400,
        capturedAt: "2026-05-31T08:00:00.000Z",
        lastSeenAt: "2026-06-01T05:30:00.000Z",
      }),
      snapshots: [
        snapshot(6200, "2026-01-10T08:00:00.000Z"),
        snapshot(5800, "2026-03-20T08:00:00.000Z"),
        snapshot(5400, "2026-05-31T08:00:00.000Z"),
      ],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history?range=all",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(client.lastPriceSnapshotFindManyArgs).toMatchObject({
      where: {
        productId: PRODUCT_ID,
      },
      orderBy: {
        capturedAt: "asc",
      },
    });
    expect(client.lastPriceSnapshotFindManyArgs?.where).not.toHaveProperty("capturedAt");
    expect(body).toMatchObject({
      productId: PRODUCT_ID,
      range: "all",
      rangeDays: null,
      points: [
        {
          amount: 6200,
          observedAt: "2026-01-10T08:00:00.000Z",
        },
        {
          amount: 5800,
          observedAt: "2026-03-20T08:00:00.000Z",
        },
        {
          amount: 5400,
          observedAt: "2026-05-31T08:00:00.000Z",
        },
        {
          amount: 5400,
          observedAt: "2026-06-01T05:30:00.000Z",
          source: "current_price_confirmation",
        },
      ],
      summary: {
        pointCount: 4,
        startedAt: "2026-01-10T08:00:00.000Z",
        endedAt: "2026-06-01T05:30:00.000Z",
        deltaAmount: -800,
        deltaPercent: -12.9,
      },
    });
  });

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
    expect(client.priceSnapshotFindManyCallCount).toBe(0);
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
    expect(client.priceSnapshotFindManyCallCount).toBe(0);
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
    expect(client.priceSnapshotFindManyCallCount).toBe(0);
  });

  it("returns 404 when the product is not display-ready", async () => {
    const client = fakePriceHistoryClient({
      productResult: null,
      snapshots: [],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history",
    );

    expect(response.status).toBe(404);
    expect(client.priceSnapshotFindManyCallCount).toBe(0);
  });

  it("returns a generic 500 response when lookup fails", async () => {
    const response = await createGetProductPriceHistoryHandler(
      {
        product: {
          findFirst: async () => {
            throw new Error("Prisma stack with DATABASE_URL and iBuyToken");
          },
        },
        priceSnapshot: {
          findMany: async () => [],
        },
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

type ProductFindFirstArgs = Parameters<ProductPriceHistoryReadClient["product"]["findFirst"]>[0];
type PriceSnapshotFindManyArgs = Parameters<
  ProductPriceHistoryReadClient["priceSnapshot"]["findMany"]
>[0];
type ProductRecord = Awaited<ReturnType<ProductPriceHistoryReadClient["product"]["findFirst"]>>;
type SnapshotRecord = Awaited<
  ReturnType<ProductPriceHistoryReadClient["priceSnapshot"]["findMany"]>
>[number];

function fakePriceHistoryClient({
  productResult,
  snapshots,
}: {
  productResult: ProductRecord;
  snapshots: SnapshotRecord[];
}) {
  const state = {
    lastProductFindFirstArgs: undefined as ProductFindFirstArgs | undefined,
    lastPriceSnapshotFindManyArgs: undefined as PriceSnapshotFindManyArgs | undefined,
    productFindFirstCallCount: 0,
    priceSnapshotFindManyCallCount: 0,
  };

  return {
    get lastProductFindFirstArgs() {
      return state.lastProductFindFirstArgs;
    },
    get lastPriceSnapshotFindManyArgs() {
      return state.lastPriceSnapshotFindManyArgs;
    },
    get productFindFirstCallCount() {
      return state.productFindFirstCallCount;
    },
    get priceSnapshotFindManyCallCount() {
      return state.priceSnapshotFindManyCallCount;
    },
    product: {
      async findFirst(args) {
        state.productFindFirstCallCount += 1;
        state.lastProductFindFirstArgs = args;

        return productResult;
      },
    },
    priceSnapshot: {
      async findMany(args) {
        state.priceSnapshotFindManyCallCount += 1;
        state.lastPriceSnapshotFindManyArgs = args;

        return snapshots;
      },
    },
  } satisfies ProductPriceHistoryReadClient & {
    lastProductFindFirstArgs?: ProductFindFirstArgs;
    lastPriceSnapshotFindManyArgs?: PriceSnapshotFindManyArgs;
    productFindFirstCallCount: number;
    priceSnapshotFindManyCallCount: number;
  };
}

function snapshot(price: number, capturedAt: string): SnapshotRecord {
  return {
    price,
    currency: "TWD",
    capturedAt: new Date(capturedAt),
  };
}

function productRecord({
  price = 5900,
  capturedAt = "2026-05-20T08:00:00.000Z",
  lastSeenAt = capturedAt,
}: {
  price?: number;
  capturedAt?: string;
  lastSeenAt?: string;
} = {}): NonNullable<ProductRecord> {
  return {
    id: PRODUCT_ID,
    currentPrice: {
      lastSeenAt: new Date(lastSeenAt),
      priceSnapshot: snapshot(price, capturedAt),
    },
  };
}
