"use client";
// apps/web/app/products/[id]/detail/use-product-detail-view-model.ts

import { useEffect, useState } from "react";
import { BUILD_LIST_MAX_QUANTITY, toBuildListProduct } from "../../../build-list/model";
import { useBuildList } from "../../../build-list/use-build-list";
import type { ProductShareStatus } from "../product-share";
import {
  createProductShareUrl,
  formatProductShareStatus,
  shareProductUrl,
  toVisibleProductShareStatus,
} from "../product-share";
import { formatProductPrice } from "./format";
import { usePriceHistoryLoader } from "./use-price-history-loader";
import { useProductDetail } from "./use-product-detail";

export function useProductDetailViewModel({
  productId,
  returnHref,
}: {
  productId: string;
  returnHref: string;
}) {
  const { product, state } = useProductDetail(productId);
  const { historyRange, historyState, priceHistory, setHistoryRange } = usePriceHistoryLoader({
    product,
    productId,
  });
  const [imageError, setImageError] = useState(false);
  const [shareStatus, setShareStatus] = useState<ProductShareStatus>(null);
  const {
    addBuildListProduct,
    quantityByProductId,
    removeBuildListItem,
    summary,
    setBuildListItemQuantity,
  } = useBuildList();

  const currentBuildListQuantity = product ? (quantityByProductId.get(product.id) ?? 0) : 0;
  const canIncreaseBuildListQuantity = currentBuildListQuantity < BUILD_LIST_MAX_QUANTITY;
  const returnLabel = returnHref.startsWith("/build-list") ? "返回配單" : "返回查詢";

  useEffect(() => {
    if (product) {
      return;
    }

    setImageError(false);
    setShareStatus(null);
  }, [product]);

  function addCurrentProductToBuildList() {
    if (!product) {
      return;
    }

    addBuildListProduct(toBuildListProduct(product));
  }

  function decreaseCurrentProductBuildListQuantity() {
    if (!product || currentBuildListQuantity <= 0) {
      return;
    }

    if (currentBuildListQuantity === 1) {
      removeBuildListItem(product.id);
      return;
    }

    setBuildListItemQuantity(product.id, currentBuildListQuantity - 1);
  }

  async function shareCurrentProduct() {
    if (!product) {
      return;
    }

    const result = await shareProductUrl({
      navigatorRef: navigator,
      title: product.name,
      text: `${product.name} - ${formatProductPrice(product.price.amount)}`,
      url: createProductShareUrl(window.location.origin, product.id),
    });

    setShareStatus(toVisibleProductShareStatus(result));
  }

  return {
    productLoad: {
      product,
      state,
    },
    priceHistory: {
      history: priceHistory,
      selectedRange: historyRange,
      state: historyState,
      onRangeChange: setHistoryRange,
    },
    buildList: {
      canIncreaseBuildListQuantity,
      currentBuildListQuantity,
      summary,
      addCurrentProductToBuildList,
      decreaseCurrentProductBuildListQuantity,
    },
    media: {
      imageError,
      onImageError: () => setImageError(true),
    },
    navigation: {
      returnHref,
      returnLabel,
    },
    share: {
      statusMessage: formatProductShareStatus(shareStatus),
      shareCurrentProduct,
    },
  };
}
