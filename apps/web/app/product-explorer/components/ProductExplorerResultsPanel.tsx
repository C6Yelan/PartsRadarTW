"use client";
// apps/web/app/product-explorer/components/ProductExplorerResultsPanel.tsx
// 組裝商品探索結果區塊，將 toolbar、商品表格與分頁控制接到 view model。

import type { FormEvent, RefObject } from "react";
import type {
  LoadState,
  ProductListItem,
  ProductSort,
  ProductStatus,
  ProductsResponse,
  ProductVendorOption,
  QueryState,
} from "../types";
import { Pagination } from "./Pagination";
import { ProductTable } from "./ProductTable";
import { ProductToolbar } from "./ProductToolbar";

// 呈現商品列表主區域，負責把分組後的資料與事件傳給子元件。
export function ProductExplorerResultsPanel({
  actions,
  pagination,
  panel,
  table,
  toolbar,
}: {
  actions: {
    toolbar: {
      clearVendors: () => void;
      draftChange: (draft: QueryState) => void;
      pageSizeChange: (pageSize: number) => void;
      resetFilters: () => void;
      sortChange: (sort: ProductSort) => void;
      statusChange: (status: ProductStatus) => void;
      toggleVendor: (vendor: string) => void;
    };
    table: {
      addToBuildList: (product: ProductListItem) => void;
      decreaseBuildListQuantity: (product: ProductListItem) => void;
    };
    pagination: {
      goToPage: (page: number) => void;
      jumpSubmit: (event: FormEvent<HTMLFormElement>) => void;
      pageJumpValueChange: (value: string) => void;
    };
  };
  pagination: {
    page: number;
    pageJumpValue: string;
    productState: LoadState;
    shouldShowPageJump: boolean;
    totalPages: number;
    visiblePages: Array<number | string>;
  };
  panel: {
    ref: RefObject<HTMLElement | null>;
  };
  table: {
    buildListQuantities: Map<string, number>;
    isProductLimitReached: boolean;
    productListReturnTo: string;
    products: ProductsResponse | null;
    productState: LoadState;
  };
  toolbar: {
    draft: QueryState;
    formError: string | null;
    hasActiveFilters: boolean;
    query: QueryState;
    selectedCategoryName: string;
    selectedVendorOptions: ProductVendorOption[];
    totalItems: number;
    vendorOptions: ProductVendorOption[];
  };
}) {
  return (
    <section className="results-panel" ref={panel.ref} aria-label="商品列表">
      <ProductToolbar
        draft={toolbar.draft}
        formError={toolbar.formError}
        hasActiveFilters={toolbar.hasActiveFilters}
        query={toolbar.query}
        selectedCategoryName={toolbar.selectedCategoryName}
        selectedVendorOptions={toolbar.selectedVendorOptions}
        totalItems={toolbar.totalItems}
        vendorOptions={toolbar.vendorOptions}
        onClearVendors={actions.toolbar.clearVendors}
        onDraftChange={actions.toolbar.draftChange}
        onPageSizeChange={actions.toolbar.pageSizeChange}
        onResetFilters={actions.toolbar.resetFilters}
        onSortChange={actions.toolbar.sortChange}
        onStatusChange={actions.toolbar.statusChange}
        onToggleVendor={actions.toolbar.toggleVendor}
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
        page={pagination.page}
        pageJumpValue={pagination.pageJumpValue}
        productState={pagination.productState}
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
