// apps/web/app/product-explorer/data/use-products.ts
import { useEffect, useState } from "react";
import { ApiRequestError, fetchProducts } from "../api";
import type { LoadState, ProductsResponse, QueryState } from "../types";

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
