"use client";
// apps/web/app/product-explorer/components/ProductExplorerHeader.tsx
// 呈現商品探索頁頂部品牌區、Discord 入口、全域搜尋與資料更新時間。

import Link from "next/link";
import type { MouseEvent, SyntheticEvent } from "react";
import { BrandMarkIcon, ClearIcon, SearchIcon } from "../../_shared/icons";
import { formatTaipeiDateTime } from "../../_shared/time";
import DiscordTopbarLink from "../../DiscordTopbarLink";
import PriceReportTopbarLink from "../../PriceReportTopbarLink";
import type { ProductsResponse, QueryState } from "../types";

// 組裝首頁頂部列，將搜尋 draft 與提交 / 清除 / 返回首頁事件交給上層控制。
export function ProductExplorerHeader({
  draft,
  products,
  onClearSearchDraft,
  onReturnHome,
  onSearchDraftChange,
  onTextFiltersSubmit,
}: {
  draft: QueryState;
  products: ProductsResponse | null;
  onClearSearchDraft: () => void;
  onReturnHome: (event: MouseEvent<HTMLAnchorElement>) => void;
  onSearchDraftChange: (value: string) => void;
  onTextFiltersSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-brand-area">
        <Link className="brand-lockup" href="/" onClick={onReturnHome}>
          <BrandMarkIcon />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>
        <PriceReportTopbarLink />
        <DiscordTopbarLink />
      </div>

      <form className="topbar-search" onSubmit={onTextFiltersSubmit}>
        <label className="sr-only" htmlFor="global-search">
          搜尋商品名稱
        </label>
        <SearchIcon className="search-glyph" />
        <input
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
        <span>資料最近更新：{formatTaipeiDateTime(products?.meta.lastSuccessAt, "尚無資料")}</span>
      </div>
    </header>
  );
}
