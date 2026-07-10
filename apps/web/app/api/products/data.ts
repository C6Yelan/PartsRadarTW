// apps/web/app/api/products/data.ts
// 定義商品列表 API 使用的 Prisma select、價格變動查詢欄位與窄 read client contract。

import type { Prisma } from "@partsradar/db";

import type { SourceStatusReadClient } from "../source-status/handler";

// 限定商品列表可讀取的 public-safe 欄位；ibuyToken 僅用來組 outbound CoolPC purchase URL。
export const PRODUCT_SELECT = {
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
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

// 價格變動摘要只需要歷史快照的商品、價格與時間，不讀取商品完整資料。
export const PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT = {
  productId: true,
  price: true,
  capturedAt: true,
} as const satisfies Prisma.PriceSnapshotSelect;

export type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;
export type ProductVendorRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_VENDOR_SELECT;
}>;
export type ProductPriceMovementSnapshotRecord = Prisma.PriceSnapshotGetPayload<{
  select: typeof PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT;
}>;

type ProductFindManyArgs<TSelect extends Prisma.ProductSelect> = Omit<
  Prisma.ProductFindManyArgs,
  "select"
> & {
  select: TSelect;
};

export type ProductListFindManyArgs = ProductFindManyArgs<typeof PRODUCT_SELECT>;
export type ProductVendorFindManyArgs = ProductFindManyArgs<typeof PRODUCT_VENDOR_SELECT>;
export type ProductPriceMovementSnapshotFindManyArgs = Omit<
  Prisma.PriceSnapshotFindManyArgs,
  "select"
> & {
  select: typeof PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT;
};

// 商品列表 API handler 使用的最小讀取介面，包含列表、品牌選項、數量、價格快照與來源狀態查詢。
export interface ProductsReadClient extends SourceStatusReadClient {
  product: {
    findProducts(args: ProductListFindManyArgs): Promise<ProductRecord[]>;
    findVendorOptions(args: ProductVendorFindManyArgs): Promise<ProductVendorRecord[]>;
    count(args: Prisma.ProductCountArgs): Promise<number>;
  };
  priceSnapshot: {
    findMany(
      args: ProductPriceMovementSnapshotFindManyArgs,
    ): Promise<ProductPriceMovementSnapshotRecord[]>;
  };
}
