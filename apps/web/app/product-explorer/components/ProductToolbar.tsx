// apps/web/app/product-explorer/components/ProductToolbar.tsx
// 呈現商品探索結果上方的篩選、排序、每頁數量與重設控制列。

"use client";

import { formatInteger } from "../../_shared/formatting";
import {
  DEFAULT_QUERY,
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  toPriceDigits,
} from "../query-state";
import type {
  CategoryItem,
  ProductSort,
  ProductStatus,
  ProductVendorOption,
  QueryState,
  SelectedFacetChip,
} from "../types";
import { AdvancedFilter } from "./AdvancedFilter";
import { VendorFilter } from "./VendorFilter";

interface ProductToolbarProps {
  categories: CategoryItem[];
  draft: QueryState;
  formError: string | null;
  hasActiveFilters: boolean;
  query: QueryState;
  selectedCategoryName: string;
  selectedFacetChips: SelectedFacetChip[];
  selectedVendorOptions: ProductVendorOption[];
  totalItems: number;
  vendorOptions: ProductVendorOption[];
  onClearVendors: () => void;
  onDraftChange: (draft: QueryState) => void;
  onResetFilters: () => void;
  onSortChange: (sort: ProductSort) => void;
  onStatusChange: (status: ProductStatus) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRemoveFacet: (tag: string) => void;
  onToggleVendor: (vendor: string) => void;
  onToggleFacet: (tag: string) => void;
}

// 組裝結果工具列的可互動控制，將 query / draft 變更交由上層 actions 套用。
export function ProductToolbar({
  categories,
  draft,
  formError,
  hasActiveFilters,
  query,
  selectedCategoryName,
  selectedFacetChips,
  selectedVendorOptions,
  totalItems,
  vendorOptions,
  onClearVendors,
  onDraftChange,
  onResetFilters,
  onSortChange,
  onStatusChange,
  onPageSizeChange,
  onRemoveFacet,
  onToggleVendor,
  onToggleFacet,
}: ProductToolbarProps) {
  return (
    <div className="results-toolbar">
      <div className="results-heading-row">
        <div className="results-title">
          <h1>搜尋結果</h1>
          <span>{formatInteger(totalItems)} 筆商品</span>
        </div>
        <div className="results-heading-actions">
          <label className="results-compact-select">
            <span>排序</span>
            <select
              aria-label="排序"
              value={query.sort}
              onChange={(event) => onSortChange(event.target.value as ProductSort)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="results-compact-select is-page-size">
            <span>每頁</span>
            <select
              aria-label="每頁顯示"
              value={query.pageSize}
              onChange={(event) =>
                onPageSizeChange(Number(event.target.value) || DEFAULT_QUERY.pageSize)
              }
            >
              {PAGE_SIZE_OPTIONS.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="filter-drawer is-open">
        <div className="toolbar-controls">
          <div className="toolbar-price-filter">
            <span>價格</span>
            <div className="price-grid toolbar-price-grid">
              <input
                aria-label="最低價格"
                inputMode="numeric"
                placeholder="最低價格"
                type="text"
                value={draft.minPrice}
                onChange={(event) =>
                  onDraftChange({ ...draft, minPrice: toPriceDigits(event.target.value) })
                }
              />
              <input
                aria-label="最高價格"
                inputMode="numeric"
                placeholder="最高價格"
                type="text"
                value={draft.maxPrice}
                onChange={(event) =>
                  onDraftChange({ ...draft, maxPrice: toPriceDigits(event.target.value) })
                }
              />
            </div>
          </div>
          <div className="toolbar-status-filter">
            <span>狀態</span>
            <div className="segmented-control toolbar-segmented-control">
              {STATUS_OPTIONS.map((option) => (
                <button
                  aria-pressed={query.status === option.value}
                  className={query.status === option.value ? "is-active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => onStatusChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <VendorFilter
            options={vendorOptions}
            disabledLabel={query.category ? "無廠商資料" : "先選分類"}
            selectedCategoryName={selectedCategoryName}
            selectedOptions={selectedVendorOptions}
            selectedValues={query.vendors}
            onClear={onClearVendors}
            onToggle={onToggleVendor}
          />
          <AdvancedFilter
            categories={categories}
            selectedCategory={query.category}
            selectedFacets={query.facets}
            onToggle={onToggleFacet}
          />
          {hasActiveFilters ? (
            <div className="filter-reset-row">
              <button className="filter-reset-item" type="button" onClick={onResetFilters}>
                重設
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {selectedFacetChips.length > 0 ? (
        <fieldset className="active-filter-chips" aria-label="已選進階篩選">
          {selectedFacetChips.map((chip) => (
            <button
              aria-label={`移除篩選：${chip.label}`}
              className="active-filter-chip"
              key={chip.tag}
              type="button"
              onClick={() => onRemoveFacet(chip.tag)}
            >
              <span>{chip.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </fieldset>
      ) : null}
      {formError ? (
        <p className="toolbar-error" role="alert">
          價格範圍錯誤：{formError}
        </p>
      ) : null}
    </div>
  );
}
