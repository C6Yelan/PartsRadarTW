// apps/web/app/price-report/api.ts
// 讀取價格報告與公開分類 API，並沿用網站統一的安全錯誤格式。

import { toApiRequestError } from "../_shared/api-client";
import type { PriceReportResponseBody } from "../api/price-report/response";
import { toPriceReportSearchParams } from "./query-state";
import type { PriceReportCategory, PriceReportQuery } from "./types";

interface CategoriesResponse {
  data: PriceReportCategory[];
}

export async function fetchPriceReport(
  query: PriceReportQuery,
  signal: AbortSignal,
): Promise<PriceReportResponseBody> {
  const search = toPriceReportSearchParams(query).toString();
  const response = await fetch(`/api/price-report${search ? `?${search}` : ""}`, { signal });

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load price report.");
  }

  return (await response.json()) as PriceReportResponseBody;
}

export async function fetchPriceReportCategories(
  signal: AbortSignal,
): Promise<PriceReportCategory[]> {
  const response = await fetch("/api/categories", { signal });

  if (!response.ok) {
    throw await toApiRequestError(response, "Failed to load categories.");
  }

  const body = (await response.json()) as CategoriesResponse;
  return body.data;
}
