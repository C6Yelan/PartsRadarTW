// apps/web/app/product-explorer/components/ProductToolbar.tsx
// 呈現商品探索結果上方的篩選、排序、每頁數量與重設控制列。

import type { ProductStatus, ProductSort, ProductVendorOption, QueryState } from "../types";
import { formatInteger } from "../formatting";
import {
  DEFAULT_QUERY,
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  toPriceDigits,
} from "../query-state";
import { VendorFilter } from "./VendorFilter";

interface ProductToolbarProps {
  draft: QueryState;
  formError: string | null;
  hasActiveFilters: boolean;
  query: QueryState;
  selectedCategoryName: string;
  selectedVendorOptions: ProductVendorOption[];
  totalItems: number;
  vendorOptions: ProductVendorOption[];
  onClearVendors: () => void;
  onDraftChange: (draft: QueryState) => void;
  onResetFilters: () => void;
  onSortChange: (sort: ProductSort) => void;
  onStatusChange: (status: ProductStatus) => void;
  onPageSizeChange: (pageSize: number) => void;
  onToggleVendor: (vendor: string) => void;
}

// 組裝結果工具列的可互動控制，將 query / draft 變更交由上層 actions 套用。
export function ProductToolbar({
  draft,
  formError,
  hasActiveFilters,
  query,
  selectedCategoryName,
  selectedVendorOptions,
  totalItems,
  vendorOptions,
  onClearVendors,
  onDraftChange,
  onResetFilters,
  onSortChange,
  onStatusChange,
  onPageSizeChange,
  onToggleVendor,
}: ProductToolbarProps) {
  return (
    <div className="results-toolbar">
      <div className="results-heading-row">
        <div className="results-title">
          <h1>搜尋結果</h1>
          <span>{formatInteger(totalItems)} 筆商品</span>
        </div>
        {hasActiveFilters ? (
          <button className="results-reset-button" type="button" onClick={onResetFilters}>
            重設
          </button>
        ) : null}
      </div>
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
          disabledLabel={query.igrp ? "無廠商資料" : "先選分類"}
          selectedCategoryName={selectedCategoryName}
          selectedOptions={selectedVendorOptions}
          selectedValues={query.vendors}
          onClear={onClearVendors}
          onToggle={onToggleVendor}
        />
        <label>
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
        <label>
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
      {formError ? (
        <p className="toolbar-error" role="alert">
          價格範圍錯誤：{formError}
        </p>
      ) : null}
    </div>
  );
}
