// apps/crawler/src/scripts/ops/discord-bot/watch/records.ts
// 定義目標價 watch 流程共用的 Prisma select、查詢 payload 型別與操作結果 contract。

import type { Prisma } from "@partsradar/db";

// watch 訊息只需要商品名稱與目前價格資料，避免查出不必要商品欄位。
export const TARGET_PRICE_WATCH_PRODUCT_SELECT = {
  id: true,
  name: true,
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
} as const satisfies Prisma.ProductSelect;

// 新增或重新啟用 watch 後回傳的 watch 欄位。
export const TARGET_PRICE_WATCH_SELECT = {
  id: true,
  targetPrice: true,
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

// watch 管理清單與單筆查詢共用的欄位。
export const TARGET_PRICE_WATCH_LIST_SELECT = {
  id: true,
  targetPrice: true,
  product: {
    select: TARGET_PRICE_WATCH_PRODUCT_SELECT,
  },
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

// 管理面板只顯示最近一次通知的使用者可見狀態，不讀取完整 delivery payload。
export const TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT = {
  status: true,
  errorCategory: true,
  httpStatus: true,
  providerErrorCode: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

type TargetPriceWatchProductRecord = Prisma.ProductGetPayload<{
  select: typeof TARGET_PRICE_WATCH_PRODUCT_SELECT;
}>;
type SavedTargetPriceWatchRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_SELECT;
}>;
export type TargetPriceWatchListRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_LIST_SELECT;
}>;
export type TargetPriceWatchDeliveryStatus = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT;
}>;

// 建立 watch 的 domain result，讓 handler 能區分輸入錯誤、商品狀態與成功寫入。
export type CreateTargetPriceWatchResult =
  | {
      status: "invalid_product_reference";
    }
  | {
      status: "invalid_target_price";
    }
  | {
      status: "product_not_found";
      productId: string;
    }
  | {
      status: "watch_limit_reached";
      maxWatches: number;
    }
  | {
      status: "saved";
      product: TargetPriceWatchProductRecord;
      watch: SavedTargetPriceWatchRecord;
      currentPrice: number;
      capturedAt: Date;
      reached: boolean;
    };

// watch 管理清單的資料 contract，包含當頁資料、總筆數與分頁旗標。
export interface TargetPriceWatchlistResult {
  watches: TargetPriceWatchListRecord[];
  page: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

// 停用單筆 watch 的結果，成功時回傳停用前的 watch 供確認訊息使用。
export type DisableTargetPriceWatchResult =
  | {
      status: "invalid_reference";
    }
  | {
      status: "not_found";
    }
  | {
      status: "disabled";
      watch: TargetPriceWatchListRecord;
    };

// 依 watch reference 查詢單筆 watch 的結果，限定同一 Discord 使用者與啟用狀態。
export type TargetPriceWatchLookupResult =
  | {
      status: "invalid_reference";
    }
  | {
      status: "not_found";
    }
  | {
      status: "found";
      watch: TargetPriceWatchListRecord;
    };

// 更新 watch 目標價的結果，成功時回傳更新後可直接重繪面板的 watch 資料。
export type UpdateTargetPriceWatchResult =
  | {
      status: "invalid_reference" | "invalid_target_price" | "not_found";
    }
  | {
      status: "updated";
      watch: TargetPriceWatchListRecord;
    };
