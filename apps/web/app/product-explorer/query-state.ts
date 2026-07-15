// apps/web/app/product-explorer/query-state.ts
// 集中商品探索頁的 URL query、API search params、篩選選項與分頁狀態轉換規則。

import { getProductFacetDefinitions, isProductFilterTagSupported } from "@partsradar/shared";
import { toDigitsOnly } from "../_shared/numeric-input";
import { getCategoryIgrp } from "../category-slugs";
import type { CategoryItem, ProductSort, ProductStatus, QueryState } from "./types";

// 商品探索頁的初始查詢狀態；URL 產生時會省略與預設值相同的欄位。
export const DEFAULT_QUERY: QueryState = {
  q: "",
  category: "",
  facets: [],
  minPrice: "",
  maxPrice: "",
  status: "active",
  sort: "price_asc",
  vendors: [],
  page: 1,
  pageSize: 20,
};

// 商品列表可選排序，label 直接供 toolbar select 顯示。
export const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "price_asc", label: "價格低到高" },
  { value: "price_desc", label: "價格高到低" },
  { value: "price_drop_desc", label: "近 30 天降幅最大" },
  { value: "price_rise_desc", label: "近 30 天增幅最大" },
  { value: "name_asc", label: "名稱 A 到 Z" },
];

// 商品上架狀態篩選選項，對應 public products API 支援的 status 值。
export const STATUS_OPTIONS: Array<{ value: ProductStatus; label: string }> = [
  { value: "active", label: "目前上架" },
  { value: "all", label: "全部商品" },
  { value: "inactive", label: "可能已下架" },
];

// 限定前端可選 page size 與價格輸入長度，避免 URL / API query 無界膨脹。
export const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50] as const;
export const MAX_PRICE_DIGITS = 9;

// 從目前瀏覽器 URL 讀取商品探索 query，無效參數會改用預設值避免頁面狀態失效。
export function readQueryFromLocation(): QueryState {
  return readQueryFromSearchParams(new URLSearchParams(window.location.search));
}

// 將 browser search params 轉成 canonical slug state；分類只接受公開 semantic slug。
export function readQueryFromSearchParams(params: URLSearchParams): QueryState {
  const category = parseCategoryParam(params.get("category"));

  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    category,
    facets: normalizeFacetValues(params.getAll("facet"), category),
    minPrice: parsePriceParam(params.get("minPrice")) ?? "",
    maxPrice: parsePriceParam(params.get("maxPrice")) ?? "",
    status: parseAllowedValue(params.get("status"), ["active", "inactive", "all"], "active"),
    sort: parseAllowedValue(
      params.get("sort"),
      ["price_asc", "price_desc", "price_drop_desc", "price_rise_desc", "name_asc"],
      "price_asc",
    ),
    vendors: normalizeVendorValues(parseVendorsParam(params.get("vendors")), category),
    page: Number(parseNonNegativeIntegerParam(params.get("page")) ?? DEFAULT_QUERY.page),
    pageSize: Number(
      parseNonNegativeIntegerParam(params.get("pageSize")) ?? DEFAULT_QUERY.pageSize,
    ),
  };
}

// 將前端 query 轉成 products API 使用的 search params，保留預設值以讓 API 收到完整查詢。
export function toApiSearchParams(query: QueryState) {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", query.q);
  appendIfPresent(params, "category", query.category);
  appendFacets(params, query.facets);
  appendIfPresent(params, "minPrice", query.minPrice);
  appendIfPresent(params, "maxPrice", query.maxPrice);
  appendVendorsIfPresent(params, query.vendors);
  params.set("status", query.status);
  params.set("sort", query.sort);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));

  return params;
}

