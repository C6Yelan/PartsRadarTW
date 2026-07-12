// apps/web/app/api/products/query.ts
// 定義商品列表 API 的 public query contract，集中驗證篩選、排序、品牌與分頁語意。

import type { Prisma } from "@partsradar/db";
import { isProductFilterTagSupported, parseProductFilterTag } from "@partsradar/shared";

import { getCategoryIgrp } from "../../category-slugs";
import {
  InvalidQueryError,
  parseEnumQuery,
  parseOptionalIntegerQuery,
  parseOptionalTextQuery,
  parsePaginationQuery,
} from "../_shared/query";
import type { ProductVendorRecord } from "./data";

const PRODUCT_SEARCH_MAX_LENGTH = 100;
const PRODUCT_CATEGORY_MAX_LENGTH = 50;
const PRODUCT_VENDOR_QUERY_MAX_LENGTH = 300;
const PRODUCT_FACET_MAX_COUNT = 50;
const PRODUCT_FACET_MAX_LENGTH = 100;
const PRODUCT_VENDOR_VALUE_PATTERN = /^[a-z0-9-]+$/;
const PRODUCT_SORT_VALUES = [
  "price_asc",
  "price_desc",
  "price_drop_desc",
  "price_rise_desc",
  "name_asc",
] as const;
const PRODUCT_STATUS_VALUES = ["active", "inactive", "all"] as const;

type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];
type ProductStatus = (typeof PRODUCT_STATUS_VALUES)[number];

export interface ProductVendorOption {
  slug: string;
  name: string;
}

// 商品列表 API 已驗證後的查詢條件，避免 handler 直接操作未清洗 URLSearchParams。
export interface ProductListQuery {
  q?: string;
  igrp?: number;
  minPrice?: number;
  maxPrice?: number;
  status: ProductStatus;
  sort: ProductSort;
  vendors: string[];
  facetTags: string[];
  page: number;
  pageSize: number;
}

// 將 URL query 解析成商品列表查詢條件，並在 DB 查詢前擋下語意不明或超出範圍的輸入。
export function parseProductListQuery(params: URLSearchParams): ProductListQuery {
  const pagination = parsePaginationQuery(params);
  const igrp = parseCategoryIgrp(params);
  const minPrice = parseOptionalIntegerQuery(params, "minPrice", { min: 0 });
  const maxPrice = parseOptionalIntegerQuery(params, "maxPrice", { min: 0 });

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new InvalidQueryError("minPrice", "must be less than or equal to maxPrice");
  }

  return {
    q: parseOptionalTextQuery(params, "q", { maxLength: PRODUCT_SEARCH_MAX_LENGTH }),
    igrp,
    minPrice,
    maxPrice,
    status: parseEnumQuery(params, "status", PRODUCT_STATUS_VALUES, "active"),
    sort: parseEnumQuery(params, "sort", PRODUCT_SORT_VALUES, "price_asc"),
    vendors: parseVendorQuery(params, igrp),
    facetTags: parseFacetQuery(params, igrp),
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

// 將已驗證 query 轉成 Prisma where；品牌條件可關閉，讓品牌選項查詢不被當前品牌篩選自我限制。
export function buildProductWhere(
  query: ProductListQuery,
  options: { includeVendors: boolean },
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    sourceCategory: {
      enabled: true,
      ...(query.igrp !== undefined ? { igrp: query.igrp } : {}),
    },
    currentPrice: {
      is: {
        priceSnapshot: {
          price: {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          },
        },
      },
    },
  };

  if (query.status !== "all") {
    where.isActive = query.status === "active";
  }

  const andConditions = buildProductSearchWhere(query.q);
  andConditions.push(...buildFacetWhere(query.facetTags));
  const vendorWhere = options.includeVendors ? buildVendorWhere(query) : null;

  if (vendorWhere) {
    andConditions.push(vendorWhere);
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

// 建立套用非品牌條件的選項查詢，並保留目前分類中已選品牌供使用者移除。
export function buildProductVendorOptionsWhere(query: ProductListQuery): Prisma.ProductWhereInput {
  const availableVendorWhere: Prisma.ProductWhereInput = {
    ...buildProductWhere(query, { includeVendors: false }),
    vendorSlug: { not: null },
    vendorName: { not: null },
  };

  if (query.igrp === undefined || query.vendors.length === 0) {
    return availableVendorWhere;
  }

  return {
    sourceCategory: {
      enabled: true,
      igrp: query.igrp,
    },
    currentPrice: {
      isNot: null,
    },
    vendorSlug: { not: null },
    vendorName: { not: null },
    OR: [
      availableVendorWhere,
      {
        vendorSlug: {
          in: query.vendors,
        },
      },
    ],
  };
}

// 將 DB 品牌資料轉成去重後的公開選項，缺 slug/name 的資料不出現在篩選器。
export function toProductVendorOptions(records: ProductVendorRecord[]): ProductVendorOption[] {
  const options = new Map<string, ProductVendorOption>();

  for (const record of records) {
    if (!record.vendorSlug || !record.vendorName || options.has(record.vendorSlug)) {
      continue;
    }

    options.set(record.vendorSlug, {
      slug: record.vendorSlug,
      name: record.vendorName,
    });
  }

  return [...options.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-TW"));
}

// 確認使用者提交的品牌值都來自目前分類的可用選項，避免查詢不存在或跨分類品牌。
export function validateVendorValues(vendors: string[], options: ProductVendorOption[]): void {
  if (vendors.length === 0) {
    return;
  }

  const allowedVendors = new Set(options.map((option) => option.slug));

  for (const vendor of vendors) {
    if (!allowedVendors.has(vendor)) {
      throw new InvalidQueryError("vendors", "must be one of the available values");
    }
  }
}

// 建立 DB 可直接排序的欄位；價格變動排序仍會在 price-movement.ts 依計算結果重新排序。
export function buildProductOrderBy(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price_desc":
      return [{ currentPrice: { priceSnapshot: { price: "desc" } } }, { id: "asc" }];
    case "name_asc":
      return [{ normalizedName: "asc" }, { id: "asc" }];
    case "price_drop_desc":
      return [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }];
    case "price_rise_desc":
      return [{ currentPrice: { priceSnapshot: { price: "desc" } } }, { id: "asc" }];
    case "price_asc":
      return [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }];
  }
}

