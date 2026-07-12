// apps/web/tests/price-report/query-state.test.ts
// 驗證價格變動頁 URL 的預設省略、類型順序與不相容值清理。

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRICE_REPORT_QUERY,
  readPriceReportQuery,
  toPriceReportUrl,
} from "../../app/price-report/query-state";

describe("price report query state", () => {
  it("omits defaults from the public page URL", () => {
    expect(readPriceReportQuery(new URLSearchParams())).toEqual(
      DEFAULT_PRICE_REPORT_QUERY,
    );
    expect(toPriceReportUrl(DEFAULT_PRICE_REPORT_QUERY)).toBe("/price-report");
  });

  it("normalizes selected types in canonical order", () => {
    const query = readPriceReportQuery(
      new URLSearchParams(
        "window=7d&type=new&type=drop&type=invalid&category=gpu&q=RTX&sort=drop_percent_desc&page=2",
      ),
    );

    expect(query).toEqual({
      window: "7d",
      types: ["drop", "new"],
      category: "gpu",
      q: "RTX",
      sort: "drop_percent_desc",
      page: 2,
    });
    expect(toPriceReportUrl(query)).toBe(
      "/price-report?window=7d&type=drop&type=new&category=gpu&q=RTX&sort=drop_percent_desc&page=2",
    );
  });

  it("keeps the optional new-product type explicit in shared URLs", () => {
    expect(
      toPriceReportUrl({
        ...DEFAULT_PRICE_REPORT_QUERY,
        types: ["drop", "rise", "new"],
      }),
    ).toBe("/price-report?type=drop&type=rise&type=new");
  });

  it("clears unsupported categories and invalid scalar values", () => {
    expect(
      readPriceReportQuery(
        new URLSearchParams("window=1h&type=nope&category=unknown&sort=nope&page=0"),
      ),
    ).toEqual(DEFAULT_PRICE_REPORT_QUERY);
  });
});
