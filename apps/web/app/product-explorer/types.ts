// apps/web/app/product-explorer/types.ts
// 定義商品探索頁使用的 public API response、UI load state 與 URL query 狀態型別。

import type { CategorySlug } from "../category-slugs";

// 來源資料新鮮度狀態，對應 products API meta.sourceStatus。
export type SourceStatus = "ok" | "stale" | "unavailable";

// 商品列表狀態篩選值，需與 products API 支援的 status query 保持一致。
export type ProductStatus = "active" | "inactive" | "all";

// 商品列表排序值，需與 products API 支援的 sort query 保持一致。
export type ProductSort =
  | "price_asc"
  | "price_desc"
  | "price_drop_desc"
  | "price_rise_desc"
  | "name_asc";

// 商品探索頁共用的 client-side 載入生命週期狀態。
export type LoadState = "idle" | "loading" | "ready" | "error" | "rate_limited";

// 分類 API 回傳項目，供左側分類篩選與預設分類選取使用。
export interface CategoryItem {
  id: string;
  slug: CategorySlug;
  displayName: string;
  sourceName: string;
}

// 商品列表 API 回傳項目，供列表列項、商品詳細連結與配單 intent 操作使用。
export interface ProductListItem {
  id: string;
  name: string;
  category: {
    id: string;
    igrp: number;
    displayName: string;
    sourceName: string;
  };
  image: {
    url: string;
    alt: string;
  } | null;
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
  };
  priceMovement: {
    rangeDays: 30;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
  source: {
    name: "coolpc";
    url: string;
  };
  status: {
    isActive: boolean;
  };
}

// 商品列表 API 回傳的廠商篩選選項，限定在目前分類可用的 vendor。
export interface ProductVendorOption {
  slug: string;
  name: string;
}

// 商品列表 API response contract，包含列表資料、分頁資訊與本次查詢的 meta。
export interface ProductsResponse {
  data: ProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    sourceStatus: SourceStatus;
    lastSuccessAt: string | null;
    vendors: ProductVendorOption[];
  };
}

// 商品探索頁的 URL query / draft state，作為搜尋、篩選、排序與分頁的單一前端狀態。
export interface QueryState {
  q: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  status: ProductStatus;
  sort: ProductSort;
  vendors: string[];
  page: number;
  pageSize: number;
}
