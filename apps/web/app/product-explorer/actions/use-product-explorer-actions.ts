// apps/web/app/product-explorer/actions/use-product-explorer-actions.ts
// 集中商品探索頁的查詢、篩選、分頁與返回首頁互動處理。

import { type MouseEvent, type SyntheticEvent, useState } from "react";
import {
  DEFAULT_QUERY,
  getFallbackCategorySlug,
  isNonNegativeInteger,
  validatePriceRange,
} from "../query-state";
import type { CategoryItem, ProductVendorOption, QueryState } from "../types";

const TOUCH_INPUT_MEDIA_QUERY = "(pointer: coarse)";

// 建立商品探索頁 UI 事件 handler，負責把使用者操作轉成 query / draft 更新。
export function useProductExplorerActions({
  categories,
  commitQuery,
  draft,
  query,
  schedulePageScroll,
  setDraft,
  setFormError,
  totalPages,
  vendorOptions,
}: {
  categories: CategoryItem[];
  commitQuery: (
    nextQuery: QueryState,
    options?: { draftQuery?: QueryState; replace?: boolean },
  ) => void;
  draft: QueryState;
  query: QueryState;
  schedulePageScroll: (page: number) => void;
  setDraft: (draft: QueryState) => void;
  setFormError: (message: string | null) => void;
  totalPages: number;
  vendorOptions: ProductVendorOption[];
}) {
  const [pageJumpValue, setPageJumpValue] = useState("");

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

  function applyTextFilters(event: SyntheticEvent<HTMLFormElement>) {
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
      category: getFallbackCategorySlug(categories, query.category),
    };

    commitQuery(homeQuery, {
      draftQuery: {
        ...homeQuery,
        q: draft.q,
      },
    });
  }

  function jumpToPage(event: SyntheticEvent<HTMLFormElement>) {
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

  function updateCategoryFilter(category: string) {
    updateQuery({ category, vendors: DEFAULT_QUERY.vendors });
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

  return {
    applyTextFilters,
    clearSearchDraft,
    goToPage,
    jumpToPage,
    pageJumpValue,
    resetFilters,
    returnHome,
    setPageJumpValue,
    toggleVendorFilter,
    updateCategoryFilter,
    updateQuery,
    updateSearchDraft,
  };
}

// 觸控裝置提交搜尋或清除搜尋後收起鍵盤，避免結果區被虛擬鍵盤遮住。
function blurActiveElementOnTouchInput() {
  if (!window.matchMedia(TOUCH_INPUT_MEDIA_QUERY).matches) {
    return;
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
