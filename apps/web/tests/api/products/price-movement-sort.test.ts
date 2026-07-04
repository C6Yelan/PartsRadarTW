// apps/web/tests/api/products/price-movement-sort.test.ts
import { describe, expect, it } from "vitest";

import { createGetProductsHandler } from "../../../app/api/products/handler";
import { fakeProductsClient, NOW, product, priceSnapshot } from "./support/handler-client";

describe("GET /api/products price movement sorting", () => {
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
        in: [flatProduct.id, noHistoryProduct.id, smallerDropProduct.id, largestDropProduct.id],
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
