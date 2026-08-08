"use client";
// apps/web/app/product-explorer/use-product-explorer-view-model.ts
// 組裝商品探索頁的資料、查詢狀態與子元件 action 分組。

import { useMemo } from "react";
import { getVisiblePages } from "../_shared/pagination";
import { useProductExplorerActions } from "./actions/use-product-explorer-actions";
import { useCategories } from "./data/use-categories";
import { useProducts } from "./data/use-products";
import { usePendingPageScroll, useProductExplorerQuery, useResponsiveFiltersOpen } from "./hooks";
import { DEFAULT_QUERY, toUrl } from "./query-state";
import type { ProductExplorerRouteState } from "./types";
import { useProductBuildListActions } from "./use-product-build-list-actions";

// 建立 ProductExplorer 使用的 view model，將 hook 狀態整理成 header、filters 與 results 區塊。
export function useProductExplorerViewModel({ category }: ProductExplorerRouteState) {
  const { isReady, query, draft, formError, setDraft, setFormError, commitQuery } =
    useProductExplorerQuery(category);
  const { categories, categoryState } = useCategories();
  const { products, productState, vendorOptions } = useProducts(isReady, category, query);
  const { filtersOpen, keepDesktopFiltersOpen, syncFiltersOpenFromToggle } =
    useResponsiveFiltersOpen();
  const { resultsPanelRef, schedulePageScroll } = usePendingPageScroll(productState, products);
  const buildList = useProductBuildListActions();

  const selectedFacetChips = useMemo(() => {
    const definitions = categories.find((item) => item.slug === category)?.facets ?? [];
    const selectedFacets = new Set(query.facets);

    return definitions.flatMap((definition) => {
      const selectedOptions = definition.options.filter((option) =>
        selectedFacets.has(`${definition.key}:${option.value}`),
      );

      return selectedOptions.length > 0
        ? [
            {
              key: definition.key,
              label: `${definition.label}：${selectedOptions.map((option) => option.label).join("、")}`,
              tags: selectedOptions.map((option) => `${definition.key}:${option.value}`),
            },
          ]
        : [];
    });
  }, [categories, category, query.facets]);

  const totalItems = products?.pagination.totalItems ?? 0;
  const totalPages = products?.pagination.totalPages ?? 0;
  const visiblePages = getVisiblePages(query.page, totalPages);
  const shouldShowPageJump = totalPages > 10;
  const productListReturnTo = toUrl(category, query);
  const selectedVendorOptions = useMemo(
    () => vendorOptions.filter((option) => query.vendors.includes(option.slug)),
    [query.vendors, vendorOptions],
  );
  const hasActiveFilters =
    query.minPrice !== DEFAULT_QUERY.minPrice ||
    query.maxPrice !== DEFAULT_QUERY.maxPrice ||
    query.status !== DEFAULT_QUERY.status ||
    query.facets.length > 0 ||
    query.vendors.length > 0;
  const actions = useProductExplorerActions({
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
  });

  return {
    header: {
      draft,
      products,
      actions: {
        clearSearchDraft: actions.clearSearchDraft,
        updateSearchDraft: actions.updateSearchDraft,
        applyTextFilters: actions.applyTextFilters,
      },
    },
    filters: {
      categories,
      categoryState,
      filtersOpen,
      selectedCategory: category,
      actions: {
        getCategoryHref: actions.getCategoryHref,
        keepDesktopFiltersOpen,
        syncFiltersOpenFromToggle,
      },
    },
    results: {
      panel: {
        ref: resultsPanelRef,
      },
      toolbar: {
        categories,
        draft,
        formError,
        hasActiveFilters,
        query,
        selectedCategory: category,
        selectedFacetChips,
        selectedVendorOptions,
        totalItems,
        vendorOptions,
      },
      table: {
        buildListQuantities: buildList.quantities,
        isProductLimitReached: buildList.isProductLimitReached,
        productListReturnTo,
        products,
        productState,
      },
      pagination: {
        isLoading: productState === "loading",
        page: query.page,
        pageJumpValue: actions.pageJumpValue,
        shouldShowPageJump,
        totalPages,
        visiblePages,
      },
      actions: {
        toolbar: {
          clearVendors: () => actions.updateQuery({ vendors: DEFAULT_QUERY.vendors }),
          draftChange: setDraft,
          pageSizeChange: (pageSize: number) => actions.updateQuery({ pageSize }),
          removeFacetGroup: actions.removeFacetGroup,
          resetFilters: actions.resetFilters,
          sortChange: (sort: typeof query.sort) => actions.updateQuery({ sort }),
          statusChange: (status: typeof query.status) => actions.updateQuery({ status }),
          toggleVendor: actions.toggleVendorFilter,
          toggleFacet: actions.toggleFacetFilter,
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
  };
}
