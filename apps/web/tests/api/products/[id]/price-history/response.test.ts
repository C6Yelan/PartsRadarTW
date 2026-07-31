// apps/web/tests/api/products/[id]/price-history/response.test.ts
// 驗證商品價格歷史 API 的精簡觀測點、目前價格確認點與 range 查詢條件。

import { describe, expect, it } from "vitest";

import { createGetProductPriceHistoryHandler } from "../../../../../app/api/products/[id]/price-history/handler";
import { fakePriceHistoryClient, NOW, PRODUCT_ID, productRecord, snapshot } from "./support";

describe("GET /api/products/{id}/price-history response", () => {
  it("returns price history points for a product with a current price", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: 5600,
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
    expect(client.transactionCallCount).toBe(1);
    expect(client.queryRawTexts).toHaveLength(3);
    expect(client.queryRawTexts[2]).toContain('ORDER BY snapshot."captured_at" ASC');
    expect(client.queryRawValues[2]).toContain(PRODUCT_ID);
    expect(client.queryRawValues[2]).toContainEqual(new Date("2026-05-02T12:00:00.000Z"));
    expect(client.lastProductFindFirstArgs?.select).toEqual({
      currentPrice: {
        select: {
          lastSeenAt: true,
          priceSnapshot: {
            select: {
              price: true,
            },
          },
        },
      },
    });
    expect(body).toEqual({
      range: "30d",
      rangeDays: 30,
      points: [
        {
          amount: 5900,
          observedAt: "2026-05-20T08:00:00.000Z",
          observationType: "price_snapshot",
        },
        {
          amount: 6200,
          observedAt: "2026-05-25T08:00:00.000Z",
          observationType: "price_snapshot",
        },
        {
          amount: 5600,
          observedAt: "2026-05-31T08:00:00.000Z",
          observationType: "price_snapshot",
        },
      ],
    });
  });

  it("adds a current price confirmation point when unchanged price was seen again", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: 5900,
        lastSeenAt: "2026-06-01T05:30:00.000Z",
      }),
      snapshots: [snapshot(5900, "2026-05-20T08:00:00.000Z")],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history?days=90",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Price-History-Range")).toBe("90d");
    expect(response.headers.get("X-Price-History-Returned-Points")).toBe("2");
    expect(response.headers.get("X-Price-History-Downsampled")).toBe("false");
    expect(response.headers.get("X-Price-History-Duration-Ms")).toMatch(/^\d+$/);
    const body = await response.json();
    expect(body).toEqual({
      range: "90d",
      rangeDays: 90,
      points: [
        {
          amount: 5900,
          observedAt: "2026-05-20T08:00:00.000Z",
          observationType: "price_snapshot",
        },
        {
          amount: 5900,
          observedAt: "2026-06-01T05:30:00.000Z",
          observationType: "current_price_confirmation",
        },
      ],
    });
  });

  it("defaults to the 90 day range", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        lastSeenAt: "2026-01-02T08:00:00.000Z",
      }),
      snapshots: [],
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      "https://partsradar.test/api/products/11111111-1111-1111-1111-111111111111/price-history",
    );

    expect(response.status).toBe(200);
    expect(client.queryRawValues.at(-1)).toContainEqual(new Date("2026-03-03T12:00:00.000Z"));
    expect(await response.json()).toEqual({
      range: "90d",
      rangeDays: 90,
      points: [],
    });
  });

  it("returns all retained price history when range is all", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: 5400,
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
    expect(client.queryRawTexts.at(-1)).not.toContain('snapshot."captured_at" >=');
    expect(body).toEqual({
      range: "all",
      rangeDays: null,
      points: [
        {
          amount: 6200,
          observedAt: "2026-01-10T08:00:00.000Z",
          observationType: "price_snapshot",
        },
        {
          amount: 5800,
          observedAt: "2026-03-20T08:00:00.000Z",
          observationType: "price_snapshot",
        },
        {
          amount: 5400,
          observedAt: "2026-05-31T08:00:00.000Z",
          observationType: "price_snapshot",
        },
        {
          amount: 5400,
          observedAt: "2026-06-01T05:30:00.000Z",
          observationType: "current_price_confirmation",
        },
      ],
    });
  });
});
