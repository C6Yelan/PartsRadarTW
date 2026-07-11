// apps/web/app/api/build-list/refresh/data.ts
// 定義配單 refresh API 的單次 Prisma select 與最小 read client contract。

import type { Prisma } from "@partsradar/db";

export const BUILD_LIST_REFRESH_SELECT = {
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
  isActive: true,
  lastSeenAt: true,
  sourceCategory: {
    select: {
      displayName: true,
    },
  },
  currentPrice: {
    select: {
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
        },
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

export type BuildListRefreshRecord = Prisma.ProductGetPayload<{
  select: typeof BUILD_LIST_REFRESH_SELECT;
}>;

type BuildListRefreshFindManyArgs = Omit<Prisma.ProductFindManyArgs, "select"> & {
  select: typeof BUILD_LIST_REFRESH_SELECT;
};

export interface BuildListRefreshReadClient {
  product: {
    findMany(args: BuildListRefreshFindManyArgs): Promise<BuildListRefreshRecord[]>;
  };
}
