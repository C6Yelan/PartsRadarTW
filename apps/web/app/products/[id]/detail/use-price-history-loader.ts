// apps/web/app/products/[id]/detail/use-price-history-loader.ts
// 管理商品詳細頁價格歷史 API 載入、時間範圍切換與載入狀態。

import { useEffect, useState } from "react";
import { isRateLimitedApiError, toApiRequestError } from "../../../_shared/api-client";
import type {
  PriceHistoryLoadState,
  PriceHistoryRange,
  ProductPriceHistoryBody,
} from "../price-history/types";
import type { ProductDetailBody } from "./types";

// 在商品詳細資料可用後載入價格歷史，並讓價格走勢面板切換 7/30/90 天或全部範圍。
export function usePriceHistoryLoader({
  product,
  productId,
}: {
  product: ProductDetailBody | null;
  productId: string;
}) {
  const [historyState, setHistoryState] = useState<PriceHistoryLoadState>("idle");
  const [priceHistory, setPriceHistory] = useState<ProductPriceHistoryBody | null>(null);
  const [historyRange, setHistoryRange] = useState<PriceHistoryRange>(90);

  useEffect(() => {
    if (product) {
      return;
    }

    setHistoryState("idle");
    setPriceHistory(null);
    setHistoryRange(90);
  }, [product]);

  useEffect(() => {
    if (!product) {
      return;
    }

    const controller = new AbortController();
    setHistoryState("loading");

    async function loadPriceHistory() {
      try {
        const nextPriceHistory = await fetchPriceHistory(
          productId,
          historyRange,
          controller.signal,
        );

        if (!nextPriceHistory) {
          setHistoryState("unavailable");
          return;
        }

        setPriceHistory(nextPriceHistory);
        setHistoryState("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHistoryState(isRateLimitedApiError(error) ? "rate_limited" : "error");
      }
    }

    void loadPriceHistory();

    return () => controller.abort();
  }, [product, productId, historyRange]);

  return {
    historyRange,
    historyState,
    priceHistory,
    setHistoryRange,
  };
}

export async function fetchPriceHistory(
  productId: string,
  range: PriceHistoryRange,
  signal: AbortSignal,
): Promise<ProductPriceHistoryBody | null> {
  const response = await fetch(
    `/api/products/${productId}/price-history?${toPriceHistoryRangeQuery(range)}`,
    { signal },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load price history.");
  }

  return (await response.json()) as ProductPriceHistoryBody;
}

// 將前端價格歷史範圍轉成 API query；全部範圍使用 range=all，其餘使用 days。
function toPriceHistoryRangeQuery(range: PriceHistoryRange) {
  return range === "all" ? "range=all" : `days=${range}`;
}
