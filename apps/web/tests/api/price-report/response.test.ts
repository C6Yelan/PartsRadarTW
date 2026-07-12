// apps/web/tests/api/price-report/response.test.ts
// 驗證價格報告公開 response 的摘要、排序、分頁、百分比與欄位最小化。

import type { RecentPriceReport } from "@partsradar/db/price-report";
import { describe, expect, it } from "vitest";

import type { PriceReportQuery } from "../../../app/api/price-report/query";
import {
  attachPriceReportImages,
  buildPriceReportResponse,
} from "../../../app/api/price-report/response";

const SINCE = new Date("2026-07-09T08:00:00.000Z");
const UNTIL = new Date("2026-07-10T08:00:00.000Z");

describe("price report response", () => {
  it("normalizes price changes and new products before pagination", () => {
    const response = buildPriceReportResponse(REPORT, {
      query: createQuery({ pageSize: 2 }),
      since: SINCE,
      until: UNTIL,
      sourceStatus: { status: "ok", lastSuccessAt: UNTIL.toISOString() },
    });

    expect(response.summary).toEqual({
      dropCount: 1,
      riseCount: 1,
      newProductCount: 1,
    });
    expect(response.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });
    expect(response.data.map((item) => item.productId)).toEqual(["new", "rise"]);
    expect(response.data[1]).toMatchObject({
      kind: "rise",
      previousPrice: 10_000,
      currentPrice: 10_500,
      deltaAmount: 500,
      deltaPercent: 5,
      changedAt: "2026-07-10T06:00:00.000Z",
    });
    expect(JSON.stringify(response)).not.toMatch(/snapshot|crawlRun|vendor|subcategory|discord/i);
  });

  it("sorts drops by percentage and keeps nullable new-product movement fields", () => {
    const response = buildPriceReportResponse(REPORT, {
      query: createQuery({ sort: "drop_percent_desc", pageSize: 20 }),
      since: SINCE,
      until: UNTIL,
      sourceStatus: { status: "stale", lastSuccessAt: SINCE.toISOString() },
    });

    expect(response.data[0]).toMatchObject({
      productId: "drop",
      kind: "drop",
      deltaAmount: -1_000,
      deltaPercent: -5,
      category: { slug: "gpu" },
    });
    expect(response.data.find((item) => item.kind === "new")).toMatchObject({
      previousPrice: null,
      deltaAmount: null,
      deltaPercent: null,
    });
    expect(response.meta.sourceStatus).toBe("stale");
  });

  it.each([
    ["rise_percent_desc", ["rise", "new", "drop"]],
    ["delta_amount_desc", ["drop", "rise", "new"]],
  ] as const)("sorts all items with %s before pagination", (sort, productIds) => {
    const response = buildPriceReportResponse(REPORT, {
      query: createQuery({ sort, pageSize: 20 }),
      since: SINCE,
      until: UNTIL,
      sourceStatus: { status: "ok", lastSuccessAt: UNTIL.toISOString() },
    });

    expect(response.data.map((item) => item.productId)).toEqual(productIds);
  });

  it("clamps an out-of-range page to the last available page", () => {
    const response = buildPriceReportResponse(REPORT, {
      query: createQuery({ page: 99, pageSize: 2 }),
      since: SINCE,
      until: UNTIL,
      sourceStatus: { status: "ok", lastSuccessAt: UNTIL.toISOString() },
    });

    expect(response.pagination.page).toBe(2);
    expect(response.data.map((item) => item.productId)).toEqual(["drop"]);
  });

  it("only exposes product images after the local cache is confirmed", () => {
    const response = buildPriceReportResponse(REPORT, {
      query: createQuery({ pageSize: 20 }),
      since: SINCE,
      until: UNTIL,
      sourceStatus: { status: "ok", lastSuccessAt: UNTIL.toISOString() },
    });
    const withImages = attachPriceReportImages(response, [
      {
        id: "drop",
        imageCachedAt: UNTIL,
      },
      {
        id: "rise",
        imageCachedAt: null,
      },
    ]);

    expect(withImages.data.find((item) => item.productId === "drop")?.image).toEqual({
      url: "/api/product-images/drop.webp",
      alt: "降價顯示卡",
    });
    expect(withImages.data.find((item) => item.productId === "rise")?.image).toBeNull();
    expect(withImages.data.find((item) => item.productId === "new")?.image).toBeNull();
  });
});

function createQuery(overrides: Partial<PriceReportQuery>): PriceReportQuery {
  return {
    window: "24h",
    types: ["drop", "rise", "new"],
    categorySlug: null,
    categoryIgrp: null,
    productKeyword: null,
    sort: "changed_desc",
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

const REPORT: RecentPriceReport = {
  priceChanges: [
    {
      productId: "drop",
      productName: "降價顯示卡",
      category: { igrp: 12, displayName: "顯示卡" },
      subcategory: null,
      previousPrice: 20_000,
      currentPrice: 19_000,
      currency: "TWD",
      changedAt: new Date("2026-07-10T05:00:00.000Z"),
      delta: -1_000,
    },
    {
      productId: "rise",
      productName: "漲價處理器",
      category: { igrp: 4, displayName: "CPU" },
      subcategory: null,
      previousPrice: 10_000,
      currentPrice: 10_500,
      currency: "TWD",
      changedAt: new Date("2026-07-10T06:00:00.000Z"),
      delta: 500,
    },
  ],
  newProducts: [
    {
      productId: "new",
      productName: "新上架主機板",
      category: { igrp: 5, displayName: "主機板" },
      subcategory: null,
      currentPrice: 8_000,
      currency: "TWD",
      firstSeenAt: new Date("2026-07-10T07:00:00.000Z"),
    },
  ],
};
