// apps/web/app/api/source-status/data.ts
// 定義來源狀態 API 使用的分類查詢 projection 與可測試 read client contract。

// source-status response 判斷分類可用性所需的最小 sourceCategory 資料。
export interface SourceStatusCategoryRecord {
  igrp: number;
  displayName: string;
  sourceName: string;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  products: { id: string }[];
}

// 固定 source-status 查詢欄位，避免 route、handler 與產品列表 meta 的來源狀態判斷漂移。
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

// 只查啟用分類，並用最多一筆 active/current-price 商品判斷該分類是否仍有可顯示資料。
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

// source-status handler 依賴的窄 client，讓 API 行為測試不直接依賴 Prisma client。
export interface SourceStatusReadClient {
  sourceCategory: {
    findMany(args: SourceStatusFindManyArgs): Promise<SourceStatusCategoryRecord[]>;
  };
}
