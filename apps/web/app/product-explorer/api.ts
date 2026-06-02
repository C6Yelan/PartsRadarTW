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

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorCode | null,
  ) {
    super(message);
  }
}

export async function fetchCategories(signal: AbortSignal): Promise<CategoryItem[]> {
  const response = await fetch("/api/categories", { signal });

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load categories.");
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
    throw await toApiRequestError(response, "Failed to load products.");
  }

  return (await response.json()) as ProductsResponse;
}

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