// 判斷排序是否需要先計算近 30 天價格變動，再由應用層排序與分頁。
export function isPriceMovementSort(sort: ProductSort) {
  return sort === "price_drop_desc" || sort === "price_rise_desc";
}

function buildProductSearchWhere(searchText: string | undefined): Prisma.ProductWhereInput[] {
  const tokens = searchText?.split(/\s+/).filter(Boolean) ?? [];

  return tokens.map((token) => ({
    OR: [
      {
        name: {
          contains: token,
          mode: "insensitive",
        },
      },
      {
        normalizedName: {
          contains: token,
          mode: "insensitive",
        },
      },
      {
        vendorSlug: {
          contains: token,
          mode: "insensitive",
        },
      },
      {
        vendorName: {
          contains: token,
          mode: "insensitive",
        },
      },
    ],
  }));
}

function parseVendorQuery(params: URLSearchParams, igrp: number | undefined): string[] {
  const rawVendors = parseOptionalTextQuery(params, "vendors", {
    maxLength: PRODUCT_VENDOR_QUERY_MAX_LENGTH,
  });

  if (!rawVendors) {
    return [];
  }

  if (igrp === undefined) {
    throw new InvalidQueryError("vendors", "requires category");
  }

  const vendors = rawVendors
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const uniqueVendors = new Set(vendors);

  if (vendors.length === 0 || vendors.length !== uniqueVendors.size) {
    throw new InvalidQueryError("vendors", "must contain unique vendor values");
  }

  for (const vendor of vendors) {
    if (!PRODUCT_VENDOR_VALUE_PATTERN.test(vendor)) {
      throw new InvalidQueryError("vendors", "must contain valid vendor values");
    }
  }

  return vendors;
}

function parseFacetQuery(params: URLSearchParams, igrp: number | undefined): string[] {
  const rawTags = params.getAll("facet");

  if (rawTags.length === 0) {
    return [];
  }

  if (igrp === undefined) {
    throw new InvalidQueryError("facet", "requires category");
  }

  if (rawTags.length > PRODUCT_FACET_MAX_COUNT) {
    throw new InvalidQueryError(
      "facet",
      `must be provided ${PRODUCT_FACET_MAX_COUNT} times or fewer`,
    );
  }

  const tags = rawTags.map((tag) => tag.trim());

  if (tags.some((tag) => tag.length === 0 || tag.length > PRODUCT_FACET_MAX_LENGTH)) {
    throw new InvalidQueryError(
      "facet",
      `must contain non-empty values of ${PRODUCT_FACET_MAX_LENGTH} characters or fewer`,
    );
  }

  if (new Set(tags).size !== tags.length) {
    throw new InvalidQueryError("facet", "must contain unique values");
  }

  for (const tag of tags) {
    if (!isProductFilterTagSupported(igrp, tag)) {
      throw new InvalidQueryError("facet", "must be supported by the selected category");
    }
  }

  return tags;
}

function buildFacetWhere(facetTags: string[]): Prisma.ProductWhereInput[] {
  const tagsByKey = new Map<string, string[]>();

  for (const tag of facetTags) {
    const parsedTag = parseProductFilterTag(tag);

    if (!parsedTag) {
      throw new InvalidQueryError("facet", "must use the key:value format");
    }

    const tags = tagsByKey.get(parsedTag.key) ?? [];
    tags.push(tag);
    tagsByKey.set(parsedTag.key, tags);
  }

  return [...tagsByKey.values()].map((tags) => ({
    filterTags: {
      hasSome: tags,
    },
  }));
}

function parseCategoryIgrp(params: URLSearchParams): number | undefined {
  if (params.has("igrp")) {
    throw new InvalidQueryError("igrp", "is not supported; use category");
  }

  const category = parseOptionalTextQuery(params, "category", {
    maxLength: PRODUCT_CATEGORY_MAX_LENGTH,
  });
  const categoryIgrp = category ? getCategoryIgrp(category) : null;

  if (category && categoryIgrp === null) {
    throw new InvalidQueryError("category", "must be one of the supported category slugs");
  }

  return categoryIgrp ?? undefined;
}

function buildVendorWhere(query: ProductListQuery): Prisma.ProductWhereInput | null {
  if (query.igrp === undefined || query.vendors.length === 0) {
    return null;
  }

  return {
    vendorSlug: {
      in: query.vendors,
    },
  };
}
