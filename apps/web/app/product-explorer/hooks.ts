// apps/web/app/product-explorer/hooks.ts
// 集中商品探索頁的 client-side UI hooks，管理 query、響應式篩選面板與分頁後捲動。

import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_QUERY,
  normalizeVendorValues,
  PAGE_SIZE_OPTIONS,
  readQueryFromLocation,
  toUrl,
  validatePriceRange,
} from "./query-state";
import type { LoadState, ProductsResponse, QueryState } from "./types";

// 對齊 CSS mobile breakpoint max-width: 760px，桌面端強制維持分類面板展開。
const DESKTOP_FILTER_MEDIA_QUERY_VALUE = "(min-width: 761px)";

// 管理商品探索頁 URL query、表單 draft、價格驗證與瀏覽器上一頁 / 下一頁同步。
export function useProductExplorerQuery() {
  const [isReady, setIsReady] = useState(false);
  const [query, setQuery] = useState<QueryState>(DEFAULT_QUERY);
  const [draft, setDraft] = useState<QueryState>(DEFAULT_QUERY);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const initialQuery = readCanonicalQueryFromLocation();
    setQuery(initialQuery);
    setDraft(initialQuery);
    setIsReady(true);

    const handlePopState = () => {
      const nextQuery = readCanonicalQueryFromLocation();
      setQuery(nextQuery);
      setDraft(nextQuery);
      setFormError(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const commitQuery = useCallback(
    (nextQuery: QueryState, options?: { draftQuery?: QueryState; replace?: boolean }) => {
      const normalizedQuery = {
        ...nextQuery,
        vendors: normalizeVendorValues(nextQuery.vendors, nextQuery.category),
        page: Math.max(1, nextQuery.page),
        pageSize: PAGE_SIZE_OPTIONS.includes(
          nextQuery.pageSize as (typeof PAGE_SIZE_OPTIONS)[number],
        )
          ? nextQuery.pageSize
          : DEFAULT_QUERY.pageSize,
      };
      const nextUrl = toUrl(normalizedQuery);

      if (options?.replace) {
        window.history.replaceState(null, "", nextUrl);
      } else {
        window.history.pushState(null, "", nextUrl);
      }
      setQuery(normalizedQuery);
      setDraft(options?.draftQuery ?? normalizedQuery);
      setFormError(null);
    },
    [],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const validationError = validatePriceRange(draft.minPrice, draft.maxPrice);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);

    const minPrice = draft.minPrice.trim();
    const maxPrice = draft.maxPrice.trim();
    if (minPrice === query.minPrice && maxPrice === query.maxPrice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      commitQuery({
        ...query,
        minPrice,
        maxPrice,
        page: 1,
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [commitQuery, draft.minPrice, draft.maxPrice, isReady, query]);

  return {
    isReady,
    query,
    draft,
    formError,
    setDraft,
    setFormError,
    commitQuery,
  };
}

function readCanonicalQueryFromLocation() {
  const query = readQueryFromLocation();
  const canonicalUrl = toUrl(query);
  const currentUrl = `${window.location.pathname}${window.location.search}`;

  if (currentUrl !== canonicalUrl) {
    window.history.replaceState(null, "", canonicalUrl);
  }

  return query;
}

// 控制分類篩選面板的響應式開合，桌面維持展開、手機允許使用者收合。
export function useResponsiveFiltersOpen() {
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_FILTER_MEDIA_QUERY_VALUE);
    const syncFiltersOpen = () => setFiltersOpen(mediaQuery.matches);

    syncFiltersOpen();
    mediaQuery.addEventListener("change", syncFiltersOpen);

    return () => mediaQuery.removeEventListener("change", syncFiltersOpen);
  }, []);

  function keepDesktopFiltersOpen(event: MouseEvent<HTMLElement>) {
    if (window.matchMedia(DESKTOP_FILTER_MEDIA_QUERY_VALUE).matches) {
      event.preventDefault();
    }
  }

  function syncFiltersOpenFromToggle(isOpen: boolean) {
    if (!isOpen && window.matchMedia(DESKTOP_FILTER_MEDIA_QUERY_VALUE).matches) {
      setFiltersOpen(true);
      return;
    }

    setFiltersOpen(isOpen);
  }

  return {
    filtersOpen,
    keepDesktopFiltersOpen,
    syncFiltersOpenFromToggle,
  };
}

// 在分頁載入完成或失敗後捲回商品結果區，避免使用者停留在舊頁面位置。
export function usePendingPageScroll(productState: LoadState, products: ProductsResponse | null) {
  const resultsPanelRef = useRef<HTMLElement | null>(null);
  const pendingPageScrollRef = useRef<number | null>(null);

  const scrollToResultsTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      resultsPanelRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    });
  }, []);

  useEffect(() => {
    const pendingPage = pendingPageScrollRef.current;
    if (pendingPage === null) {
      return;
    }

    if (productState === "ready" && products?.pagination.page === pendingPage) {
      pendingPageScrollRef.current = null;
      scrollToResultsTop();
      return;
    }

    if (productState === "error" || productState === "rate_limited") {
      pendingPageScrollRef.current = null;
      scrollToResultsTop();
    }
  }, [productState, products?.pagination.page, scrollToResultsTop]);

  return {
    resultsPanelRef,
    schedulePageScroll: (page: number) => {
      pendingPageScrollRef.current = page;
    },
  };
}
