// apps/crawler/src/scripts/ops/production-smoke/types.ts
// 定義 production smoke 的執行設定、檢查結果、API 最小回應 shape 與 DB client contract。

import type { PrismaClient } from "@partsradar/db";

export type SmokeStatus = "OK" | "WARN" | "FAIL";

// production smoke CLI / daemon 共用的執行設定，涵蓋 public HTTP、DB freshness 與資料品質門檻。
export interface ProductionSmokeOptions {
  workspaceRoot: string;
  baseUrl: string;
  publicOnly: boolean;
  timeoutMs: number;
  filterSyncStateFilePath: string | null;
  crawlerRuntimeStatusFilePath: string | null;
  rawSnapshotCleanupRuntimeStatusFilePath: string | null;
  productImageStorageDir: string;
  productImageSampleSize: number;
  imageInactiveRetentionDays: number;
  sourceWarnAfterMinutes: number;
  sourceFailAfterMinutes: number;
  crawlerWarnAfterMinutes: number;
  crawlerFailAfterMinutes: number;
  recentWindowHours: number;
  parseErrorWarnCount: number;
  parseErrorFailCount: number;
  sourceImageFailureMinConsecutive: number;
  sourceImageFailureWarnCount: number;
  sourceImageFailureFailCount: number;
  minActiveProducts: number;
  filterEmptyWarnMinCount: number;
  filterEmptyWarnRatio: number;
  missingImageWarnCount: number;
  missingImageFailCount: number;
  rawSnapshotNormalRetentionDays: number;
  rawSnapshotAbnormalRetentionDays: number;
  rawSnapshotRetentionGraceDays: number;
  rawSnapshotWarnCount: number;
  rawSnapshotFailCount: number;
}

// 單一 smoke check 的標準輸出，供 CLI summary 與 Discord admin webhook 共用。
export interface SmokeCheckResult {
  name: string;
  status: SmokeStatus;
  message: string;
}

// 單輪 production smoke 的整體結果。
export interface ProductionSmokeSummary {
  checkedAt: Date;
  status: SmokeStatus;
  checks: SmokeCheckResult[];
}

// 商品列表 API 在 smoke 中需要驗證的最小 response shape。
export interface SmokeProductsResponse {
  data: Array<{
    id: string;
    image?: {
      url?: string;
    } | null;
    priceMovement?: {
      rangeDays?: number;
      deltaAmount?: number | null;
      deltaPercent?: number | null;
    };
  }>;
  pagination: {
    totalItems: number;
  };
}

// 分類 API 在 smoke 中需要驗證的最小 response shape。
export interface SmokeCategoriesResponse {
  data: Array<{
    slug: string;
    facets: Array<{
      key: string;
      options: Array<{ value: string }>;
    }>;
  }>;
}

// source-status API 在 smoke 中需要驗證的最小 response shape。
export interface SmokeSourceStatusResponse {
  status: string;
  lastSuccessAt: string | null;
}

// 價格歷史 API 在 smoke 中需要驗證的最小 response shape。
export interface SmokePriceHistoryResponse {
  points: unknown[];
}

// 商品詳細 API 在 smoke 中需要驗證的最小 response shape。
export interface SmokeProductDetailResponse {
  id: string;
}

// public API rate limit headers 的解析結果。
export interface RateLimitHeaderSnapshot {
  clientSource: string;
  limit: number;
  remaining: number;
  reset: number;
}

// production smoke 只依賴檢查所需的 Prisma delegates，不綁定其他資料存取能力。
export type ProductionSmokeClient = Pick<
  PrismaClient,
  | "crawlRun"
  | "discordNotificationDelivery"
  | "discordPublicPriceReportDelivery"
  | "discordPublicPriceReportSetting"
  | "parseError"
  | "product"
  | "rawSnapshot"
>;
