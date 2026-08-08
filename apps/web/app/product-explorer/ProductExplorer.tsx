"use client";
// apps/web/app/product-explorer/ProductExplorer.tsx
// 提供首頁與 category routes 共用的 client-side 商品探索組裝入口。

import SiteDisclaimer from "../site-disclaimer";
import { ProductExplorerHeader } from "./components/ProductExplorerHeader";
import { ProductExplorerResultsPanel } from "./components/ProductExplorerResultsPanel";
import { ProductFilters } from "./components/ProductFilters";
import type { ProductExplorerRouteState } from "./types";
import { useProductExplorerViewModel } from "./use-product-explorer-view-model";

// 組裝商品探索頁主畫面，將 view model 切分給 header、filter 與 results。
export default function ProductExplorer({ routeState }: { routeState: ProductExplorerRouteState }) {
  const viewModel = useProductExplorerViewModel(routeState);

  return (
    <div className="app-shell">
      <ProductExplorerHeader
        draft={viewModel.header.draft}
        products={viewModel.header.products}
        productState={viewModel.header.productState}
        onClearSearchDraft={viewModel.header.actions.clearSearchDraft}
        onSearchDraftChange={viewModel.header.actions.updateSearchDraft}
        onTextFiltersSubmit={viewModel.header.actions.applyTextFilters}
      />

      <main className="dashboard-shell">
        <div className="workspace-grid">
          <ProductFilters
            categories={viewModel.filters.categories}
            categoryState={viewModel.filters.categoryState}
            filtersOpen={viewModel.filters.filtersOpen}
            selectedCategory={viewModel.filters.selectedCategory}
            getCategoryHref={viewModel.filters.actions.getCategoryHref}
            onKeepDesktopOpen={viewModel.filters.actions.keepDesktopFiltersOpen}
            onToggleOpen={viewModel.filters.actions.syncFiltersOpenFromToggle}
          />

          <ProductExplorerResultsPanel results={viewModel.results} />
        </div>
      </main>
      <SiteDisclaimer />
    </div>
  );
}
