"use client";
// apps/web/app/product-explorer/use-product-explorer-view-model.ts
// 組裝商品探索頁的資料、查詢狀態、配單狀態與子元件 action 分組。

import { useEffect, useMemo } from "react";
import { useProductExplorerActions } from "./actions/use-product-explorer-actions";
import {
  useCategories,
  usePendingPageScroll,
  useProductExplorerQuery,
  useProducts,
  useResponsiveFiltersOpen,
} from "./hooks";
import { DEFAULT_QUERY, getVisiblePages, toUrl } from "./query-state";
import { useProductBuildListActions } from "./use-product-build-list-actions";

// 建立 ProductExplorer 使用的 view model，將 hook 狀態整理成 header、filters、results 與 buildList 區塊。
export function useProductExplorerViewModel() {
  const { isReady, query, draft, formError, setDraft, setFormError, commitQuery } =
    useProductExplorerQuery();
  const { categories, categoryState } = useCategories();
  const { products, productState } = useProducts(isReady, query);
  const { filtersOpen, keepDesktopFiltersOpen, syncFiltersOpenFromToggle } =
    useResponsiveFiltersOpen();
  const { resultsPanelRef, schedulePageScroll } = usePendingPageScroll(productState, products);
  const buildList = useProductBuildListActions();

  useEffect(() => {
    if (!isReady || categoryState !== "ready" || categories.length === 0) {
      return;
    }

    const categorySlugs = new Set<string>(categories.map((category) => category.slug));
    if (query.category && categorySlugs.has(query.category)) {
      return;
    }

    commitQuery(
      {
        ...query,
        category: categories[0].slug,
        vendors: DEFAULT_QUERY.vendors,
        page: 1,
      },
      {
        replace: true,
      },
    );
  }, [categories, categoryState, commitQuery, isReady, query]);

  const selectedCategoryName = useMemo(() => {
    if (!query.category) {
      return "選擇分類";
    }

    return (
      categories.find((category) => category.slug === query.category)?.displayName ?? query.category
    );
  }, [categories, query.category]);

  const totalItems = products?.pagination.totalItems ?? 0;
  const totalPages = products?.pagination.totalPages ?? 0;
  const visiblePages = getVisiblePages(query.page, totalPages);
  const shouldShowPageJump = totalPages > 10;
  const productListReturnTo = toUrl(query);
  const vendorOptions =
    productState === "ready" && query.category ? (products?.meta.vendors ?? []) : [];
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
  const actions = useProductExplorerActions({
    categories,
    commitQuery,
    draft,
    query,
    schedulePageScroll,
    setDraft,
    setFormError,
    totalPages,
    vendorOptions,
  });

  return {
    header: {
      draft,
      products,
      actions: {
        clearSearchDraft: actions.clearSearchDraft,
        returnHome: actions.returnHome,
        updateSearchDraft: actions.updateSearchDraft,
        applyTextFilters: actions.applyTextFilters,
      },
    },
    filters: {
      categories,
      categoryState,
      filtersOpen,
      selectedCategory: query.category,
      actions: {
        updateCategoryFilter: actions.updateCategoryFilter,
        keepDesktopFiltersOpen,
        syncFiltersOpenFromToggle,
      },
    },
    results: {
      panel: {
        ref: resultsPanelRef,
      },
      toolbar: {
        draft,
        formError,
        hasActiveFilters,
        query,
        selectedCategoryName,
        selectedVendorOptions,
        totalItems,
        vendorOptions,
      },
      table: {
        buildListQuantities: buildList.quantities,
        productListReturnTo,
        products,
        productState,
      },
      pagination: {
        page: query.page,
        pageJumpValue: actions.pageJumpValue,
        productState,
        shouldShowPageJump,
        totalPages,
        visiblePages,
      },
      actions: {
        toolbar: {
          clearVendors: () => actions.updateQuery({ vendors: DEFAULT_QUERY.vendors }),
          draftChange: setDraft,
          pageSizeChange: (pageSize: number) => actions.updateQuery({ pageSize }),
          resetFilters: actions.resetFilters,
          sortChange: (sort: typeof query.sort) => actions.updateQuery({ sort }),
          statusChange: (status: typeof query.status) => actions.updateQuery({ status }),
          toggleVendor: actions.toggleVendorFilter,
        },
        table: {
          addToBuildList: buildList.addProductToBuildList,
          decreaseBuildListQuantity: buildList.decreaseBuildListItemQuantity,
        },
        pagination: {
          goToPage: actions.goToPage,
          jumpSubmit: actions.jumpToPage,
          pageJumpValueChange: actions.setPageJumpValue,
        },
      },
    },
    buildList: {
      summary: buildList.summary,
    },
  };
}
