// apps/web/app/api/products/[id]/price-history/data.ts
import type { Prisma } from "@partsradar/db";

export const PRICE_HISTORY_SNAPSHOT_SELECT = {
  price: true,
  currency: true,
  capturedAt: true,
} as const satisfies Prisma.PriceSnapshotSelect;

export const PRICE_HISTORY_PRODUCT_SELECT = {
  id: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: PRICE_HISTORY_SNAPSHOT_SELECT,
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

export type PriceHistoryProductRecord = Prisma.ProductGetPayload<{
  select: typeof PRICE_HISTORY_PRODUCT_SELECT;
}>;
export type PriceHistorySnapshotRecord = Prisma.PriceSnapshotGetPayload<{
  select: typeof PRICE_HISTORY_SNAPSHOT_SELECT;
}>;

type ProductFindFirstArgs = Omit<Prisma.ProductFindFirstArgs, "select"> & {
  select: typeof PRICE_HISTORY_PRODUCT_SELECT;
};
type PriceSnapshotFindManyArgs = Omit<Prisma.PriceSnapshotFindManyArgs, "select"> & {
  select: typeof PRICE_HISTORY_SNAPSHOT_SELECT;
};

export interface ProductPriceHistoryReadClient {
  product: {
    findFirst(args: ProductFindFirstArgs): Promise<PriceHistoryProductRecord | null>;
  };
  priceSnapshot: {
    findMany(args: PriceSnapshotFindManyArgs): Promise<PriceHistorySnapshotRecord[]>;
  };
}
