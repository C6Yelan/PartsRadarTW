// apps/web/app/product-explorer/data/use-products.ts
// 依商品探索頁 query 載入商品列表，並把 API 狀態轉成 UI 可用的 loadState。

import { useEffect, useState } from "react";
import { ApiRequestError, fetchProducts } from "../api";
import type { LoadState, ProductsResponse, QueryState } from "../types";

// 在 query 準備完成且已選分類後抓取商品，並把 rate limit 與一般錯誤分開回報。
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

        if (error instanceof ApiRequestError && error.code === "rate_limited") {
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
  };
}