// 將前端 query 轉成瀏覽器 URL；預設值會省略，讓分享連結保持精簡。
export function toUrl(query: QueryState) {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", query.q);
  appendIfPresent(params, "category", query.category);
  appendFacets(params, query.facets);
  appendIfPresent(params, "minPrice", query.minPrice);
  appendIfPresent(params, "maxPrice", query.maxPrice);
  appendVendorsIfPresent(params, query.vendors);
  if (query.status !== DEFAULT_QUERY.status) {
    params.set("status", query.status);
  }
  if (query.sort !== DEFAULT_QUERY.sort) {
    params.set("sort", query.sort);
  }
  if (query.page !== DEFAULT_QUERY.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize !== DEFAULT_QUERY.pageSize) {
    params.set("pageSize", String(query.pageSize));
  }

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

// 建立商品詳細頁連結，必要時附上 returnTo 讓使用者可回到原本的列表查詢。
export function createProductDetailHref(productId: string, returnTo: string) {
  const params = new URLSearchParams();

  if (returnTo !== "/") {
    params.set("returnTo", returnTo);
  }

  const queryString = params.toString();
  return queryString ? `/products/${productId}?${queryString}` : `/products/${productId}`;
}

// 驗證價格範圍 draft，回傳可直接顯示在 toolbar 的錯誤訊息。
export function validatePriceRange(minPrice: string, maxPrice: string) {
  const min = minPrice.trim();
  const max = maxPrice.trim();

  if ((min && !isNonNegativeInteger(min)) || (max && !isNonNegativeInteger(max))) {
    return "價格請輸入 0 以上整數。";
  }

  if (min && max && Number(min) > Number(max)) {
    return "最低價格不可大於最高價格。";
  }

  return null;
}

// 判斷字串是否為非負整數，供 URL parser 與跳頁輸入共用。
export function isNonNegativeInteger(value: string) {
  return /^\d+$/.test(value);
}

// 將價格輸入限制為商品探索頁允許的數字長度。
export function toPriceDigits(value: string) {
  return toDigitsOnly(value).slice(0, MAX_PRICE_DIGITS);
}

// 正規化廠商篩選值；沒有選定分類時直接清空，避免跨分類保留無效廠商。
export function normalizeVendorValues(vendors: string[], category: string | null | undefined) {
  if (!category) {
    return [];
  }

  const selectedVendors = new Set<string>();
  const normalizedVendors: string[] = [];

  for (const vendor of vendors) {
    if (selectedVendors.has(vendor)) {
      continue;
    }

    selectedVendors.add(vendor);
    normalizedVendors.push(vendor);
  }

  return normalizedVendors;
}

export function normalizeFacetValues(
  facets: string[],
  category: string | null | undefined,
): string[] {
  if (!category) {
    return [];
  }

  const igrp = getCategoryIgrp(category);
  if (igrp === null) {
    return [];
  }

  const selectedFacets = new Set(
    facets.map((facet) => facet.trim()).filter((facet) => isProductFilterTagSupported(igrp, facet)),
  );

  return getProductFacetDefinitions(igrp).flatMap((definition) =>
    definition.options
      .map((option) => `${definition.key}:${option.value}`)
      .filter((tag) => selectedFacets.has(tag)),
  );
}

// 回首頁或重設時選擇可用分類；沒有分類資料時保留呼叫端提供的 fallback。
export function getFallbackCategorySlug(categories: CategoryItem[], fallback: string) {
  return categories.length > 0 ? categories[0].slug : fallback;
}

function appendIfPresent(params: URLSearchParams, name: string, value: string) {
  const trimmed = value.trim();

  if (trimmed) {
    params.set(name, trimmed);
  }
}

function appendFacets(params: URLSearchParams, facets: string[]) {
  for (const facet of facets) {
    params.append("facet", facet);
  }
}

function appendVendorsIfPresent(params: URLSearchParams, vendors: string[]) {
  if (vendors.length > 0) {
    params.set("vendors", vendors.join(","));
  }
}

function parseNonNegativeIntegerParam(value: string | null) {
  const normalizedValue = value?.trim();

  if (!normalizedValue || !isNonNegativeInteger(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

function parsePriceParam(value: string | null) {
  const normalizedValue = parseNonNegativeIntegerParam(value);

  return normalizedValue ? normalizedValue.slice(0, MAX_PRICE_DIGITS) : null;
}

function parseCategoryParam(categoryValue: string | null) {
  const category = categoryValue?.trim() ?? "";

  return category && getCategoryIgrp(category) !== null ? category : "";
}

function parseVendorsParam(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((vendor) => vendor.trim())
    .filter((vendor) => /^[a-z0-9-]+$/.test(vendor));
}

function parseAllowedValue<T extends string>(value: string | null, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
