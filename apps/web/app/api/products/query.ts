import type { Prisma } from "@partsradar/db";

import {
  InvalidQueryError,
  parseEnumQuery,
  parseOptionalIntegerQuery,
  parseOptionalTextQuery,
  parsePaginationQuery,
} from "../_shared/query";
import type { ProductVendorRecord } from "./data";

const PRODUCT_SEARCH_MAX_LENGTH = 100;
const PRODUCT_VENDOR_QUERY_MAX_LENGTH = 300;
const PRODUCT_VENDOR_VALUE_PATTERN = /^[a-z0-9-]+$/;
const PRODUCT_SORT_VALUES = ["price_asc", "price_desc", "price_drop_desc", "name_asc"] as const;
const PRODUCT_STATUS_VALUES = ["active", "inactive", "all"] as const;

type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];
type ProductStatus = (typeof PRODUCT_STATUS_VALUES)[number];

export interface ProductVendorOption {
  slug: string;
  name: string;
}

export interface ProductListQuery {
  q?: string;
  igrp?: number;
  minPrice?: number;
  maxPrice?: number;
  status: ProductStatus;
  sort: ProductSort;
  vendors: string[];
  page: number;
  pageSize: number;
}

export function parseProductListQuery(params: URLSearchParams): ProductListQuery {
  const pagination = parsePaginationQuery(params);
  const igrp = parseOptionalIntegerQuery(params, "igrp", { min: 1 });
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
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

export function buildProductWhere(
  query: ProductListQuery,
  options: { includeVendors: boolean },
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    sourceCategory: {
      enabled: true,
      ...(query.igrp !== undefined ? { igrp: query.igrp } : {}),
    },
    primaryImageUrl: {
      not: null,
    },
    primaryImageCheckedAt: {
      not: null,
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
  const vendorWhere = options.includeVendors ? buildVendorWhere(query) : null;

  if (vendorWhere) {
    andConditions.push(vendorWhere);
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export function buildProductVendorOptionsWhere(igrp: number): Prisma.ProductWhereInput {
  return {
    sourceCategory: {
      enabled: true,
      igrp,
    },
    primaryImageUrl: {
      not: null,
    },
    primaryImageCheckedAt: {
      not: null,
    },
    currentPrice: {
      isNot: null,
    },
    vendorSlug: { not: null },
    vendorName: { not: null },
  };
}

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

export function validateVendorValues(
  vendors: string[],
  options: ProductVendorOption[],
): void {
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

export function buildProductOrderBy(
  sort: ProductSort,
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price_desc":
      return [{ currentPrice: { priceSnapshot: { price: "desc" } } }, { id: "asc" }];
    case "name_asc":
      return [{ normalizedName: "asc" }, { id: "asc" }];
    case "price_drop_desc":
      return [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }];
    case "price_asc":
      return [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }];
  }
}

export function isPriceMovementSort(sort: ProductSort) {
  return sort === "price_drop_desc";
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
    throw new InvalidQueryError("vendors", "requires igrp");
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
