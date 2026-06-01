import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchCategories, fetchProducts } from "./api";
import {
  DEFAULT_QUERY,
  normalizeVendorValues,
  PAGE_SIZE_OPTIONS,
  readQueryFromLocation,
  toUrl,
  validatePriceRange,
} from "./query-state";
import type { CategoryItem, LoadState, ProductsResponse, QueryState } from "./types";

const DESKTOP_FILTER_MEDIA_QUERY_VALUE = "(min-width: 761px)";

export function useProductExplorerQuery() {
  const [isReady, setIsReady] = useState(false);
  const [query, setQuery] = useState<QueryState>(DEFAULT_QUERY);
  const [draft, setDraft] = useState<QueryState>(DEFAULT_QUERY);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const initialQuery = readQueryFromLocation();
    setQuery(initialQuery);
    setDraft(initialQuery);
    setIsReady(true);

    const handlePopState = () => {
      const nextQuery = readQueryFromLocation();
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
        vendors: normalizeVendorValues(nextQuery.vendors, nextQuery.igrp),
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

export function useCategories() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryState, setCategoryState] = useState<LoadState>("idle");

  useEffect(() => {
    const controller = new AbortController();
    setCategoryState("loading");

    fetchCategories(controller.signal)
      .then((items) => {
        setCategories(items);
        setCategoryState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCategoryState("error");
      });

    return () => controller.abort();
  }, []);

  return {
    categories,
    categoryState,
  };
}

export function useProducts(isReady: boolean, query: QueryState) {
  const [products, setProducts] = useState<ProductsResponse | null>(null);
  const [productState, setProductState] = useState<LoadState>("idle");

  useEffect(() => {
    if (!isReady || !query.igrp) {
      return;
    }

    const controller = new AbortController();
    setProductState("loading");

    fetchProducts(query, controller.signal)
      .then((body) => {
        setProducts(body);
        setProductState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setProductState("error");
      });

    return () => controller.abort();
  }, [isReady, query]);

  return {
    products,
    productState,
  };
}

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

    if (productState === "error") {
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
