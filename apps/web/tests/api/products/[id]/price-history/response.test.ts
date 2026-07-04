// apps/web/tests/api/products/[id]/price-history/response.test.ts
import { describe, expect, it } from "vitest";

import { createGetProductPriceHistoryHandler } from "../../../../../app/api/products/[id]/price-history/handler";
import {
  fakePriceHistoryClient,
  NOW,
  PRODUCT_ID,
  productRecord,
  snapshot,
} from "./support";

describe("GET /api/products/{id}/price-history response", () => {
  it("returns price history points and summary for a product with a current price", async () => {
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
});
