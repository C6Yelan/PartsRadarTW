import type { Prisma } from "@partsradar/db";

import {
  InvalidQueryError,
  parseEnumQuery,
  parseOptionalIntegerQuery,
  parseOptionalTextQuery,
  parsePaginationQuery,
} from "../_shared/query";
import { internalErrorResponse, invalidQueryResponse, jsonOk } from "../_shared/responses";
import { createProductImageApiUrl } from "../product-images/handler";
import {
  buildSourceStatusResponse,
  SOURCE_STATUS_CATEGORY_QUERY,
  type SourceStatus,
  type SourceStatusCategoryRecord,
  type SourceStatusReadClient,
} from "../source-status/handler";

const COOLPC_SOURCE_NAME = "coolpc";
const COOLPC_CATEGORY_BASE_URL = "https://www.coolpc.com.tw/eachview.php";
const PRODUCT_SEARCH_MAX_LENGTH = 100;
const PRODUCT_VENDOR_QUERY_MAX_LENGTH = 300;
const PRODUCT_VENDOR_VALUE_PATTERN = /^[a-z0-9-]+$/;
const PRODUCT_SORT_VALUES = ["price_asc", "price_desc", "name_asc"] as const;
const PRODUCT_STATUS_VALUES = ["active", "inactive", "all"] as const;

type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];
type ProductStatus = (typeof PRODUCT_STATUS_VALUES)[number];

const PRODUCT_SELECT = {
  // Keep the list endpoint on public-safe fields only. Do not select sourceUrl,
  // ibuyToken, raw snapshots, or other crawler/internal identifiers here.
  id: true,
  name: true,
  primaryImageUrl: true,
  primaryImageCheckedAt: true,
  isActive: true,
  missingSince: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
          capturedAt: true,
        },
      },
    },
  },
  sourceCategory: {
    select: {
      id: true,
      igrp: true,
      displayName: true,
      sourceName: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

const PRODUCT_VENDOR_SELECT = {
  vendorSlug: true,
  vendorName: true,
} as const satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;
type ProductVendorRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_VENDOR_SELECT }>;
type ProductFindManyArgs<TSelect extends Prisma.ProductSelect> = Omit<
  Prisma.ProductFindManyArgs,
  "select"
> & {
  select: TSelect;
};
type ProductListFindManyArgs = ProductFindManyArgs<typeof PRODUCT_SELECT>;
type ProductVendorFindManyArgs = ProductFindManyArgs<typeof PRODUCT_VENDOR_SELECT>;

interface ProductVendorOption {
  slug: string;
  name: string;
}

export interface ProductsReadClient extends SourceStatusReadClient {
  product: {
    findProducts(args: ProductListFindManyArgs): Promise<ProductRecord[]>;
    findVendorOptions(args: ProductVendorFindManyArgs): Promise<ProductVendorRecord[]>;
    count(args: Prisma.ProductCountArgs): Promise<number>;
  };
}

interface ProductListQuery {
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

interface ProductListResponseItem {
  id: string;
  name: string;
  category: {
    id: string;
    igrp: number;
    displayName: string;
    sourceName: string;
  };
  image: {
    url: string;
    alt: string;
    capturedAt: string;
  };
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
  };
  source: {
    name: typeof COOLPC_SOURCE_NAME;
    url: string;
  };
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
}

interface ProductsResponseBody {
  data: ProductListResponseItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    sourceStatus: SourceStatus;
    lastSuccessAt: string | null;
    vendors: ProductVendorOption[];
  };
}

interface GetProductsHandlerOptions {
  now?: () => Date;
}

export function createGetProductsHandler(
  client: ProductsReadClient,
  options: GetProductsHandlerOptions = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const now = options.now?.() ?? new Date();
      const query = parseProductListQuery(new URL(request.url).searchParams);
      const [vendorRecords, sourceStatusCategories] = await Promise.all([
        query.igrp === undefined
          ? Promise.resolve([])
          : client.product.findVendorOptions({
              where: buildProductVendorOptionsWhere(query.igrp),
              orderBy: [{ vendorName: "asc" }, { vendorSlug: "asc" }],
              distinct: ["vendorSlug"],
              select: PRODUCT_VENDOR_SELECT,
            }),
        client.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      ]);
      const vendorOptions = toProductVendorOptions(vendorRecords);
      validateVendorValues(query.vendors, vendorOptions);
      const where = buildProductWhere(query, { includeVendors: true });
      const [products, totalItems] = await Promise.all([
        client.product.findProducts({
          where,
          orderBy: buildProductOrderBy(query.sort),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: PRODUCT_SELECT,
        }),
        client.product.count({ where }),
      ]);
      const sourceStatus = buildProductSourceStatus(sourceStatusCategories, query.igrp, now);

      return jsonOk<ProductsResponseBody>({
        data: products.map(toProductResponseItem),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / query.pageSize),
        },
        meta: {
          sourceStatus: sourceStatus.status,
          lastSuccessAt: sourceStatus.lastSuccessAt,
          vendors: vendorOptions,
        },
      });
    } catch (error) {
      if (error instanceof InvalidQueryError) {
        return invalidQueryResponse();
      }

      return internalErrorResponse();
    }
  };
}

