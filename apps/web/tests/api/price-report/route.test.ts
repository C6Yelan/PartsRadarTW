// apps/web/tests/api/price-report/route.test.ts
// 驗證 production route client 在接近工作量上限時仍使用固定數量的 set-based raw queries。

import type { Prisma, PrismaClient } from "@partsradar/db";
import { PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT } from "@partsradar/db/price-report";
import { describe, expect, it, vi } from "vitest";

import { handleGetPriceReportRoute } from "../../../app/api/price-report/route";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const SINCE = new Date("2026-07-28T12:00:00.000Z");

describe("GET /api/price-report production wiring", () => {
  it("keeps DB query count constant near the current-row budget", async () => {
    const fake = createProductionPrisma(PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT);

    const response = await handleGetPriceReportRoute(
      new Request("https://parts.example/api/price-report?pageSize=1"),
      fake.client,
    );

    expect(response.status).toBe(200);
    expect(fake.priceSnapshotFindMany).not.toHaveBeenCalled();
    expect(fake.rawQueries).toHaveLength(2);
    expect(fake.rawQueries[0]?.sql).toContain("bounded_current_snapshots AS MATERIALIZED");
    expect(fake.rawQueries[1]?.sql).toContain("JOIN LATERAL");
    expect(fake.sourceCategoryFindMany).toHaveBeenCalledTimes(1);
    expect(fake.productFindMany).toHaveBeenCalledTimes(1);
    expect(fake.totalQueryCount()).toBe(4);
  });

  it("fails closed before predecessor reads when the production path overflows", async () => {
    const fake = createProductionPrisma(PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1);

    const response = await handleGetPriceReportRoute(
      new Request("https://parts.example/api/price-report"),
      fake.client,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(fake.priceSnapshotFindMany).not.toHaveBeenCalled();
    expect(fake.rawQueries).toHaveLength(1);
    expect(fake.rawQueries[0]?.sql).toContain("bounded_current_snapshots AS MATERIALIZED");
    expect(fake.productFindMany).not.toHaveBeenCalled();
  });
});

function createProductionPrisma(currentRowCount: number) {
  const currentRows = Array.from({ length: currentRowCount }, (_, index) => ({
    id: uuidFor(index + 1),
    productId: uuidFor(index + 10_000),
    price: 9_000 + index,
    currency: "TWD",
    capturedAt: new Date(SINCE.getTime() + index + 1),
    productName: `Production-shaped GPU ${index}`,
    vendorSlug: "vendor",
    vendorName: "Vendor",
    productIsExcluded: false,
    categoryIgrp: 12,
    categoryDisplayName: "顯示卡",
    categoryEnabled: true,
  }));
  const baselineRows = currentRows.slice(0, PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT).map((row) => ({
    id: uuidFor(Number.parseInt(row.id.slice(-8), 16) + 20_000),
    productId: row.productId,
    price: row.price + 1_000,
    currency: row.currency,
    capturedAt: new Date(SINCE.getTime() - 1),
  }));
  const rawQueries: Prisma.Sql[] = [];
  const priceSnapshotFindMany = vi.fn();
  const productFindMany = vi.fn(async () => []);
  const sourceCategoryFindMany = vi.fn(async () => [
    {
      igrp: 12,
      displayName: "顯示卡",
      sourceName: "原價屋",
      lastCheckedAt: NOW,
      lastSuccessAt: NOW,
      products: [{ id: currentRows[0]?.productId ?? uuidFor(1) }],
    },
  ]);
  const queryRaw = vi.fn(async <T>(query: Prisma.Sql): Promise<T> => {
    rawQueries.push(query);

    if (query.sql.includes("bounded_current_snapshots AS MATERIALIZED")) {
      return currentRows as T;
    }
    if (query.sql.includes("requested_products")) {
      return baselineRows as T;
    }

    throw new Error("Unexpected raw query.");
  });
  const client = {
    priceSnapshot: {
      findMany: priceSnapshotFindMany,
    },
    product: {
      findMany: productFindMany,
    },
    sourceCategory: {
      findMany: sourceCategoryFindMany,
    },
    $queryRaw: queryRaw,
  } as unknown as PrismaClient;

  return {
    client,
    priceSnapshotFindMany,
    productFindMany,
    rawQueries,
    sourceCategoryFindMany,
    totalQueryCount: () =>
      rawQueries.length + productFindMany.mock.calls.length + sourceCategoryFindMany.mock.calls.length,
  };
}

function uuidFor(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}
