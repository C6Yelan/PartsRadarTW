// apps/web/app/product-explorer/types.ts
// 定義商品探索頁使用的 public API response、UI load state 與 URL query 狀態型別。

import type { ProductFacetDefinition } from "@partsradar/shared";
import type { ProductsResponseBody } from "../api/products/response";
import type { CategorySlug } from "../category-slugs";

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
  facets: readonly ProductFacetDefinition[];
}

export type ProductListItem = ProductsResponseBody["data"][number];
export type ProductVendorOption = ProductsResponseBody["meta"]["vendors"][number];

export interface SelectedFacetChip {
  tag: string;
  label: string;
}

export type ProductsResponse = ProductsResponseBody;

// 商品探索頁的 URL query / draft state，作為搜尋、篩選、排序與分頁的單一前端狀態。
export interface QueryState {
  q: string;
  category: string;
  facets: string[];
  minPrice: string;
  maxPrice: string;
  status: ProductStatus;
  sort: ProductSort;
  vendors: string[];
  page: number;
  pageSize: number;
}