function parseProductListQuery(params: URLSearchParams): ProductListQuery {
  const pagination = parsePaginationQuery(params);
  const minPrice = parseOptionalIntegerQuery(params, "minPrice", { min: 0 });
  const maxPrice = parseOptionalIntegerQuery(params, "maxPrice", { min: 0 });

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new InvalidQueryError("minPrice", "must be less than or equal to maxPrice");
  }

  return {
    q: parseOptionalTextQuery(params, "q", { maxLength: PRODUCT_SEARCH_MAX_LENGTH }),
    igrp: parseOptionalIntegerQuery(params, "igrp", { min: 1 }),
    minPrice,
    maxPrice,
    status: parseEnumQuery(params, "status", PRODUCT_STATUS_VALUES, "active"),
    sort: parseEnumQuery(params, "sort", PRODUCT_SORT_VALUES, "price_asc"),
    vendors: parseVendorQuery(params, parseOptionalIntegerQuery(params, "igrp", { min: 1 })),
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

function buildProductWhere(
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

  if (query.q) {
    where.OR = [
      {
        name: {
          contains: query.q,
          mode: "insensitive",
        },
      },
      {
        normalizedName: {
          contains: query.q,
          mode: "insensitive",
        },
      },
    ];
  }

  const vendorWhere = options.includeVendors ? buildVendorWhere(query) : null;

  if (vendorWhere) {
    where.AND = [vendorWhere];
  }

  return where;
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

function buildProductVendorOptionsWhere(igrp: number): Prisma.ProductWhereInput {
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

function toProductVendorOptions(records: ProductVendorRecord[]): ProductVendorOption[] {
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

function validateVendorValues(vendors: string[], options: ProductVendorOption[]): void {
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

function buildProductOrderBy(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price_desc":
      return [{ currentPrice: { priceSnapshot: { price: "desc" } } }, { id: "asc" }];
    case "name_asc":
      return [{ normalizedName: "asc" }, { id: "asc" }];
    case "price_asc":
      return [{ currentPrice: { priceSnapshot: { price: "asc" } } }, { id: "asc" }];
  }
}

function buildProductSourceStatus(
  categories: SourceStatusCategoryRecord[],
  igrp: number | undefined,
  now: Date,
) {
  const sourceCategories =
    igrp === undefined ? categories : categories.filter((category) => category.igrp === igrp);

  return buildSourceStatusResponse(sourceCategories, now);
}

function toProductResponseItem(product: ProductRecord): ProductListResponseItem {
  if (!product.currentPrice) {
    throw new Error("Product list query returned a product without current price.");
  }
  if (!product.primaryImageUrl || !product.primaryImageCheckedAt) {
    throw new Error("Product list query returned a product without primary image data.");
  }

  return {
    id: product.id,
    name: product.name,
    category: {
      id: product.sourceCategory.id,
      igrp: product.sourceCategory.igrp,
      displayName: product.sourceCategory.displayName,
      sourceName: product.sourceCategory.sourceName,
    },
    image: {
      url: createProductImageApiUrl(product.id),
      alt: product.name,
      capturedAt: product.primaryImageCheckedAt.toISOString(),
    },
    price: {
      amount: product.currentPrice.priceSnapshot.price,
      currency: product.currentPrice.priceSnapshot.currency,
      capturedAt: product.currentPrice.priceSnapshot.capturedAt.toISOString(),
      lastSeenAt: product.currentPrice.lastSeenAt.toISOString(),
    },
    source: {
      name: COOLPC_SOURCE_NAME,
      url: createCoolpcCategoryUrl(product.sourceCategory.igrp),
    },
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
  };
}

function createCoolpcCategoryUrl(igrp: number): string {
  // Build from a fixed source URL so stored source URLs cannot leak PHPSESSID or
  // other crawl-time tokens into the public API response.
  const url = new URL(COOLPC_CATEGORY_BASE_URL);
  url.searchParams.set("IGrp", String(igrp));

  return url.toString();
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
