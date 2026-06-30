"use client";
// apps/web/app/product-explorer/ProductExplorer.tsx

import Link from "next/link";
import { type FormEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import FloatingBuildListLink from "../build-list/FloatingBuildListLink";
import { toBuildListProduct } from "../build-list/model";
import { useBuildList } from "../build-list/use-build-list";
import SiteDisclaimer from "../site-disclaimer";
import { Pagination } from "./components/Pagination";
import { ProductFilters } from "./components/ProductFilters";
import { ProductTable } from "./components/ProductTable";
import { ProductToolbar } from "./components/ProductToolbar";
import { formatDateTime } from "./formatting";
import {
  useCategories,
  usePendingPageScroll,
  useProductExplorerQuery,
  useProducts,
  useResponsiveFiltersOpen,
} from "./hooks";
import {
  DEFAULT_QUERY,
  getFallbackCategoryIgrp,
  getVisiblePages,
  isNonNegativeInteger,
  toUrl,
  validatePriceRange,
} from "./query-state";
import type { ProductListItem, QueryState } from "./types";

const TOUCH_INPUT_MEDIA_QUERY = "(pointer: coarse)";

export default function ProductExplorer() {
  const { isReady, query, draft, formError, setDraft, setFormError, commitQuery } =
    useProductExplorerQuery();
  const { categories, categoryState } = useCategories();
  const { products, productState } = useProducts(isReady, query);
  const { filtersOpen, keepDesktopFiltersOpen, syncFiltersOpenFromToggle } =
    useResponsiveFiltersOpen();
  const { resultsPanelRef, schedulePageScroll } = usePendingPageScroll(productState, products);
  const {
    addBuildListProduct,
    quantityByProductId,
    removeBuildListItem,
    summary,
    setBuildListItemQuantity,
  } = useBuildList();
  const [pageJumpValue, setPageJumpValue] = useState("");

  const selectedCategoryName = useMemo(() => {
    if (!query.igrp) {
      return "選擇分類";
    }

    return (
      categories.find((category) => String(category.igrp) === query.igrp)?.displayName ??
      `IGrp ${query.igrp}`
    );
  }, [categories, query.igrp]);

  const totalItems = products?.pagination.totalItems ?? 0;
  const totalPages = products?.pagination.totalPages ?? 0;
  const visiblePages = getVisiblePages(query.page, totalPages);
  const shouldShowPageJump = totalPages > 10;
  const productListReturnTo = toUrl(query);
  const vendorOptions =
    productState === "ready" && query.igrp ? (products?.meta.vendors ?? []) : [];
  const selectedVendorOptions = useMemo(
    () => vendorOptions.filter((option) => query.vendors.includes(option.slug)),
    [query.vendors, vendorOptions],
  );
  const hasActiveFilters =
    query.q !== DEFAULT_QUERY.q ||
    query.minPrice !== DEFAULT_QUERY.minPrice ||
    query.maxPrice !== DEFAULT_QUERY.maxPrice ||
    query.status !== DEFAULT_QUERY.status ||
    query.vendors.length > 0;

  useEffect(() => {
    if (!isReady || categoryState !== "ready" || categories.length === 0) {
      return;
    }

    const categoryIgrps = new Set(categories.map((category) => String(category.igrp)));
    if (query.igrp && categoryIgrps.has(query.igrp)) {
      return;
    }

    commitQuery(
      {
        ...query,
        igrp: String(categories[0].igrp),
        vendors: DEFAULT_QUERY.vendors,
        page: 1,
      },
      {
        replace: true,
      },
    );
  }, [categories, categoryState, commitQuery, isReady, query]);

  function updateQuery(partial: Partial<QueryState>) {
    commitQuery({
      ...query,
      ...partial,
      page: partial.page ?? 1,
    });
  }

  function goToPage(page: number) {
    if (page === query.page) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    schedulePageScroll(page);
    updateQuery({ page });
  }

  function applyTextFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validatePriceRange(draft.minPrice, draft.maxPrice);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    blurActiveElementOnTouchInput();

    commitQuery({
      ...query,
      q: draft.q.trim().slice(0, 100),
      minPrice: draft.minPrice.trim(),
      maxPrice: draft.maxPrice.trim(),
      page: 1,
    });
  }

  function updateSearchDraft(value: string) {
    setDraft({ ...draft, q: value });

    if (value === "" && query.q !== "") {
      commitQuery({
        ...query,
        q: DEFAULT_QUERY.q,
        page: 1,
      });
    }
  }

  function clearSearchDraft() {
    updateSearchDraft(DEFAULT_QUERY.q);
    blurActiveElementOnTouchInput();
  }

  function resetFilters() {
    commitQuery({
      ...query,
      q: DEFAULT_QUERY.q,
      minPrice: DEFAULT_QUERY.minPrice,
      maxPrice: DEFAULT_QUERY.maxPrice,
      status: DEFAULT_QUERY.status,
      vendors: DEFAULT_QUERY.vendors,
      page: 1,
    });
  }

  function returnHome(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    const homeQuery = {
      ...DEFAULT_QUERY,
      igrp: getFallbackCategoryIgrp(categories, query.igrp),
    };

    commitQuery(homeQuery, {
      draftQuery: {
        ...homeQuery,
        q: draft.q,
      },
    });
  }

  function jumpToPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedValue = pageJumpValue.trim();
    if (!isNonNegativeInteger(normalizedValue)) {
      return;
    }

    const requestedPage = Number(normalizedValue);
    if (requestedPage < 1) {
      return;
    }

    goToPage(Math.min(requestedPage, Math.max(1, totalPages)));
    setPageJumpValue("");
  }

  function updateCategoryFilter(igrp: string) {
    updateQuery({ igrp, vendors: DEFAULT_QUERY.vendors });
  }

  function blurActiveElementOnTouchInput() {
    if (!window.matchMedia(TOUCH_INPUT_MEDIA_QUERY).matches) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function toggleVendorFilter(vendor: string) {
    const selectedVendors = new Set(query.vendors);

    if (selectedVendors.has(vendor)) {
      selectedVendors.delete(vendor);
    } else {
      selectedVendors.add(vendor);
    }

    const nextVendors = vendorOptions
      .map((option) => option.slug)
      .filter((value) => selectedVendors.has(value));

    updateQuery({ vendors: nextVendors });
  }

  function addProductToBuildList(product: ProductListItem) {
    addBuildListProduct(toBuildListProduct(product));
  }

  function decreaseBuildListItemQuantity(productId: string) {
    const currentQuantity = quantityByProductId.get(productId) ?? 0;

    if (currentQuantity <= 1) {
      removeBuildListItem(productId);
      return;
    }

    setBuildListItemQuantity(productId, currentQuantity - 1);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand-lockup" href="/" onClick={returnHome}>
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>

        <form className="topbar-search" onSubmit={applyTextFilters}>
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
            onChange={(event) => updateSearchDraft(event.target.value)}
          />
          {draft.q ? (
            <button
              aria-label="清除搜尋字詞"
              className="search-clear-button"
              type="button"
              onClick={clearSearchDraft}
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

      <main className="dashboard-shell">
        <div className="workspace-grid">
          <ProductFilters
            categories={categories}
            categoryState={categoryState}
            filtersOpen={filtersOpen}
            selectedIgrp={query.igrp}
            onCategoryChange={updateCategoryFilter}
            onKeepDesktopOpen={keepDesktopFiltersOpen}
            onToggleOpen={syncFiltersOpenFromToggle}
          />

          <section className="results-panel" ref={resultsPanelRef} aria-label="商品列表">
            <ProductToolbar
              draft={draft}
              formError={formError}
              hasActiveFilters={hasActiveFilters}
              query={query}
              selectedCategoryName={selectedCategoryName}
              selectedVendorOptions={selectedVendorOptions}
              totalItems={totalItems}
              vendorOptions={vendorOptions}
              onClearVendors={() => updateQuery({ vendors: DEFAULT_QUERY.vendors })}
              onDraftChange={setDraft}
              onPageSizeChange={(pageSize) => updateQuery({ pageSize })}
              onResetFilters={resetFilters}
              onSortChange={(sort) => updateQuery({ sort })}
              onStatusChange={(status) => updateQuery({ status })}
              onToggleVendor={toggleVendorFilter}
            />

            <ProductTable
              buildListQuantities={quantityByProductId}
              productListReturnTo={productListReturnTo}
              products={products}
              productState={productState}
              onAddToBuildList={addProductToBuildList}
              onDecreaseBuildListQuantity={(product) => decreaseBuildListItemQuantity(product.id)}
            />

            <Pagination
              page={query.page}
              pageJumpValue={pageJumpValue}
              productState={productState}
              shouldShowPageJump={shouldShowPageJump}
              totalPages={totalPages}
              visiblePages={visiblePages}
              onGoToPage={goToPage}
              onJumpSubmit={jumpToPage}
              onPageJumpValueChange={setPageJumpValue}
            />
          </section>
        </div>
      </main>
      <section className="discord-home-section" aria-labelledby="discord-home-title">
        <div className="discord-home-copy">
          <span className="eyebrow">Discord 通知</span>
          <h2 id="discord-home-title">追蹤目標價與個人價格報告</h2>
          <p>
            邀請 PartsRadarTW bot 後，可在 Discord 使用 <code>/watch</code> 追蹤商品目標價，或用{" "}
            <code>/price-report settings</code> 訂閱個人價格報告。
          </p>
        </div>
        <Link className="control-button primary discord-home-link" href="/discord">
          了解 Discord 通知
        </Link>
      </section>
      <FloatingBuildListLink summary={summary} />
      <SiteDisclaimer />
    </div>
  );
}
