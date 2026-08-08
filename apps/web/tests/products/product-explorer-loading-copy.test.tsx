// 驗證商品探索器不會把尚未取得的 client response 誤寫成真實 0 或尚無資料。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CategorySlug } from "../../app/category-slugs";
import { ProductExplorerHeader } from "../../app/product-explorer/components/ProductExplorerHeader";
import { ProductToolbar } from "../../app/product-explorer/components/ProductToolbar";
import { DEFAULT_QUERY } from "../../app/product-explorer/query-state";
import type { LoadState, ProductsResponse } from "../../app/product-explorer/types";

describe("product explorer response semantics", () => {
  it("renders an unknown count before the first products response", () => {
    const html = renderToolbar(null, "idle");

    expect(html).toContain("載入中");
    expect(html).not.toContain("0 筆商品");
  });

  it("renders a real zero only after a successful response", () => {
    expect(renderToolbar(0, "ready")).toContain("0 筆商品");
  });

  it("keeps a successful non-zero product count and the shared H1", () => {
    expect(renderToolbar(12_345, "ready")).toContain("12,345 筆商品");
    expect(renderToolbar(400, "ready", null)).toContain("<h1>搜尋結果</h1>");
    expect(renderToolbar(400, "ready", "gpu")).toContain("<h1>搜尋結果</h1>");
  });

  it("does not turn request failures into zero counts", () => {
    for (const state of ["error", "rate_limited"] satisfies LoadState[]) {
      const html = renderToolbar(null, state);

      expect(html).toContain("數量暫時無法取得");
      expect(html).not.toContain("0 筆商品");
    }
  });

  it("does not label an unloaded or failed timestamp as genuine no-data", () => {
    expect(renderHeader(null, "idle")).toContain("資料最近更新：載入中");
    expect(renderHeader(null, "idle")).not.toContain("資料最近更新：尚無資料");
    expect(renderHeader(null, "error")).toContain("資料最近更新：暫時無法取得");
    expect(renderHeader(null, "rate_limited")).toContain("資料最近更新：暫時無法取得");
  });

  it("preserves genuine no-data and timestamp responses", () => {
    expect(renderHeader(productsResponse(null), "ready")).toContain("資料最近更新：尚無資料");
    expect(renderHeader(productsResponse("2026-07-10T08:00:00.000Z"), "ready")).toContain(
      "資料最近更新：2026-07-10 16:00",
    );
  });
});

function renderToolbar(
  totalItems: number | null,
  productState: LoadState,
  selectedCategory: CategorySlug | null = null,
) {
  return renderToStaticMarkup(
    <ProductToolbar
      categories={[]}
      draft={DEFAULT_QUERY}
      formError={null}
      hasActiveFilters={false}
      productState={productState}
      query={DEFAULT_QUERY}
      selectedCategory={selectedCategory}
      selectedFacetChips={[]}
      selectedVendorOptions={[]}
      totalItems={totalItems}
      vendorOptions={[]}
      onClearVendors={() => undefined}
      onDraftChange={() => undefined}
      onPageSizeChange={() => undefined}
      onRemoveFacetGroup={() => undefined}
      onResetFilters={() => undefined}
      onSortChange={() => undefined}
      onStatusChange={() => undefined}
      onToggleFacet={() => undefined}
      onToggleVendor={() => undefined}
    />,
  );
}

function renderHeader(products: ProductsResponse | null, productState: LoadState) {
  return renderToStaticMarkup(
    <ProductExplorerHeader
      draft={DEFAULT_QUERY}
      products={products}
      productState={productState}
      onClearSearchDraft={() => undefined}
      onSearchDraftChange={() => undefined}
      onTextFiltersSubmit={() => undefined}
    />,
  );
}

function productsResponse(lastSuccessAt: string | null): ProductsResponse {
  return {
    data: [],
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    },
    meta: {
      sourceStatus: "ok",
      lastSuccessAt,
      vendors: [],
    },
  };
}
