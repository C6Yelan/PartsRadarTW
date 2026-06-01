import type { Prisma } from "@partsradar/db";

import type { SourceStatusReadClient } from "../source-status/handler";

export const PRODUCT_SELECT = {
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

export const PRODUCT_VENDOR_SELECT = {
  vendorSlug: true,
  vendorName: true,
} as const satisfies Prisma.ProductSelect;

export type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;
export type ProductVendorRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_VENDOR_SELECT }>;

type ProductFindManyArgs<TSelect extends Prisma.ProductSelect> = Omit<
  Prisma.ProductFindManyArgs,
  "select"
> & {
  select: TSelect;
};

export type ProductListFindManyArgs = ProductFindManyArgs<typeof PRODUCT_SELECT>;
export type ProductVendorFindManyArgs = ProductFindManyArgs<typeof PRODUCT_VENDOR_SELECT>;

export interface ProductsReadClient extends SourceStatusReadClient {
  product: {
    findProducts(args: ProductListFindManyArgs): Promise<ProductRecord[]>;
    findVendorOptions(args: ProductVendorFindManyArgs): Promise<ProductVendorRecord[]>;
    count(args: Prisma.ProductCountArgs): Promise<number>;
  };
}
