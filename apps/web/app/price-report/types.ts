// apps/web/app/price-report/types.ts
// 定義價格變動總覽頁的 query、公開 API response 與載入狀態。

import type { CategorySlug } from "../category-slugs";

export type PriceReportWindow = "24h" | "7d" | "30d";
export type PriceReportType = "drop" | "rise" | "new";
export type PriceReportSort =
  | "changed_desc"
  | "drop_percent_desc"
  | "rise_percent_desc"
  | "delta_amount_desc";

export interface PriceReportQuery {
  window: PriceReportWindow;
  types: PriceReportType[];
  category: string;
  q: string;
  sort: PriceReportSort;
  page: number;
}

export interface PriceReportCategory {
  id: string;
  slug: CategorySlug;
  displayName: string;
  sourceName: string;
}

export interface PriceReportResponseItem {
  productId: string;
  productName: string;
  image: {
    url: string;
    alt: string;
  } | null;
  category: {
    igrp: number;
    slug: CategorySlug | null;
    displayName: string;
  };
  kind: PriceReportType;
  previousPrice: number | null;
  currentPrice: number;
  currency: string;
  deltaAmount: number | null;
  deltaPercent: number | null;
  changedAt: string;
}

export interface PriceReportResponse {
  data: PriceReportResponseItem[];
  summary: {
    dropCount: number;
    riseCount: number;
    newProductCount: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    window: PriceReportWindow;
    since: string;
    until: string;
    sourceStatus: "ok" | "stale" | "unavailable";
    lastSuccessAt: string | null;
  };
}

export type PriceReportLoadState = "loading" | "ready" | "error" | "rate_limited";
