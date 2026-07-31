// packages/db/src/target-price-notification/types.ts
// 定義目標價通知 bounded scan 與 atomic claim 的資料庫契約。

import type { Prisma } from "@prisma/client";

export interface TargetPriceNotificationClaimQueryClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

export interface TargetPriceNotificationClaimClient {
  $transaction<T>(
    callback: (transaction: TargetPriceNotificationClaimQueryClient) => Promise<T>,
  ): Promise<T>;
}

export interface TargetPriceNotificationWatch {
  id: string;
  discordUserId: string;
  productId: string;
  targetPrice: number;
  currency: string;
  notificationCursorAt: Date | null;
  updatedAt: Date;
  product: {
    id: string;
    name: string;
    currentPrice: {
      priceSnapshot: {
        price: number;
        currency: string;
        capturedAt: Date;
      };
    };
  };
}

export interface TargetPriceNotificationClaimBatch {
  scannedCount: number;
  watches: TargetPriceNotificationWatch[];
}

export interface TargetPriceNotificationScanState {
  cursorUpdatedAt: Date | null;
  cursorWatchId: string | null;
  roundUpperUpdatedAt: Date | null;
  roundUpperWatchId: string | null;
}

export interface ClaimDueTargetPriceNotificationsOptions {
  claimedAt: Date;
  staleClaimBefore: Date;
  scanLimit: number;
  claimLimit: number;
}
