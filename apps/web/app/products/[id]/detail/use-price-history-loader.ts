// apps/web/app/products/[id]/detail/use-price-history-loader.ts
import { useEffect, useState } from "react";
import type {
  PriceHistoryLoadState,
  PriceHistoryRange,
  ProductPriceHistoryBody,
} from "../price-history-panel";
import type { ProductDetailBody } from "./types";

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
        const historyResponse = await fetch(
          `/api/products/${productId}/price-history?${toPriceHistoryRangeQuery(historyRange)}`,
          {
            signal: controller.signal,
          },
        );

        if (historyResponse.status === 404) {
          setHistoryState("unavailable");
          return;
        }

        if (!historyResponse.ok) {
          throw new Error("Failed to load price history.");
        }

        setPriceHistory((await historyResponse.json()) as ProductPriceHistoryBody);
        setHistoryState("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHistoryState("error");
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

function toPriceHistoryRangeQuery(range: PriceHistoryRange) {
  return range === "all" ? "range=all" : `days=${range}`;
}
