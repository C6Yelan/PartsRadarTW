"use client";
// apps/web/app/product-explorer/use-product-build-list-actions.ts
// 將商品探索頁列表商品接到配單 hook，提供加入與減少數量的頁面動作。

import { toBuildListProduct } from "../build-list/model";
import { useBuildList } from "../build-list/use-build-list";
import type { ProductListItem } from "./types";

// 建立商品探索頁使用的配單操作，負責把 ProductListItem 轉成配單商品快照。
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
