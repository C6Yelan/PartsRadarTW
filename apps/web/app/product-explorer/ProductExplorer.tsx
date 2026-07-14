"use client";
// apps/web/app/product-explorer/ProductExplorer.tsx
// 提供首頁商品探索頁的 client-side 組裝入口，串接搜尋、分類、結果與聲明區塊。

import SiteDisclaimer from "../site-disclaimer";
import { ProductExplorerHeader } from "./components/ProductExplorerHeader";
import { ProductExplorerResultsPanel } from "./components/ProductExplorerResultsPanel";
import { ProductFilters } from "./components/ProductFilters";
import { useProductExplorerViewModel } from "./use-product-explorer-view-model";

// 組裝商品探索頁主畫面，將 view model 切分給 header、filter 與 results。
export default function ProductExplorer() {
  const viewModel = useProductExplorerViewModel();

  return (
    <div className="app-shell">
      <ProductExplorerHeader
        draft={viewModel.header.draft}
        products={viewModel.header.products}
        onClearSearchDraft={viewModel.header.actions.clearSearchDraft}
        onReturnHome={viewModel.header.actions.returnHome}
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
            onCategoryChange={viewModel.filters.actions.updateCategoryFilter}
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
