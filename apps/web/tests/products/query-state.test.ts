// 驗證 category route state 與商品探索 filter query / API query 的分層契約。

import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUERY,
  createProductDetailHref,
  readQueryFromSearchParams,
  toApiSearchParams,
  toUrl,
} from "../../app/product-explorer/query-state";

describe("product explorer route and query state", () => {
  it("keeps category out of QueryState and emits it only to the API query", () => {
    const query = readQueryFromSearchParams(
      new URLSearchParams("vendors=asus&q=RTX&facet=gpu_chip:nvidia&facet=vram_gb:16"),
      "gpu",
    );

    expect(query).not.toHaveProperty("category");
    expect(query).toMatchObject({
      facets: ["gpu_chip:nvidia", "vram_gb:16"],
      vendors: ["asus"],
      q: "RTX",
    });
    expect(toUrl("gpu", query)).toBe(
      "/categories/gpu?q=RTX&facet=gpu_chip%3Anvidia&facet=vram_gb%3A16&vendors=asus",
    );

    const apiParams = toApiSearchParams("gpu", query);
    expect(apiParams.get("category")).toBe("gpu");
    expect(apiParams.getAll("facet")).toEqual(["gpu_chip:nvidia", "vram_gb:16"]);
    expect(apiParams.has("igrp")).toBe(false);
    expect(apiParams.has("source")).toBe(false);
  });

  it("preserves the category pathname while filter, sort, and pagination state changes", () => {
    const query = {
      ...DEFAULT_QUERY,
      vendors: ["asus"],
      sort: "price_desc" as const,
      page: 2,
      pageSize: 50,
    };

    expect(toUrl("gpu", query)).toBe(
      "/categories/gpu?vendors=asus&sort=price_desc&page=2&pageSize=50",
    );
    expect(toUrl(null, { ...DEFAULT_QUERY, q: "RTX" })).toBe("/?q=RTX");
  });

  it("carries the complete category pathname and filters into product returnTo", () => {
    const returnTo = toUrl("gpu", {
      ...DEFAULT_QUERY,
      vendors: ["asus"],
      page: 2,
    });
    const detailUrl = new URL(
      createProductDetailHref("product-id", returnTo),
      "https://partsradar.invalid",
    );

    expect(detailUrl.pathname).toBe("/products/product-id");
    expect(detailUrl.searchParams.get("returnTo")).toBe("/categories/gpu?vendors=asus&page=2");
  });

  it("deduplicates facets and emits them in registry order for the route category", () => {
    const query = readQueryFromSearchParams(
      new URLSearchParams(
        "facet=cpu_family:ryzen-7&facet=socket:am5&facet=socket:am5&facet=gpu_chip:nvidia",
      ),
      "cpu",
    );

    expect(query.facets).toEqual(["socket:am5", "cpu_family:ryzen-7"]);
    expect(toUrl("cpu", query)).toBe(
      "/categories/cpu?facet=socket%3Aam5&facet=cpu_family%3Aryzen-7",
    );
  });

  it("keeps exact SSD capacity and bucket facets in the internal API request", () => {
    const query = readQueryFromSearchParams(
      new URLSearchParams("facet=capacity_gb:1024&facet=capacity_bucket:about-1tb"),
      "storage",
    );

    expect(query.facets).toEqual(["capacity_gb:1024", "capacity_bucket:about-1tb"]);
    expect(toApiSearchParams("storage", query).getAll("facet")).toEqual([
      "capacity_gb:1024",
      "capacity_bucket:about-1tb",
    ]);
  });

  it("clears category-scoped filters on the homepage", () => {
    const query = readQueryFromSearchParams(
      new URLSearchParams("vendors=asus&facet=gpu_chip:nvidia"),
      null,
    );

    expect(query.facets).toEqual([]);
    expect(query.vendors).toEqual([]);
    expect(toApiSearchParams(null, query).has("category")).toBe(false);
    expect(toUrl(null, query)).toBe("/");
  });

  it("does not parse the legacy category browser query", () => {
    const query = readQueryFromSearchParams(
      new URLSearchParams("category=gpu&vendors=asus&facet=gpu_chip:nvidia&q=RTX"),
      null,
    );

    expect(query).not.toHaveProperty("category");
    expect(query.vendors).toEqual([]);
    expect(query.facets).toEqual([]);
    expect(toUrl(null, query)).toBe("/?q=RTX");
  });
});
