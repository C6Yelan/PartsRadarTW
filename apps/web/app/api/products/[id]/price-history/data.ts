// apps/web/app/api/products/[id]/price-history/data.ts
// 定義商品價格歷史 API 使用的 Prisma select、回傳型別與窄 read client contract。

import type { Prisma } from "@partsradar/db";

export const PRICE_HISTORY_SNAPSHOT_SELECT = {
  price: true,
  capturedAt: true,
} as const satisfies Prisma.PriceSnapshotSelect;

export const PRICE_HISTORY_PRODUCT_SELECT = {
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
        },
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

// 限定價格歷史 handler 需要的 DB 讀取面，不依賴完整 Prisma client。
export interface ProductPriceHistoryReadClient {
  product: {
    findFirst(args: ProductFindFirstArgs): Promise<PriceHistoryProductRecord | null>;
  };
  priceSnapshot: {
    findMany(args: PriceSnapshotFindManyArgs): Promise<PriceHistorySnapshotRecord[]>;
  };
}
