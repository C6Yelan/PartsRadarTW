// apps/web/tests/products/api-error-copy.test.tsx
// 驗證 categories、products、detail、history 與 build-list 顯示同一個安全 429 提示。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { API_RATE_LIMITED_MESSAGE } from "../../app/_shared/api-client";
import BuildListRefreshStatus from "../../app/build-list/components/BuildListRefreshStatus";
import { ProductFilters } from "../../app/product-explorer/components/ProductFilters";
import { ProductTable } from "../../app/product-explorer/components/ProductTable";
import PriceHistoryPanel from "../../app/products/[id]/price-history-panel";
import { ProductDetailErrorState } from "../../app/products/[id]/product-detail";

describe("public API rate-limit copy", () => {
  it("uses one message across the five main API surfaces", () => {
    const surfaces = [
      renderToStaticMarkup(
        <ProductFilters
          categories={[]}
          categoryState="rate_limited"
          filtersOpen={true}
          selectedCategory=""
          onCategoryChange={() => undefined}
          onKeepDesktopOpen={() => undefined}
          onToggleOpen={() => undefined}
        />,
      ),
      renderToStaticMarkup(
        <ProductTable
          buildListQuantities={new Map()}
          isProductLimitReached={false}
          productListReturnTo="/"
          products={null}
          productState="rate_limited"
          onAddToBuildList={() => undefined}
          onDecreaseBuildListQuantity={() => undefined}
        />,
      ),
      renderToStaticMarkup(<ProductDetailErrorState state="rate_limited" />),
      renderToStaticMarkup(
        <PriceHistoryPanel
          history={null}
          selectedRange={90}
          state="rate_limited"
          onRangeChange={() => undefined}
        />,
      ),
      renderToStaticMarkup(
        <BuildListRefreshStatus
          itemCount={1}
          lastSuccessfulSyncAt={null}
          missingItemCount={0}
          state="rate_limited"
          onRefresh={() => undefined}
        />,
      ),
    ];

    for (const html of surfaces) {
      expect(html).toContain(API_RATE_LIMITED_MESSAGE);
      expect(html).not.toContain("Internal server error");
    }
  });
});
