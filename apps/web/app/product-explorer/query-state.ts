import type { CategoryItem, ProductSort, ProductStatus, QueryState } from "./types";

export const DEFAULT_QUERY: QueryState = {
  q: "",
  igrp: "",
  minPrice: "",
  maxPrice: "",
  status: "active",
  sort: "price_asc",
  vendors: [],
  page: 1,
  pageSize: 20,
};

export const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "price_asc", label: "價格低到高" },
  { value: "price_desc", label: "價格高到低" },
  { value: "price_drop_desc", label: "近 30 天降幅最大" },
  { value: "price_rise_desc", label: "近 30 天增幅最大" },
  { value: "name_asc", label: "名稱 A 到 Z" },
];

export const STATUS_OPTIONS: Array<{ value: ProductStatus; label: string }> = [
  { value: "active", label: "目前上架" },
  { value: "all", label: "全部商品" },
  { value: "inactive", label: "可能已下架" },
];

export const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50] as const;
export const MAX_PRICE_DIGITS = 9;

export function readQueryFromLocation(): QueryState {
  const params = new URLSearchParams(window.location.search);

  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    igrp: parseNonNegativeIntegerParam(params.get("igrp")) ?? "",
    minPrice: parsePriceParam(params.get("minPrice")) ?? "",
    maxPrice: parsePriceParam(params.get("maxPrice")) ?? "",
    status: parseAllowedValue(params.get("status"), ["active", "inactive", "all"], "active"),
    sort: parseAllowedValue(
      params.get("sort"),
      ["price_asc", "price_desc", "price_drop_desc", "price_rise_desc", "name_asc"],
      "price_asc",
    ),
    vendors: normalizeVendorValues(parseVendorsParam(params.get("vendors")), params.get("igrp")),
    page: Number(parseNonNegativeIntegerParam(params.get("page")) ?? DEFAULT_QUERY.page),
    pageSize: Number(
      parseNonNegativeIntegerParam(params.get("pageSize")) ?? DEFAULT_QUERY.pageSize,
    ),
  };
}

export function toApiSearchParams(query: QueryState) {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", query.q);
  appendIfPresent(params, "igrp", query.igrp);
  appendIfPresent(params, "minPrice", query.minPrice);
  appendIfPresent(params, "maxPrice", query.maxPrice);
  appendVendorsIfPresent(params, query.vendors);
  params.set("status", query.status);
  params.set("sort", query.sort);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));

  return params;
}

export function toUrl(query: QueryState) {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", query.q);
  appendIfPresent(params, "igrp", query.igrp);
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

export function createProductDetailHref(productId: string, returnTo: string) {
  const params = new URLSearchParams();

  if (returnTo !== "/") {
    params.set("returnTo", returnTo);
  }

  const queryString = params.toString();
  return queryString ? `/products/${productId}?${queryString}` : `/products/${productId}`;
}

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

export function isNonNegativeInteger(value: string) {
  return /^\d+$/.test(value);
}

export function toDigitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function toPriceDigits(value: string) {
  return toDigitsOnly(value).slice(0, MAX_PRICE_DIGITS);
}

export function normalizeVendorValues(vendors: string[], igrp: string | number | null | undefined) {
  if (!igrp) {
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

export function getFallbackCategoryIgrp(categories: CategoryItem[], fallback: string) {
  return categories.length > 0 ? String(categories[0].igrp) : fallback;
}

export function getVisiblePages(currentPage: number, totalPages: number): Array<number | string> {
  if (totalPages <= 1) {
    return [1];
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | string> = [];

  for (const page of sortedPages) {
    const lastItem = items.at(-1);
    if (typeof lastItem === "number" && page - lastItem > 1) {
      items.push(`gap-${lastItem}-${page}`);
    }
    items.push(page);
  }

  return items;
}

function appendIfPresent(params: URLSearchParams, name: string, value: string) {
  const trimmed = value.trim();

  if (trimmed) {
    params.set(name, trimmed);
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

function parseVendorsParam(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((vendor) => vendor.trim())
    .filter((vendor) => /^[a-z0-9-]+$/.test(vendor));
}

function parseAllowedValue<T extends string>(value: string | null, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
