// apps/web/tests/products/return-href.test.ts
// 驗證商品詳細頁 returnTo 只允許安全站內返回路徑，外站與不支援路徑會回首頁。

import { describe, expect, it } from "vitest";

import {
  normalizeBuildListReturnHref,
  normalizeReturnHref,
} from "../../app/products/[id]/return-href";

describe("product detail return href", () => {
  it("allows the product explorer root path and build list path", () => {
    expect(normalizeReturnHref("/?category=gpu&q=ryzen&page=2")).toBe(
      "/?category=gpu&q=ryzen&page=2",
    );
    expect(normalizeReturnHref(["/?status=inactive", "/?q=ignored"])).toBe("/?status=inactive");
    expect(normalizeReturnHref("/build-list")).toBe("/build-list");
    expect(
      normalizeReturnHref("/price-report?window=7d&type=drop&type=rise&category=gpu&page=2"),
    ).toBe("/price-report?window=7d&type=drop&type=rise&category=gpu&page=2");
  });

  it("rejects the removed legacy category query and invalid semantic categories", () => {
    expect(normalizeReturnHref("/?igrp=7")).toBe("/");
    expect(normalizeReturnHref("/?category=storage&igrp=7")).toBe("/");
    expect(normalizeReturnHref("/?category=cpu&igrp=7")).toBe("/");
    expect(normalizeReturnHref("/?category=unknown")).toBe("/");
  });

  it("falls back home for external, protocol-relative, or unsupported return URLs", () => {
    expect(normalizeReturnHref(undefined)).toBe("/");
    expect(normalizeReturnHref("https://example.test/?q=ryzen")).toBe("/");
    expect(normalizeReturnHref("//example.test/?q=ryzen")).toBe("/");
    expect(normalizeReturnHref("/products/11111111-1111-1111-1111-111111111111?category=gpu")).toBe(
      "/",
    );
  });
});

describe("build list return href", () => {
  it("preserves complete public product explorer queries", () => {
    const returnTo =
      "/?q=ryzen&category=cpu&vendors=amd&facet=socket%3Aam5&facet=cpu_family%3Aryzen-7&minPrice=1000&maxPrice=20000&status=all&sort=price_desc&page=3&pageSize=50";

    expect(normalizeBuildListReturnHref(returnTo)).toBe(returnTo);
    expect(normalizeBuildListReturnHref("/about#contact")).toBe("/about");
    expect(normalizeBuildListReturnHref("/products/example?returnTo=%2Fprice-report")).toBe(
      "/products/example?returnTo=%2Fprice-report",
    );
  });

  it("rejects unsafe, legacy, invalid, or self-referencing values", () => {
    expect(normalizeBuildListReturnHref(undefined)).toBe("/");
    expect(normalizeBuildListReturnHref("https://evil.example/path")).toBe("/");
    expect(normalizeBuildListReturnHref("//evil.example/path")).toBe("/");
    expect(normalizeBuildListReturnHref("/?igrp=4")).toBe("/");
    expect(normalizeBuildListReturnHref("/?category=unknown")).toBe("/");
    expect(normalizeBuildListReturnHref("/build-list?returnTo=%2Fabout")).toBe("/");
  });
});
