// apps/web/app/product-explorer/api.ts
// 提供商品探索頁分類與商品列表 API 的 client-side fetch helper。

import { toApiRequestError } from "../_shared/api-client";
import type { CategorySlug } from "../category-slugs";
import { toApiSearchParams } from "./query-state";
import type { CategoryItem, ProductsResponse, QueryState } from "./types";

interface CategoriesResponse {
  data: CategoryItem[];
}

// 讀取商品探索頁的來源分類清單，回傳前端篩選面板可直接使用的資料。
export async function fetchCategories(signal: AbortSignal): Promise<CategoryItem[]> {
  const response = await fetch("/api/categories", { signal });

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load categories.");
  }

  const body = (await response.json()) as CategoriesResponse;
  return body.data;
}

// 依目前 query 讀取商品列表，並保留 AbortSignal 供快速切換篩選時取消舊 request。
export async function fetchProducts(
  category: CategorySlug | null,
  query: QueryState,
  signal: AbortSignal,
): Promise<ProductsResponse> {
  const response = await fetch(`/api/products?${toApiSearchParams(category, query).toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load products.");
  }

  return (await response.json()) as ProductsResponse;
}
