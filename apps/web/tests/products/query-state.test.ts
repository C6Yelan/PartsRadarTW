// 驗證商品探索頁只產生 semantic category URL，並 canonicalize legacy IGrp query。

import { describe, expect, it } from "vitest";

import {
  createProductDetailHref,
  DEFAULT_QUERY,
  getFallbackCategorySlug,
  readQueryFromSearchParams,
  toApiSearchParams,
  toUrl,
} from "../../app/product-explorer/query-state";

describe("product explorer category query state", () => {
  it("reads a semantic category and emits it to the browser and API", () => {
    const query = readQueryFromSearchParams(new URLSearchParams("category=gpu&vendors=asus&q=RTX"));

    expect(query).toMatchObject({ category: "gpu", vendors: ["asus"], q: "RTX" });
    expect(toUrl(query)).toBe("/?q=RTX&category=gpu&vendors=asus");

    const apiParams = toApiSearchParams(query);
    expect(apiParams.get("category")).toBe("gpu");
    expect(apiParams.has("igrp")).toBe(false);
    expect(apiParams.has("source")).toBe(false);
  });

  it.each([
    "igrp=12",
    "category=gpu&igrp=12",
  ])("canonicalizes a compatible legacy query: %s", (search) => {
    const query = readQueryFromSearchParams(new URLSearchParams(search));

    expect(query.category).toBe("gpu");
    expect(toUrl(query)).toBe("/?category=gpu");
    expect(createProductDetailHref("product-1", toUrl(query))).toBe(
      "/products/product-1?returnTo=%2F%3Fcategory%3Dgpu",
    );
  });

  it.each([
    "category=unknown",
    "igrp=99",
    "category=cpu&igrp=12",
  ])("clears an unknown or conflicting category query: %s", (search) => {
    const query = readQueryFromSearchParams(new URLSearchParams(`${search}&vendors=asus`));

    expect(query.category).toBe("");
    expect(query.vendors).toEqual([]);
    expect(toUrl(query)).toBe("/");
  });

  it("uses the first categories API slug as the homepage fallback", () => {
    expect(
      getFallbackCategorySlug(
        [
          {
            id: "category-4",
            slug: "cpu",
            displayName: "CPU",
            sourceName: "處理器 CPU",
          },
        ],
        DEFAULT_QUERY.category,
      ),
    ).toBe("cpu");
    expect(getFallbackCategorySlug([], "gpu")).toBe("gpu");
  });
});
