// apps/web/app/product-explorer/api.ts
// 提供商品探索頁 client-side fetch helper，統一分類與商品列表 API 的錯誤轉換。

import { toApiSearchParams } from "./query-state";
import type { ApiErrorCode, CategoryItem, ProductsResponse, QueryState } from "./types";

interface CategoriesResponse {
  data: CategoryItem[];
}

interface ApiErrorResponse {
  error?: {
    code?: ApiErrorCode;
    message?: string;
  };
}

// 封裝 public API 非 2xx 回應，讓 hooks 可依 status / code 判斷 UI 狀態。
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorCode | null,
  ) {
    super(message);
  }
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
  query: QueryState,
  signal: AbortSignal,
): Promise<ProductsResponse> {
  const response = await fetch(`/api/products?${toApiSearchParams(query).toString()}`, { signal });

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load products.");
  }

  return (await response.json()) as ProductsResponse;
}

// 將 public API 錯誤 response 轉成前端錯誤物件；無法解析時使用泛用 fallback。
async function toApiRequestError(response: Response, fallbackMessage: string) {
  let body: ApiErrorResponse | null = null;

  try {
    body = (await response.json()) as ApiErrorResponse;
  } catch {
    body = null;
  }

  return new ApiRequestError(
    body?.error?.message ?? fallbackMessage,
    response.status,
    body?.error?.code ?? null,
  );
}
