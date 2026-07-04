"use client";
// apps/web/app/product-explorer/use-product-build-list-actions.ts

import { toBuildListProduct } from "../build-list/model";
import { useBuildList } from "../build-list/use-build-list";
import type { ProductListItem } from "./types";

export function useProductBuildListActions() {
  const {
    addBuildListProduct,
    quantityByProductId,
    removeBuildListItem,
    summary,
    setBuildListItemQuantity,
  } = useBuildList();

  function addProductToBuildList(product: ProductListItem) {
    addBuildListProduct(toBuildListProduct(product));
  }

  function decreaseBuildListItemQuantity(product: ProductListItem) {
    const currentQuantity = quantityByProductId.get(product.id) ?? 0;

    if (currentQuantity <= 1) {
      removeBuildListItem(product.id);
      return;
    }

    setBuildListItemQuantity(product.id, currentQuantity - 1);
  }

  return {
    quantities: quantityByProductId,
    summary,
    addProductToBuildList,
    decreaseBuildListItemQuantity,
  };
}
