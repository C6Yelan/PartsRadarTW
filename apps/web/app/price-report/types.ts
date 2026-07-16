// apps/web/app/price-report/types.ts
// 定義價格變動總覽頁的瀏覽器 query、分類與載入狀態。

import type {
  PriceReportSort,
  PriceReportType,
  PriceReportWindow,
} from "../api/price-report/query";
import type { CategorySlug } from "../category-slugs";

export interface PriceReportQuery {
  window: PriceReportWindow;
  types: PriceReportType[];
  categories: CategorySlug[];
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

export type PriceReportLoadState = "loading" | "ready" | "error" | "rate_limited";
