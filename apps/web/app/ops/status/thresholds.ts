// apps/web/app/ops/status/thresholds.ts
// 解析 /ops/status 與 smoke 共用的健康檢查門檻 env，並提供整數 fallback helper。

import type { OpsStatusEnv, OpsStatusThresholds } from "./types";

const DEFAULT_SOURCE_WARN_AFTER_MINUTES = 60;
const DEFAULT_SOURCE_FAIL_AFTER_MINUTES = 120;
const DEFAULT_CRAWLER_WARN_AFTER_MINUTES = 90;
const DEFAULT_CRAWLER_FAIL_AFTER_MINUTES = 180;
const DEFAULT_RECENT_WINDOW_HOURS = 24;
const DEFAULT_PARSE_ERROR_WARN_COUNT = 20;
const DEFAULT_PARSE_ERROR_FAIL_COUNT = 100;
const DEFAULT_INVALID_IMAGE_URL_WARN_COUNT = 2000;
const DEFAULT_MIN_ACTIVE_PRODUCTS = 1;
const DEFAULT_MISSING_IMAGE_WARN_COUNT = 200;
const DEFAULT_MISSING_IMAGE_FAIL_COUNT = 500;
const DEFAULT_BROKEN_LINK_WARN_COUNT = 1;
const DEFAULT_BROKEN_LINK_FAIL_COUNT = 50;
const DEFAULT_TEMPORARY_LINK_WARN_COUNT = 100;
const DEFAULT_TEMPORARY_LINK_FAIL_COUNT = 500;
export const DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS = 30;
export const DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS = 90;
const DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS = 2;
const DEFAULT_RAW_SNAPSHOT_WARN_COUNT = 1;
const DEFAULT_RAW_SNAPSHOT_FAIL_COUNT = 100;

// 從 env 讀取 ops status 門檻；無效或缺漏值回退到程式預設。
export function readOpsStatusThresholds(env: OpsStatusEnv): OpsStatusThresholds {
  return {
    sourceWarnAfterMinutes: readPositiveInteger(
      env.SMOKE_SOURCE_WARN_AFTER_MINUTES,
      DEFAULT_SOURCE_WARN_AFTER_MINUTES,
    ),
    sourceFailAfterMinutes: readPositiveInteger(
      env.SMOKE_SOURCE_FAIL_AFTER_MINUTES,
      DEFAULT_SOURCE_FAIL_AFTER_MINUTES,
    ),
    crawlerWarnAfterMinutes: readPositiveInteger(
      env.SMOKE_CRAWLER_WARN_AFTER_MINUTES,
      DEFAULT_CRAWLER_WARN_AFTER_MINUTES,
    ),
    crawlerFailAfterMinutes: readPositiveInteger(
      env.SMOKE_CRAWLER_FAIL_AFTER_MINUTES,
      DEFAULT_CRAWLER_FAIL_AFTER_MINUTES,
    ),
    recentWindowHours: readPositiveInteger(
      env.SMOKE_RECENT_WINDOW_HOURS,
      DEFAULT_RECENT_WINDOW_HOURS,
    ),
    parseErrorWarnCount: readNonNegativeInteger(
      env.SMOKE_PARSE_ERROR_WARN_COUNT,
      DEFAULT_PARSE_ERROR_WARN_COUNT,
    ),
    parseErrorFailCount: readNonNegativeInteger(
      env.SMOKE_PARSE_ERROR_FAIL_COUNT,
      DEFAULT_PARSE_ERROR_FAIL_COUNT,
    ),
    invalidImageUrlWarnCount: readNonNegativeInteger(
      env.SMOKE_INVALID_IMAGE_URL_WARN_COUNT,
      DEFAULT_INVALID_IMAGE_URL_WARN_COUNT,
    ),
    minActiveProducts: readPositiveInteger(
      env.SMOKE_MIN_ACTIVE_PRODUCTS,
      DEFAULT_MIN_ACTIVE_PRODUCTS,
    ),
    missingImageWarnCount: readNonNegativeInteger(
      env.SMOKE_MISSING_IMAGE_WARN_COUNT,
      DEFAULT_MISSING_IMAGE_WARN_COUNT,
    ),
    missingImageFailCount: readNonNegativeInteger(
      env.SMOKE_MISSING_IMAGE_FAIL_COUNT,
      DEFAULT_MISSING_IMAGE_FAIL_COUNT,
    ),
    sourceBrokenLinkWarnCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_BROKEN_LINK_WARN_COUNT ?? env.SMOKE_BROKEN_LINK_WARN_COUNT,
      DEFAULT_BROKEN_LINK_WARN_COUNT,
    ),
    sourceBrokenLinkFailCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_BROKEN_LINK_FAIL_COUNT ?? env.SMOKE_BROKEN_LINK_FAIL_COUNT,
      DEFAULT_BROKEN_LINK_FAIL_COUNT,
    ),
    sourceTemporaryLinkWarnCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_TEMPORARY_LINK_WARN_COUNT ?? env.SMOKE_TEMPORARY_LINK_WARN_COUNT,
      DEFAULT_TEMPORARY_LINK_WARN_COUNT,
    ),
    sourceTemporaryLinkFailCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_TEMPORARY_LINK_FAIL_COUNT ?? env.SMOKE_TEMPORARY_LINK_FAIL_COUNT,
      DEFAULT_TEMPORARY_LINK_FAIL_COUNT,
    ),
    rawSnapshotNormalRetentionDays: readPositiveInteger(
      env.SMOKE_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
      DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
    ),
    rawSnapshotAbnormalRetentionDays: readPositiveInteger(
      env.SMOKE_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
      DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
    ),
    rawSnapshotRetentionGraceDays: readNonNegativeInteger(
      env.SMOKE_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
      DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
    ),
    rawSnapshotWarnCount: readNonNegativeInteger(
      env.SMOKE_RAW_SNAPSHOT_WARN_COUNT,
      DEFAULT_RAW_SNAPSHOT_WARN_COUNT,
    ),
    rawSnapshotFailCount: readNonNegativeInteger(
      env.SMOKE_RAW_SNAPSHOT_FAIL_COUNT,
      DEFAULT_RAW_SNAPSHOT_FAIL_COUNT,
    ),
  };
}

// 讀取正整數 env；空值、非數字或非正數時回退 fallback。
export function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = readInteger(value);

  return parsed && parsed > 0 ? parsed : fallback;
}

// 讀取非負整數 env；空值、非數字或負數時回退 fallback。
export function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = readInteger(value);

  return parsed !== null && parsed >= 0 ? parsed : fallback;
}

function readInteger(value: string | undefined): number | null {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) ? parsed : null;
}
