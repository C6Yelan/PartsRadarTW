"use client";
// apps/web/app/build-list/use-build-list-refresh.ts
// 管理配單頁的批次 refresh lifecycle，避免 snapshot 寫入 localStorage 或舊 request 覆寫新狀態。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BuildListIntent, BuildListProductSnapshot, BuildListRefreshState } from "./model";
import { refreshBuildListProducts } from "./refresh";

export function useBuildListRefresh(intents: BuildListIntent[], isReady: boolean) {
  const [products, setProducts] = useState<BuildListProductSnapshot[]>([]);
  const [state, setState] = useState<BuildListRefreshState>("idle");
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const productIdSignature = intents.map((intent) => intent.productId).join(",");
  const productIds = useMemo(
    () => (productIdSignature ? productIdSignature.split(",") : []),
    [productIdSignature],
  );

  const refresh = useCallback(async () => {
    activeRequestRef.current?.abort();
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!isReady || productIds.length === 0) {
      activeRequestRef.current = null;
      setProducts([]);
      setState("idle");
      return;
    }

    const controller = new AbortController();
    activeRequestRef.current = controller;
    const requestedProductIdSet = new Set(productIds);
    setProducts((currentProducts) =>
      currentProducts.filter((product) => requestedProductIdSet.has(product.id)),
    );
    setState("loading");

    const result = await refreshBuildListProducts(productIds, {
      signal: controller.signal,
    });

    if (requestIdRef.current !== requestId || result.status === "aborted") {
      return;
    }

    activeRequestRef.current = null;

    if (result.status === "ready") {
      setProducts(result.data);
      setLastSuccessfulSyncAt(new Date().toISOString());
      setState("ready");
      return;
    }

    setProducts([]);
    setState(result.status);
  }, [isReady, productIds]);

  useEffect(() => {
    void refresh();

    return () => activeRequestRef.current?.abort();
  }, [refresh]);

  return {
    lastSuccessfulSyncAt,
    products,
    refresh,
    state,
  };
}
