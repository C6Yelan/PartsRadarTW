// apps/web/app/product-explorer/actions/use-product-explorer-actions.ts
// 集中商品探索頁的查詢、篩選、分頁與 category route 連結處理。

import { type SyntheticEvent, useEffect, useState } from "react";
import type { CategorySlug } from "../../category-slugs";
import {
  DEFAULT_QUERY,
  isNonNegativeInteger,
  normalizeFacetValues,
  normalizeVendorValues,
  toUrl,
  validatePriceRange,
} from "../query-state";
import type { ProductVendorOption, QueryState } from "../types";

const TOUCH_INPUT_MEDIA_QUERY = "(pointer: coarse)";

interface CategoryScopedFilters {
  vendors: string[];
  facets: string[];
}

type CategoryFilterMemory = Map<CategorySlug, CategoryScopedFilters>;
const categoryFilterMemory: CategoryFilterMemory = new Map();

// 建立商品探索頁 UI 事件 handler，負責把使用者操作轉成 query / draft 更新。
export function useProductExplorerActions({
  category,
  commitQuery,
  draft,
  isReady,
  query,
  schedulePageScroll,
  setDraft,
  setFormError,
  totalPages,
  vendorOptions,
}: {
  category: CategorySlug | null;
  commitQuery: (
    nextQuery: QueryState,
    options?: { draftQuery?: QueryState; replace?: boolean },
  ) => void;
  draft: QueryState;
  isReady: boolean;
  query: QueryState;
  schedulePageScroll: (page: number) => void;
  setDraft: (draft: QueryState) => void;
  setFormError: (message: string | null) => void;
  totalPages: number;
  vendorOptions: ProductVendorOption[];
}) {
  const [pageJumpValue, setPageJumpValue] = useState("");

  useEffect(() => {
    if (!isReady) {
      return;
    }

    rememberCategoryFilters(categoryFilterMemory, category, query.vendors, query.facets);
  }, [category, isReady, query.facets, query.vendors]);

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
    rememberCategoryFilters(
      categoryFilterMemory,
      category,
      DEFAULT_QUERY.vendors,
      DEFAULT_QUERY.facets,
    );

    const resetQuery = {
      ...query,
      minPrice: DEFAULT_QUERY.minPrice,
      maxPrice: DEFAULT_QUERY.maxPrice,
      status: DEFAULT_QUERY.status,
      vendors: DEFAULT_QUERY.vendors,
      facets: DEFAULT_QUERY.facets,
      page: 1,
    };

    commitQuery(resetQuery, {
      draftQuery: {
        ...resetQuery,
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

  function getCategoryHref(nextCategory: CategorySlug) {
    const rememberedFilters = categoryFilterMemory.get(nextCategory);
    const nextQuery = {
      ...query,
      vendors: normalizeVendorValues([...(rememberedFilters?.vendors ?? [])], nextCategory),
      facets: normalizeFacetValues([...(rememberedFilters?.facets ?? [])], nextCategory),
      page: 1,
    };

    return toUrl(nextCategory, nextQuery);
  }

  function toggleFacetFilter(tag: string) {
    const nextFacets = query.facets.includes(tag)
      ? query.facets.filter((facet) => facet !== tag)
      : [...query.facets, tag];

    updateQuery({
      facets: normalizeFacetValues(nextFacets, category),
    });
  }

  function removeFacetGroup(tags: readonly string[]) {
    const removedTags = new Set(tags);

    updateQuery({
      facets: normalizeFacetValues(
        query.facets.filter((tag) => !removedTags.has(tag)),
        category,
      ),
    });
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
    getCategoryHref,
    pageJumpValue,
    removeFacetGroup,
    resetFilters,
    setPageJumpValue,
    toggleFacetFilter,
    toggleVendorFilter,
    updateQuery,
    updateSearchDraft,
  };
}

function rememberCategoryFilters(
  memory: CategoryFilterMemory,
  category: CategorySlug | null,
  vendors: string[],
  facets: string[],
) {
  if (!category) {
    return;
  }

  memory.set(category, {
    vendors: [...vendors],
    facets: [...facets],
  });
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
