// apps/web/app/price-report/query-state.ts
// 集中價格變動總覽的瀏覽器 URL 與公開 API query 正規化規則。

import type {
  PriceReportSort,
  PriceReportType,
  PriceReportWindow,
} from "../api/price-report/query";
import { CATEGORY_MAPPINGS, type CategorySlug } from "../category-slugs";
import type { PriceReportQuery } from "./types";

export const PRICE_REPORT_TYPES: readonly PriceReportType[] = ["drop", "rise", "new"];

export const DEFAULT_PRICE_REPORT_QUERY: PriceReportQuery = {
  window: "24h",
  types: ["drop", "rise"],
  categories: [],
  q: "",
  sort: "changed_desc",
  page: 1,
};

const WINDOWS: readonly PriceReportWindow[] = ["24h", "7d", "30d"];
const SORTS: readonly PriceReportSort[] = [
  "changed_desc",
  "drop_percent_desc",
  "rise_percent_desc",
  "delta_amount_desc",
];

export function readPriceReportQuery(params: URLSearchParams): PriceReportQuery {
  return {
    window: readAllowed(params.get("window"), WINDOWS, DEFAULT_PRICE_REPORT_QUERY.window),
    types: normalizePriceReportTypes(params.getAll("type")),
    categories: normalizePriceReportCategories(params.getAll("category")),
    q: (params.get("q") ?? "").trim().slice(0, 100),
    sort: readAllowed(params.get("sort"), SORTS, DEFAULT_PRICE_REPORT_QUERY.sort),
    page: readPositiveInteger(params.get("page")),
  };
}

export function normalizePriceReportTypes(values: string[]): PriceReportType[] {
  if (values.length === 0) {
    return [...DEFAULT_PRICE_REPORT_QUERY.types];
  }

  const selected = new Set(
    values
      .map((value) => value.trim())
      .filter((value): value is PriceReportType =>
        PRICE_REPORT_TYPES.includes(value as PriceReportType),
      ),
  );
  const normalized = PRICE_REPORT_TYPES.filter((type) => selected.has(type));

  return normalized.length > 0 ? normalized : [...DEFAULT_PRICE_REPORT_QUERY.types];
}

export function normalizePriceReportCategories(values: readonly string[]): CategorySlug[] {
  const selected = new Set(values.map((value) => value.trim()));
  const normalized = CATEGORY_MAPPINGS.map(({ slug }) => slug).filter((slug) => selected.has(slug));

  return normalized.length === CATEGORY_MAPPINGS.length ? [] : normalized;
}

export function toPriceReportSearchParams(query: PriceReportQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.window !== DEFAULT_PRICE_REPORT_QUERY.window) {
    params.set("window", query.window);
  }

  if (!hasDefaultTypes(query.types)) {
    for (const type of normalizePriceReportTypes(query.types)) {
      params.append("type", type);
    }
  }

  for (const category of normalizePriceReportCategories(query.categories)) {
    params.append("category", category);
  }
  appendIfPresent(params, "q", query.q);

  if (query.sort !== DEFAULT_PRICE_REPORT_QUERY.sort) {
    params.set("sort", query.sort);
  }

  if (query.page > 1) {
    params.set("page", String(query.page));
  }

  return params;
}

export function toPriceReportUrl(query: PriceReportQuery): string {
  const search = toPriceReportSearchParams(query).toString();
  return search ? `/price-report?${search}` : "/price-report";
}

export function hasNonDefaultPriceReportFilters(query: PriceReportQuery): boolean {
  return (
    query.window !== DEFAULT_PRICE_REPORT_QUERY.window ||
    !hasDefaultTypes(query.types) ||
    normalizePriceReportCategories(query.categories).length > 0 ||
    query.q.trim() !== "" ||
    query.sort !== DEFAULT_PRICE_REPORT_QUERY.sort
  );
}

function hasDefaultTypes(types: PriceReportType[]): boolean {
  const normalized = normalizePriceReportTypes(types);
  return (
    normalized.length === DEFAULT_PRICE_REPORT_QUERY.types.length &&
    normalized.every((type, index) => type === DEFAULT_PRICE_REPORT_QUERY.types[index])
  );
}

function readAllowed<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return value !== null && allowed.includes(value as T) ? (value as T) : fallback;
}

function readPositiveInteger(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) {
    return 1;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function appendIfPresent(params: URLSearchParams, name: string, value: string) {
  const normalized = value.trim();

  if (normalized) {
    params.set(name, normalized);
  }
}
