// apps/web/tests/api/price-report/handler.test.ts
// 驗證價格報告 handler 的安全錯誤、來源狀態與驗證前零資料庫讀取。

import {
  PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
  PriceReportWorkBudgetExceededError,
} from "@partsradar/db/price-report";
import { describe, expect, it, vi } from "vitest";

import { API_ERROR_MESSAGES } from "../../../app/api/_shared/responses";
import {
  createGetPriceReportHandler,
  type PriceReportApiReadClient,
} from "../../../app/api/price-report/handler";

const NOW = new Date("2026-07-10T08:00:00.000Z");

describe("GET /api/price-report handler", () => {
  it("returns an empty read-only report with freshness metadata", async () => {
    const fake = createFakeClient();
    const response = await createGetPriceReportHandler(fake.client, { now: () => NOW })(
      new Request("https://parts.example/api/price-report"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      summary: {
        dropCount: 0,
        riseCount: 0,
        newProductCount: 0,
      },
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
      meta: {
        window: "24h",
        since: "2026-07-09T08:00:00.000Z",
        until: NOW.toISOString(),
        sourceStatus: "unavailable",
        lastSuccessAt: null,
      },
    });
    expect(fake.priceReadCount()).toBeGreaterThan(0);
    expect(fake.categoryReadCount()).toBe(1);
    expect(fake.productReadCount()).toBe(0);
  });

  it("rejects invalid values before any database read", async () => {
    const fake = createFakeClient();
    const response = await createGetPriceReportHandler(fake.client)(
      new Request("https://parts.example/api/price-report?type=drop&type=drop"),
    );

    expect(response.status).toBe(400);
    expect(fake.priceReadCount()).toBe(0);
    expect(fake.categoryReadCount()).toBe(0);
    expect(fake.productReadCount()).toBe(0);
  });

  it("passes every selected category to the reader and source status", async () => {
    const fake = createFakeClient(undefined, [
      sourceCategory(4, new Date("2026-07-10T07:30:00.000Z"), true),
      sourceCategory(12, null, false),
      sourceCategory(16, new Date("2026-07-10T07:45:00.000Z"), true),
    ]);
    const response = await createGetPriceReportHandler(fake.client, { now: () => NOW })(
      new Request("https://parts.example/api/price-report?category=gpu&category=cpu"),
    );

    expect(response.status).toBe(200);
    expect(fake.firstPriceReadArgs()).toMatchObject({
      where: {
        product: {
          sourceCategory: { igrp: { in: [4, 12] } },
        },
      },
    });
    expect((await response.json()).meta).toMatchObject({
      sourceStatus: "stale",
      lastSuccessAt: "2026-07-10T07:30:00.000Z",
    });
  });

  it("returns a generic error without leaking database details", async () => {
    const fake = createFakeClient(new Error("Prisma DATABASE_URL and secret token"));
    const response = await createGetPriceReportHandler(fake.client)(
      new Request("https://parts.example/api/price-report"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });

  it("returns a stable 503 when the reader work budget is exceeded", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fake = createFakeClient(
      new PriceReportWorkBudgetExceededError(
        "recent_current",
        PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
        PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
      ),
    );

    try {
      const response = await createGetPriceReportHandler(fake.client)(
        new Request("https://parts.example/api/price-report"),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(await response.json()).toEqual({
        error: {
          code: "temporarily_unavailable",
          message: API_ERROR_MESSAGES.temporarilyUnavailable,
        },
      });
      expect(fake.productReadCount()).toBe(0);
      expect(JSON.stringify(stderr.mock.calls)).not.toContain("DATABASE_URL");
    } finally {
      stderr.mockRestore();
    }
  });
});

function createFakeClient(
  priceError?: Error,
  sourceCategories: ReturnType<typeof sourceCategory>[] = [],
) {
  let priceReads = 0;
  let categoryReads = 0;
  let productReads = 0;
  let firstPriceReadArgs: unknown;
  const client = {
    priceSnapshot: {
      findMany: async (args: unknown) => {
        priceReads += 1;
        firstPriceReadArgs ??= args;

        if (priceError) {
          throw priceError;
        }

        return [];
      },
    },
    product: {
      findMany: async () => {
        productReads += 1;
        return [];
      },
    },
    sourceCategory: {
      findMany: async () => {
        categoryReads += 1;
        return sourceCategories;
      },
    },
  } as unknown as PriceReportApiReadClient;

  return {
    client,
    priceReadCount: () => priceReads,
    categoryReadCount: () => categoryReads,
    productReadCount: () => productReads,
    firstPriceReadArgs: () => firstPriceReadArgs,
  };
}

function sourceCategory(igrp: number, lastSuccessAt: Date | null, hasProduct: boolean) {
  return {
    igrp,
    displayName: `分類 ${igrp}`,
    sourceName: "原價屋",
    lastCheckedAt: NOW,
    lastSuccessAt,
    products: hasProduct ? [{ id: `product-${igrp}` }] : [],
  };
}
