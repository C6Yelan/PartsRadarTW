// apps/web/app/api/products/data.ts
// 定義商品列表 API 使用的 Prisma select、價格變動查詢欄位與窄 read client contract。

import type { Prisma } from "@partsradar/db";
import type {
  ProductMovementFilters,
  ProductMovementPageResult,
  ProductMovementSummary,
  ProductMovementSort,
} from "@partsradar/db/product-movement";

import type { SourceStatusReadClient } from "../source-status/data";

// 限定商品列表可讀取的 public-safe 欄位；ibuyToken 僅用來組 outbound CoolPC purchase URL。
export const PRODUCT_SELECT = {
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
  imageCachedAt: true,
  isActive: true,
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

export const PRODUCT_VENDOR_SELECT = {
  vendorSlug: true,
  vendorName: true,
} as const satisfies Prisma.ProductSelect;

export const PRODUCT_PRICE_MOVEMENT_RANGE_DAYS = 30;
export type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;
export type ProductVendorRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_VENDOR_SELECT;
}>;

type ProductFindManyArgs<TSelect extends Prisma.ProductSelect> = Omit<
  Prisma.ProductFindManyArgs,
  "select"
> & {
  select: TSelect;
};

export type ProductListFindManyArgs = ProductFindManyArgs<typeof PRODUCT_SELECT>;
export type ProductVendorFindManyArgs = ProductFindManyArgs<typeof PRODUCT_VENDOR_SELECT>;
// 商品列表 API handler 使用的最小讀取介面，包含列表、品牌、數量、bounded movement 與來源狀態。
export interface ProductsReadClient extends SourceStatusReadClient {
  product: {
    findProducts(args: ProductListFindManyArgs): Promise<ProductRecord[]>;
    findVendorOptions(args: ProductVendorFindManyArgs): Promise<ProductVendorRecord[]>;
    count(args: Prisma.ProductCountArgs): Promise<number>;
  };
  movement: {
    findPage(args: {
      filters: ProductMovementFilters;
      now: Date;
      page: number;
      pageSize: number;
      sort: ProductMovementSort;
    }): Promise<ProductMovementPageResult>;
    findSummaries(productIds: readonly string[], now: Date): Promise<ProductMovementSummary[]>;
  };
}
