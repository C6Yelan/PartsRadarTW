"use client";
// apps/web/app/product-explorer/components/ProductExplorerResultsPanel.tsx
// 組裝商品探索結果區塊，將 toolbar、商品表格與分頁控制接到 view model。

import { Pagination } from "../../_shared/Pagination";
import type { useProductExplorerViewModel } from "../use-product-explorer-view-model";
import { ProductTable } from "./ProductTable";
import { ProductToolbar } from "./ProductToolbar";

type ProductExplorerResults = ReturnType<typeof useProductExplorerViewModel>["results"];

// 呈現商品列表主區域，負責把分組後的資料與事件傳給子元件。
export function ProductExplorerResultsPanel({
  results: { actions, pagination, panel, table, toolbar },
}: {
  results: ProductExplorerResults;
}) {
  return (
    <section className="results-panel" ref={panel.ref} aria-label="商品列表">
      <ProductToolbar
        categories={toolbar.categories}
        draft={toolbar.draft}
        formError={toolbar.formError}
        hasActiveFilters={toolbar.hasActiveFilters}
        query={toolbar.query}
        selectedFacetChips={toolbar.selectedFacetChips}
        selectedVendorOptions={toolbar.selectedVendorOptions}
        totalItems={toolbar.totalItems}
        vendorOptions={toolbar.vendorOptions}
        onClearVendors={actions.toolbar.clearVendors}
        onDraftChange={actions.toolbar.draftChange}
        onPageSizeChange={actions.toolbar.pageSizeChange}
        onRemoveFacetGroup={actions.toolbar.removeFacetGroup}
        onResetFilters={actions.toolbar.resetFilters}
        onSortChange={actions.toolbar.sortChange}
        onStatusChange={actions.toolbar.statusChange}
        onToggleVendor={actions.toolbar.toggleVendor}
        onToggleFacet={actions.toolbar.toggleFacet}
      />

      <ProductTable
        buildListQuantities={table.buildListQuantities}
        isProductLimitReached={table.isProductLimitReached}
        productListReturnTo={table.productListReturnTo}
        products={table.products}
        productState={table.productState}
        onAddToBuildList={actions.table.addToBuildList}
        onDecreaseBuildListQuantity={actions.table.decreaseBuildListQuantity}
      />

      <Pagination
        isLoading={pagination.isLoading}
        page={pagination.page}
        pageJumpValue={pagination.pageJumpValue}
        shouldShowPageJump={pagination.shouldShowPageJump}
        totalPages={pagination.totalPages}
        visiblePages={pagination.visiblePages}
        onGoToPage={actions.pagination.goToPage}
        onJumpSubmit={actions.pagination.jumpSubmit}
        onPageJumpValueChange={actions.pagination.pageJumpValueChange}
      />
    </section>
  );
}
