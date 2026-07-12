// 驗證商品探索頁只接受 semantic category URL，並清除已移除的 IGrp query。

import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUERY,
  getFallbackCategorySlug,
  readQueryFromSearchParams,
  toApiSearchParams,
  toUrl,
} from "../../app/product-explorer/query-state";

describe("product explorer category query state", () => {
  it("reads a semantic category and emits it to the browser and API", () => {
    const query = readQueryFromSearchParams(
      new URLSearchParams("category=gpu&vendors=asus&q=RTX&facet=gpu_chip:nvidia&facet=vram_gb:16"),
    );

    expect(query).toMatchObject({
      category: "gpu",
      facets: ["gpu_chip:nvidia", "vram_gb:16"],
      vendors: ["asus"],
      q: "RTX",
    });
    expect(toUrl(query)).toBe(
      "/?q=RTX&category=gpu&facet=gpu_chip%3Anvidia&facet=vram_gb%3A16&vendors=asus",
    );

    const apiParams = toApiSearchParams(query);
    expect(apiParams.get("category")).toBe("gpu");
    expect(apiParams.getAll("facet")).toEqual(["gpu_chip:nvidia", "vram_gb:16"]);
    expect(apiParams.has("igrp")).toBe(false);
    expect(apiParams.has("source")).toBe(false);
  });

  it("deduplicates facets and emits them in registry order", () => {
    const query = readQueryFromSearchParams(
      new URLSearchParams(
        "category=cpu&facet=cpu_family:ryzen-7&facet=socket:am5&facet=socket:am5&facet=gpu_chip:nvidia",
      ),
    );

    expect(query.facets).toEqual(["socket:am5", "cpu_family:ryzen-7"]);
    expect(toUrl(query)).toBe("/?category=cpu&facet=socket%3Aam5&facet=cpu_family%3Aryzen-7");
  });

  it("clears facets without a compatible category", () => {
    expect(readQueryFromSearchParams(new URLSearchParams("facet=socket:am5")).facets).toEqual([]);
    expect(
      readQueryFromSearchParams(new URLSearchParams("category=gpu&facet=socket:am5")).facets,
    ).toEqual([]);
  });

  it.each([
    "igrp=12",
    "category=gpu&igrp=12",
  ])("ignores the removed legacy query without affecting semantic categories: %s", (search) => {
    const query = readQueryFromSearchParams(new URLSearchParams(search));

    expect(query.category).toBe(search.startsWith("category=gpu") ? "gpu" : "");
    expect(toUrl(query)).toBe(search.startsWith("category=gpu") ? "/?category=gpu" : "/");
  });

  it.each([
    "category=unknown",
    "igrp=99",
  ])("clears an unknown or conflicting category query: %s", (search) => {
    const query = readQueryFromSearchParams(
      new URLSearchParams(`${search}&vendors=asus&facet=gpu_chip:nvidia`),
    );

    expect(query.category).toBe("");
    expect(query.facets).toEqual([]);
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
            facets: [],
          },
        ],
        DEFAULT_QUERY.category,
      ),
    ).toBe("cpu");
    expect(getFallbackCategorySlug([], "gpu")).toBe("gpu");
  });
});
