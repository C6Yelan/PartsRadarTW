// apps/web/tests/api/price-report/query.test.ts
// 驗證價格報告時間窗、類型、分類與 reader filter 的嚴格 query contract。

import { describe, expect, it } from "vitest";

import { InvalidQueryError } from "../../../app/api/_shared/query";
import {
  getPriceReportSince,
  parsePriceReportQuery,
  toRecentPriceReportFilters,
} from "../../../app/api/price-report/query";

const NOW = new Date("2026-07-10T08:00:00.000Z");

describe("price report query", () => {
  it("defaults to 24 hours with price changes but without new products", () => {
    const query = parsePriceReportQuery(new URLSearchParams());

    expect(query).toMatchObject({
      window: "24h",
      types: ["drop", "rise"],
      categorySlugs: [],
      categoryIgrps: [],
      productKeyword: null,
      sort: "changed_desc",
      page: 1,
      pageSize: 20,
    });
    expect(toRecentPriceReportFilters(query)).toEqual({
      categoryIgrps: [],
      productKeyword: null,
      includePriceDrops: true,
      includePriceRises: true,
      includeNewProducts: false,
    });
    expect(getPriceReportSince(NOW, "24h").toISOString()).toBe(
      "2026-07-09T08:00:00.000Z",
    );
  });

  it("maps repeated types, categories and keyword to explicit reader filters", () => {
    const query = parsePriceReportQuery(
      new URLSearchParams(
        "window=7d&type=drop&type=new&category=gpu&category=cpu&q=RTX&sort=drop_percent_desc&page=2&pageSize=50",
      ),
    );

    expect(query).toMatchObject({
      window: "7d",
      types: ["drop", "new"],
      categorySlugs: ["cpu", "gpu"],
      categoryIgrps: [4, 12],
      productKeyword: "RTX",
      sort: "drop_percent_desc",
      page: 2,
      pageSize: 50,
    });
    expect(toRecentPriceReportFilters(query)).toEqual({
      categoryIgrps: [4, 12],
      productKeyword: "RTX",
      includePriceDrops: true,
      includePriceRises: false,
      includeNewProducts: true,
    });
    expect(getPriceReportSince(NOW, "7d").toISOString()).toBe(
      "2026-07-03T08:00:00.000Z",
    );
    expect(getPriceReportSince(NOW, "30d").toISOString()).toBe(
      "2026-06-10T08:00:00.000Z",
    );
  });

  it("keeps the legacy single category parameter valid", () => {
    const query = parsePriceReportQuery(new URLSearchParams("category=cpu"));

    expect(query.categorySlugs).toEqual(["cpu"]);
    expect(query.categoryIgrps).toEqual([4]);
  });

  it.each([
    "window=1h",
    "type=unknown",
    "type=drop&type=drop",
    "type=",
    "category=unknown",
    "category=gpu&category=gpu",
    "sort=price_desc",
    "page=0",
    "pageSize=500",
  ])("rejects invalid query values: %s", (search) => {
    expect(() => parsePriceReportQuery(new URLSearchParams(search))).toThrow(InvalidQueryError);
  });
});
