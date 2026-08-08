"use client";
// apps/web/app/product-explorer/components/ProductExplorerHeader.tsx
// 呈現商品探索頁頂部品牌區、Discord 入口、全域搜尋與資料更新時間。

import type { SyntheticEvent } from "react";
import { ClearIcon, SearchIcon } from "../../_shared/icons";
import { formatTaipeiDateTime } from "../../_shared/time";
import TopbarBrandNavigation from "../../TopbarBrandNavigation";
import type { LoadState, ProductsResponse, QueryState } from "../types";

// 組裝商品探索頂部列，將搜尋 draft 與提交 / 清除事件交給上層控制。
export function ProductExplorerHeader({
  draft,
  products,
  productState,
  onClearSearchDraft,
  onSearchDraftChange,
  onTextFiltersSubmit,
}: {
  draft: QueryState;
  products: ProductsResponse | null;
  productState: LoadState;
  onClearSearchDraft: () => void;
  onSearchDraftChange: (value: string) => void;
  onTextFiltersSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  const lastUpdatedLabel = products
    ? formatTaipeiDateTime(products.meta.lastSuccessAt, "尚無資料")
    : productState === "error" || productState === "rate_limited"
      ? "暫時無法取得"
      : "載入中";

  return (
    <header className="topbar">
      <TopbarBrandNavigation />

      <form className="topbar-search" onSubmit={onTextFiltersSubmit}>
        <label className="sr-only" htmlFor="global-search">
          搜尋商品名稱
        </label>
        <SearchIcon className="search-glyph" />
        <input
          autoComplete="off"
          id="global-search"
          maxLength={100}
          placeholder="搜尋商品名稱、型號..."
          type="search"
          value={draft.q}
          onChange={(event) => onSearchDraftChange(event.target.value)}
        />
        {draft.q ? (
          <button
            aria-label="清除搜尋字詞"
            className="search-clear-button"
            type="button"
            onClick={onClearSearchDraft}
          >
            <ClearIcon />
          </button>
        ) : null}
        <button className="control-button primary" type="submit">
          搜尋
        </button>
      </form>

      <div className="topbar-meta">
        <span>資料最近更新：{lastUpdatedLabel}</span>
      </div>
    </header>
  );
}
