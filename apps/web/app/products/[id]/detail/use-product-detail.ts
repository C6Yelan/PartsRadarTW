// apps/web/app/products/[id]/detail/use-product-detail.ts
// 管理商品詳細頁主資料 API 載入，並把 HTTP 結果轉成頁面載入狀態。

import { useEffect, useState } from "react";
import { isRateLimitedApiError, toApiRequestError } from "../../../_shared/api-client";
import type { ProductDetailBody, ProductDetailLoadState } from "./types";

// 依 product id 載入商品詳細資料；404 顯示 not-found，其餘失敗交給頁面錯誤狀態。
export function useProductDetail(productId: string) {
  const [state, setState] = useState<ProductDetailLoadState>("idle");
  const [product, setProduct] = useState<ProductDetailBody | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setProduct(null);

    async function loadProductDetail() {
      try {
        const nextProduct = await fetchProductDetail(productId, controller.signal);

        if (!nextProduct) {
          setState("not-found");
          return;
        }

        setProduct(nextProduct);
        setState("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState(isRateLimitedApiError(error) ? "rate_limited" : "error");
      }
    }

    void loadProductDetail();

    return () => controller.abort();
  }, [productId]);

  return { product, state };
}

export async function fetchProductDetail(
  productId: string,
  signal: AbortSignal,
): Promise<ProductDetailBody | null> {
  const response = await fetch(`/api/products/${productId}`, { signal });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load product.");
  }

  return (await response.json()) as ProductDetailBody;
}
