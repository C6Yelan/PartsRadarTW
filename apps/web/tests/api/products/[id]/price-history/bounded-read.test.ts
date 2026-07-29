// apps/web/tests/api/products/[id]/price-history/bounded-read.test.ts
// 驗證價格歷史的 point/DB query hard bounds、sampling 語意與 fail-closed contract。

import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../../../app/api/_shared/responses";
import { createGetProductPriceHistoryHandler } from "../../../../../app/api/products/[id]/price-history/handler";
import {
  PRICE_HISTORY_MAX_RESPONSE_BYTES,
  PRICE_HISTORY_MAX_RESPONSE_POINTS,
  PRICE_HISTORY_RAW_PROBE_LIMIT,
  PRICE_HISTORY_SNAPSHOT_LIMIT,
} from "../../../../../app/api/products/[id]/price-history/limits";
import { fakePriceHistoryClient, NOW, PRODUCT_ID, productRecord, snapshot } from "./support";

describe("GET /api/products/{id}/price-history bounded read", () => {
  it.each([
    0,
    1,
    PRICE_HISTORY_SNAPSHOT_LIMIT,
  ])("keeps an exact stable response for %i eligible snapshots", async (snapshotCount) => {
    const snapshots = buildSnapshots(snapshotCount);
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        lastSeenAt: snapshots.at(-1)?.capturedAt.toISOString() ?? "2026-01-01T00:00:00.000Z",
      }),
      snapshots,
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      `https://partsradar.test/api/products/${PRODUCT_ID}/price-history`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sampling).toBeUndefined();
    expect(body.points).toHaveLength(snapshotCount);
    expect(client.queryRawTexts).toHaveLength(3);
    expect(client.queryRawTexts.at(-1)).toContain("LIMIT ?");
    expect(client.queryRawValues.at(-1)).toContain(PRICE_HISTORY_RAW_PROBE_LIMIT);
  });

  it("reserves one response slot for a current confirmation at the exact snapshot limit", async () => {
    const snapshots = buildSnapshots(PRICE_HISTORY_SNAPSHOT_LIMIT);
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: 8_888,
        lastSeenAt: "2026-06-01T11:59:00.000Z",
      }),
      snapshots,
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      `https://partsradar.test/api/products/${PRODUCT_ID}/price-history`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.points).toHaveLength(PRICE_HISTORY_MAX_RESPONSE_POINTS);
    expect(body.points.at(-1)).toMatchObject({
      amount: 8_888,
      observationType: "current_price_confirmation",
    });
  });

  it("downsamples limit plus one without losing the global first/latest observations", async () => {
    const snapshots = buildSnapshots(PRICE_HISTORY_SNAPSHOT_LIMIT + 1);
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        lastSeenAt: snapshots.at(-1)?.capturedAt.toISOString(),
      }),
      snapshots,
    });

    const handler = createGetProductPriceHistoryHandler(client, { now: NOW });
    const firstResponse = await handler(
      PRODUCT_ID,
      `https://partsradar.test/api/products/${PRODUCT_ID}/price-history?range=all`,
    );
    const secondResponse = await handler(
      PRODUCT_ID,
      `https://partsradar.test/api/products/${PRODUCT_ID}/price-history?range=all`,
    );
    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("X-Price-History-Downsampled")).toBe("true");
    expect(firstBody.sampling).toEqual({
      downsampled: true,
      strategy: "time_bucket_first_last",
      bucketCount: 126,
      pointLimit: PRICE_HISTORY_MAX_RESPONSE_POINTS,
    });
    expect(firstBody.points.length).toBeLessThanOrEqual(PRICE_HISTORY_SNAPSHOT_LIMIT);
    expect(firstBody.points[0]).toMatchObject({
      amount: snapshots[0]?.price,
      observedAt: snapshots[0]?.capturedAt.toISOString(),
    });
    expect(firstBody.points.at(-1)).toMatchObject({
      amount: snapshots.at(-1)?.price,
      observedAt: snapshots.at(-1)?.capturedAt.toISOString(),
    });
    expect(secondBody).toEqual(firstBody);
    expect(client.queryRawTexts.some((sql) => sql.includes("CROSS JOIN LATERAL"))).toBe(true);
    expect(client.queryRawTexts.some((sql) => sql.includes("pg_catalog.generate_series"))).toBe(
      true,
    );
  });

  it("is zero-span safe and uses id as the stable same-timestamp tie-break", async () => {
    const capturedAt = "2026-05-31T08:00:00.000Z";
    const snapshots = Array.from({ length: PRICE_HISTORY_RAW_PROBE_LIMIT }, (_, index) =>
      snapshot(
        5_000 + index,
        capturedAt,
        `11111111-1111-4111-8111-${index.toString().padStart(12, "0")}`,
      ),
    );
    const client = fakePriceHistoryClient({
      productResult: productRecord({ lastSeenAt: capturedAt }),
      snapshots: snapshots.toReversed(),
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      `https://partsradar.test/api/products/${PRODUCT_ID}/price-history?range=all`,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sampling?.downsampled).toBe(true);
    expect(body.points).toEqual([
      expect.objectContaining({ amount: 5_000 }),
      expect.objectContaining({ amount: 5_000 + PRICE_HISTORY_RAW_PROBE_LIMIT - 1 }),
    ]);
  });

  it("returns a generic 503 when the required index guard fails", async () => {
    const client = fakePriceHistoryClient({
      productResult: productRecord(),
      snapshots: [],
      indexState: {
        isValid: false,
      },
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      `https://partsradar.test/api/products/${PRODUCT_ID}/price-history`,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "temporarily_unavailable",
        message: API_ERROR_MESSAGES.temporarilyUnavailable,
      },
    });
  });

  it("maps a PostgreSQL statement timeout to generic 503 but keeps unknown DB failures at 500", async () => {
    const timeoutClient = fakePriceHistoryClient({
      productResult: productRecord(),
      snapshots: [],
      transactionError: Object.assign(new Error("query cancelled"), {
        code: "P2010",
        meta: { code: "57014" },
      }),
    });
    const unknownFailureClient = fakePriceHistoryClient({
      productResult: productRecord(),
      snapshots: [],
      transactionError: new Error("unexpected adapter bug"),
    });
    const handlerUrl = `https://partsradar.test/api/products/${PRODUCT_ID}/price-history`;

    const timeoutResponse = await createGetProductPriceHistoryHandler(timeoutClient, { now: NOW })(
      PRODUCT_ID,
      handlerUrl,
    );
    const unknownResponse = await createGetProductPriceHistoryHandler(unknownFailureClient, {
      now: NOW,
    })(PRODUCT_ID, handlerUrl);

    expect(timeoutResponse.status).toBe(503);
    expect(unknownResponse.status).toBe(500);
  });

  it("keeps the maximum serialized success body below the byte hard cap", async () => {
    const snapshots = buildSnapshots(PRICE_HISTORY_SNAPSHOT_LIMIT);
    const client = fakePriceHistoryClient({
      productResult: productRecord({
        price: Number.MAX_SAFE_INTEGER,
        lastSeenAt: "2026-06-01T11:59:00.000Z",
      }),
      snapshots,
    });

    const response = await createGetProductPriceHistoryHandler(client, { now: NOW })(
      PRODUCT_ID,
      `https://partsradar.test/api/products/${PRODUCT_ID}/price-history`,
    );
    const serialized = await response.text();

    expect(response.status).toBe(200);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      PRICE_HISTORY_MAX_RESPONSE_BYTES,
    );
  });
});

function buildSnapshots(count: number) {
  const start = new Date("2026-05-02T12:00:00.000Z").getTime();

  return Array.from({ length: count }, (_, index) =>
    snapshot(
      5_000 + (index % 31) * 10,
      new Date(start + index * 60_000).toISOString(),
      `22222222-2222-4222-8222-${index.toString().padStart(12, "0")}`,
    ),
  );
}
