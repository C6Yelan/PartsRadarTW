// apps/web/app/api/products/data.ts
import type { Prisma } from "@partsradar/db";

import type { SourceStatusReadClient } from "../source-status/handler";

export const PRODUCT_SELECT = {
  // Keep the list endpoint on public-safe fields only. ibuyToken is selected
  // only to build the outbound CoolPC purchase URL; it is not returned directly.
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
  primaryImageCheckedAt: true,
  introductionUrl: true,
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

export const PRODUCT_VENDOR_SELECT = {
  vendorSlug: true,
  vendorName: true,
} as const satisfies Prisma.ProductSelect;

export const PRODUCT_PRICE_MOVEMENT_RANGE_DAYS = 30;

export const PRODUCT_PRICE_MOVEMENT_SNAPSHOT_SELECT = {
  productId: true,
  price: true,
  currency: true,
  capturedAt: true,
} as const satisfies Prisma.PriceSnapshotSelect;

export type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;
export type ProductVendorRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_VENDOR_SELECT }>;
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
