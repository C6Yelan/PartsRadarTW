// apps/web/app/product-explorer/data/use-products.ts
// 依商品探索頁 query 載入商品列表，並把 API 狀態轉成 UI 可用的 loadState。

import { useEffect, useRef, useState } from "react";
import { isRateLimitedApiError } from "../../_shared/api-client";
import { fetchProducts } from "../api";
import type { LoadState, ProductsResponse, ProductVendorOption, QueryState } from "../types";

// 在 query 準備完成且已選分類後抓取商品，並把 rate limit 與一般錯誤分開回報。
export function useProducts(isReady: boolean, query: QueryState) {
  const [products, setProducts] = useState<ProductsResponse | null>(null);
  const [productState, setProductState] = useState<LoadState>("idle");
  const vendorOptionsByCategoryRef = useRef<Map<string, ProductVendorOption[]>>(new Map());

  useEffect(() => {
    if (!isReady || !query.category) {
      return;
    }

    const controller = new AbortController();
    setProductState("loading");

    fetchProducts(query, controller.signal)
      .then((body) => {
        vendorOptionsByCategoryRef.current.set(query.category, [...body.meta.vendors]);
        setProducts(body);
        setProductState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (isRateLimitedApiError(error)) {
          setProductState("rate_limited");
          return;
        }

        setProductState("error");
      });

    return () => controller.abort();
  }, [isReady, query]);

  return {
    products,
    productState,
    vendorOptions: vendorOptionsByCategoryRef.current.get(query.category) ?? [],
  };
}
