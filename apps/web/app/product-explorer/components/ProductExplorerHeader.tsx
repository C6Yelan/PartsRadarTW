"use client";
// apps/web/app/product-explorer/components/ProductExplorerHeader.tsx

import Link from "next/link";
import type { FormEvent, MouseEvent } from "react";
import DiscordTopbarLink from "../../DiscordTopbarLink";
import { formatDateTime } from "../formatting";
import type { ProductsResponse, QueryState } from "../types";

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
  onTextFiltersSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-brand-area">
        <Link className="brand-lockup" href="/" onClick={onReturnHome}>
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>
        <DiscordTopbarLink />
      </div>

      <form className="topbar-search" onSubmit={onTextFiltersSubmit}>
        <label className="sr-only" htmlFor="global-search">
          搜尋商品名稱
        </label>
        <span className="search-glyph" aria-hidden="true" />
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
          />
        ) : null}
        <button className="control-button primary" type="submit">
          搜尋
        </button>
      </form>

      <div className="topbar-meta">
        <span>資料最近更新：{formatDateTime(products?.meta.lastSuccessAt, "尚無資料")}</span>
      </div>
    </header>
  );
}
