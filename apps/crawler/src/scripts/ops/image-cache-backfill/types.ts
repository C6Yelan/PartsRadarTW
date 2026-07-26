import type { PrismaClient } from "@partsradar/db";
import type { SourceImageFailureKind } from "./image-files";

export interface ProductImageCandidate {
  id: string;
  name: string;
  isActive: boolean;
  primaryImageUrl: string | null;
  primaryImageCheckedAt: Date | null;
  imageCachedAt: Date | null;
  imageCacheCheckedAt: Date | null;
  imageCacheFailureCount: number;
  imageCacheFailureSince: Date | null;
  imageCacheNextRetryAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  priceSnapshots: Array<{ capturedAt: Date }>;
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

export type ProcessStatus = "cached" | "dry-run" | "failed" | "invalid" | "reused" | "skipped";

export interface ProcessResult {
  status: ProcessStatus;
  didRequestSource: boolean;
  errorMessage?: string;
  errorKind?: SourceImageFailureKind | "invalid_url" | "unknown";
  httpStatus?: number | null;
}

export type ImageCacheStateClient = Pick<PrismaClient, "product">;

export interface ImageRecoverySelectionTelemetry {
  neverCheckedRead: number;
  retryDueRead: number;
  auditRead: number;
  reconciledExisting: number;
  selectedForBackfill: number;
}

export interface ImageRecoveryBatch {
  candidates: ProductImageCandidate[];
  telemetry: ImageRecoverySelectionTelemetry;
}
