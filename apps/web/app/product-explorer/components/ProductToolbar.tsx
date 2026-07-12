// apps/web/app/product-explorer/components/ProductToolbar.tsx
// 呈現商品探索結果上方的篩選、排序、每頁數量與重設控制列。

"use client";

import { useEffect, useState } from "react";
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
import { VendorFilter } from "./VendorFilter";
import { AdvancedFilter } from "./AdvancedFilter";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selectedFilterCount =
    query.facets.length +
    query.vendors.length +
    Number(Boolean(query.minPrice)) +
    Number(Boolean(query.maxPrice)) +
    Number(query.status !== DEFAULT_QUERY.status);

  useEffect(() => {
    if (!filtersOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [filtersOpen]);

  return (
    <div className="results-toolbar">
      <div className="results-heading-row">
        <div className="results-title">
          <h1>搜尋結果</h1>
          <span>{formatInteger(totalItems)} 筆商品</span>
        </div>
        <div className="results-heading-actions">
          <button
            aria-expanded={filtersOpen}
            className={filtersOpen ? "results-filter-button is-active" : "results-filter-button"}
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            篩選{selectedFilterCount > 0 ? `（${selectedFilterCount}）` : ""}
          </button>
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
      {filtersOpen ? (
        <button
          aria-label="關閉篩選"
          className="filter-drawer-backdrop"
          type="button"
          onClick={() => setFiltersOpen(false)}
        />
      ) : null}
      <div className={filtersOpen ? "filter-drawer is-open" : "filter-drawer"}>
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
            <button className="filter-reset-item" type="button" onClick={onResetFilters}>
              重設所有篩選
            </button>
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
