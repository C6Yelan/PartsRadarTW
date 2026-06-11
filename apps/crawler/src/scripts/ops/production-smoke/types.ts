// apps/crawler/src/scripts/ops/production-smoke/types.ts

import type { PrismaClient } from "@partsradar/db";

export type SmokeStatus = "OK" | "WARN" | "FAIL";

export interface ProductionSmokeOptions {
  workspaceRoot: string;
  baseUrl: string;
  publicOnly: boolean;
  timeoutMs: number;
  productImageStorageDir: string;
  productImageSampleSize: number;
  sourceWarnAfterMinutes: number;
  sourceFailAfterMinutes: number;
  crawlerWarnAfterMinutes: number;
  crawlerFailAfterMinutes: number;
  recentWindowHours: number;
  parseErrorWarnCount: number;
  parseErrorFailCount: number;
  invalidImageUrlWarnCount: number;
  minActiveProducts: number;
  missingImageWarnCount: number;
  missingImageFailCount: number;
  sourceBrokenLinkWarnCount: number;
  sourceBrokenLinkFailCount: number;
  sourceTemporaryLinkWarnCount: number;
  sourceTemporaryLinkFailCount: number;
  rawSnapshotNormalRetentionDays: number;
  rawSnapshotAbnormalRetentionDays: number;
  rawSnapshotRetentionGraceDays: number;
  rawSnapshotWarnCount: number;
  rawSnapshotFailCount: number;
}

export interface SmokeCheckResult {
  name: string;
  status: SmokeStatus;
  message: string;
}

export interface ProductionSmokeSummary {
  checkedAt: Date;
  status: SmokeStatus;
  checks: SmokeCheckResult[];
}

export interface ProductsResponse {
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

export interface CategoriesResponse {
  data: Array<{
    igrp: number;
  }>;
}

export interface SourceStatusResponse {
  status: string;
  lastSuccessAt: string | null;
}

export interface PriceHistoryResponse {
  points: unknown[];
}

export interface ProductDetailResponse {
  id: string;
}

export interface RateLimitHeaderSnapshot {
  clientSource: string;
  limit: number;
  remaining: number;
  reset: number;
}

export interface SourceImageAnomalyRecord {
  rawToken: string | null;
  rawName: string | null;
  rawImageUrl: string | null;
}

export type ProductionSmokeClient = Pick<
  PrismaClient,
  "crawlRun" | "parseError" | "product" | "productLinkHealth" | "rawSnapshot"
>;
