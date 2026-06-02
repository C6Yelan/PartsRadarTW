// apps/web/app/product-explorer/types.ts
export type SourceStatus = "ok" | "stale" | "unavailable";
export type ProductStatus = "active" | "inactive" | "all";
export type ProductSort =
  | "price_asc"
  | "price_desc"
  | "price_drop_desc"
  | "price_rise_desc"
  | "name_asc";
export type LoadState = "idle" | "loading" | "ready" | "error" | "rate_limited";
export type ApiErrorCode = "invalid_query" | "not_found" | "rate_limited" | "internal_error";

export interface CategoryItem {
  id: string;
  source: "coolpc";
  igrp: number;
  displayName: string;
  sourceName: string;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}

export interface ProductListItem {
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
  priceMovement: {
    rangeDays: 30;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
  source: {
    name: "coolpc";
    url: string;
  };
  introduction: {
    url: string;
  } | null;
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
}

export interface ProductVendorOption {
  slug: string;
  name: string;
}

export interface ProductsResponse {
  data: ProductListItem[];
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

export interface QueryState {
  q: string;
  igrp: string;
  minPrice: string;
  maxPrice: string;
  status: ProductStatus;
  sort: ProductSort;
  vendors: string[];
  page: number;
  pageSize: number;
}
