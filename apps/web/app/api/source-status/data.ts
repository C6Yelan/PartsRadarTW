// apps/web/app/api/source-status/data.ts
export interface SourceStatusCategoryRecord {
  igrp: number;
  displayName: string;
  sourceName: string;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  products: { id: string }[];
}

interface SourceStatusFindManyArgs {
  where: {
    enabled: true;
  };
  orderBy: {
    igrp: "asc";
  };
  select: {
    igrp: true;
    displayName: true;
    sourceName: true;
    lastCheckedAt: true;
    lastSuccessAt: true;
    products: {
      where: {
        isActive: true;
        currentPrice: {
          isNot: null;
        };
      };
      select: {
        id: true;
      };
      take: 1;
    };
  };
}

export const SOURCE_STATUS_CATEGORY_QUERY = {
  where: { enabled: true },
  orderBy: { igrp: "asc" },
  select: {
    igrp: true,
    displayName: true,
    sourceName: true,
    lastCheckedAt: true,
    lastSuccessAt: true,
    products: {
      where: {
        isActive: true,
        currentPrice: {
          isNot: null,
        },
      },
      select: {
        id: true,
      },
      take: 1,
    },
  },
} as const satisfies SourceStatusFindManyArgs;

export interface SourceStatusReadClient {
  sourceCategory: {
    findMany(args: SourceStatusFindManyArgs): Promise<SourceStatusCategoryRecord[]>;
  };
}
