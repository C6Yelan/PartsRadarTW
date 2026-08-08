// apps/web/tests/products/api-error-copy.test.tsx
// 驗證 categories、products、detail、history 與 build-list 顯示同一個安全 429 提示。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { API_RATE_LIMITED_MESSAGE } from "../../app/_shared/api-client";
import BuildListSummaryPanel from "../../app/build-list/components/BuildListSummaryPanel";
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
          selectedCategory={null}
          getCategoryHref={() => "/categories/cpu"}
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
        <BuildListSummaryPanel
          categories={[]}
          isDownloadDisabled={false}
          itemCount={1}
          lastSuccessfulSyncAt={null}
          refreshState="rate_limited"
          summary={{
            itemCount: 1,
            totalQuantity: 1,
            totalAmount: 0,
            unpricedItemCount: 1,
            activeItemCount: 0,
            inactiveItemCount: 0,
            missingItemCount: 0,
            unavailableItemCount: 1,
            exportItemCount: 1,
          }}
          onClear={() => undefined}
          onDownloadExcel={() => undefined}
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
