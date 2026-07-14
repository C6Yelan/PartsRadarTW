// apps/web/app/api/price-report/query.ts
// 定義公開價格報告的時間窗、內容類型、分類、排序與分頁 query contract。

import type { RecentPriceReportFilters } from "@partsradar/db/price-report";

import { CATEGORY_MAPPINGS, getCategoryIgrp, type CategorySlug } from "../../category-slugs";
import {
  InvalidQueryError,
  parseEnumQuery,
  parseOptionalTextQuery,
  parsePaginationQuery,
} from "../_shared/query";

const PRICE_REPORT_WINDOWS = ["24h", "7d", "30d"] as const;
const PRICE_REPORT_TYPES = ["drop", "rise", "new"] as const;
const PRICE_REPORT_SORTS = [
  "changed_desc",
  "drop_percent_desc",
  "rise_percent_desc",
  "delta_amount_desc",
] as const;
const DEFAULT_PRICE_REPORT_TYPES = ["drop", "rise"] as const;
const PRICE_REPORT_SEARCH_MAX_LENGTH = 100;
const PRICE_REPORT_CATEGORY_MAX_LENGTH = 50;

export type PriceReportWindow = (typeof PRICE_REPORT_WINDOWS)[number];
export type PriceReportType = (typeof PRICE_REPORT_TYPES)[number];
export type PriceReportSort = (typeof PRICE_REPORT_SORTS)[number];

export interface PriceReportQuery {
  window: PriceReportWindow;
  types: PriceReportType[];
  categorySlugs: CategorySlug[];
  categoryIgrps: number[];
  productKeyword: string | null;
  sort: PriceReportSort;
  page: number;
  pageSize: number;
}

export function parsePriceReportQuery(params: URLSearchParams): PriceReportQuery {
  const pagination = parsePaginationQuery(params);
  const category = parseCategoryQuery(params);

  return {
    window: parseEnumQuery(params, "window", PRICE_REPORT_WINDOWS, "24h"),
    types: parseRepeatedEnumQuery(
      params,
      "type",
      PRICE_REPORT_TYPES,
      DEFAULT_PRICE_REPORT_TYPES,
    ),
    categorySlugs: category.slugs,
    categoryIgrps: category.igrps,
    productKeyword:
      parseOptionalTextQuery(params, "q", {
        maxLength: PRICE_REPORT_SEARCH_MAX_LENGTH,
      }) ?? null,
    sort: parseEnumQuery(params, "sort", PRICE_REPORT_SORTS, "changed_desc"),
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

export function toRecentPriceReportFilters(
  query: PriceReportQuery,
): RecentPriceReportFilters {
  const types = new Set(query.types);

  return {
    categoryIgrps: query.categoryIgrps,
    productKeyword: query.productKeyword,
    includePriceDrops: types.has("drop"),
    includePriceRises: types.has("rise"),
    includeNewProducts: types.has("new"),
  };
}

export function getPriceReportSince(until: Date, window: PriceReportWindow): Date {
  const hours = window === "24h" ? 24 : window === "7d" ? 24 * 7 : 24 * 30;
  return new Date(until.getTime() - hours * 60 * 60 * 1000);
}

function parseCategoryQuery(params: URLSearchParams): {
  slugs: CategorySlug[];
  igrps: number[];
} {
  const values = params.getAll("category").map((value) => value.trim());

  if (values.length === 0) {
    return { slugs: [], igrps: [] };
  }

  if (
    values.length > CATEGORY_MAPPINGS.length ||
    new Set(values).size !== values.length ||
    values.some(
      (value) =>
        value.length === 0 ||
        value.length > PRICE_REPORT_CATEGORY_MAX_LENGTH ||
        getCategoryIgrp(value) === null,
    )
  ) {
    throw new InvalidQueryError("category", "must contain unique supported categories");
  }

  const selected = new Set(values);
  const categories = CATEGORY_MAPPINGS.filter(({ slug }) => selected.has(slug));
  return {
    slugs: categories.map(({ slug }) => slug),
    igrps: categories.map(({ igrp }) => igrp),
  };
}

function parseRepeatedEnumQuery<TAllowed extends readonly [string, ...string[]]>(
  params: URLSearchParams,
  name: string,
  allowedValues: TAllowed,
  defaultValues: readonly TAllowed[number][],
): TAllowed[number][] {
  const values = params.getAll(name).map((value) => value.trim());

  if (values.length === 0) {
    return [...defaultValues];
  }

  if (
    values.some(
      (value) =>
        value.length === 0 || !(allowedValues as readonly string[]).includes(value),
    ) ||
    new Set(values).size !== values.length
  ) {
    throw new InvalidQueryError(name, "must contain unique allowed values");
  }

  return values as TAllowed[number][];
}
