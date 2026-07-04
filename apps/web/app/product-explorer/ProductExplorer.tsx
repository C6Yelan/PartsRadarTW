"use client";
// apps/web/app/product-explorer/ProductExplorer.tsx

import FloatingBuildListLink from "../build-list/FloatingBuildListLink";
import SiteDisclaimer from "../site-disclaimer";
import { ProductExplorerHeader } from "./components/ProductExplorerHeader";
import { ProductExplorerResultsPanel } from "./components/ProductExplorerResultsPanel";
import { ProductFilters } from "./components/ProductFilters";
import { useProductExplorerViewModel } from "./use-product-explorer-view-model";

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
            selectedIgrp={viewModel.filters.selectedIgrp}
            onCategoryChange={viewModel.filters.actions.updateCategoryFilter}
            onKeepDesktopOpen={viewModel.filters.actions.keepDesktopFiltersOpen}
            onToggleOpen={viewModel.filters.actions.syncFiltersOpenFromToggle}
          />

          <ProductExplorerResultsPanel
            actions={viewModel.results.actions}
            pagination={viewModel.results.pagination}
            panel={viewModel.results.panel}
            table={viewModel.results.table}
            toolbar={viewModel.results.toolbar}
          />
        </div>
      </main>
      <FloatingBuildListLink summary={viewModel.buildList.summary} />
      <SiteDisclaimer />
    </div>
  );
}
