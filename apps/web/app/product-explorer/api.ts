import { toApiSearchParams } from "./query-state";
import type { CategoryItem, ProductsResponse, QueryState } from "./types";

interface CategoriesResponse {
  data: CategoryItem[];
}

export async function fetchCategories(signal: AbortSignal): Promise<CategoryItem[]> {
  const response = await fetch("/api/categories", { signal });

  if (!response.ok) {
    throw new Error("Failed to load categories.");
  }

  const body = (await response.json()) as CategoriesResponse;
  return body.data;
}

export async function fetchProducts(
  query: QueryState,
  signal: AbortSignal,
): Promise<ProductsResponse> {
  const response = await fetch(`/api/products?${toApiSearchParams(query).toString()}`, { signal });

  if (!response.ok) {
    throw new Error("Failed to load products.");
  }

  return (await response.json()) as ProductsResponse;
}
