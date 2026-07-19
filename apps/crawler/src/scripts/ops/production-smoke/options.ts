// apps/crawler/src/scripts/ops/production-smoke/options.ts
// 解析 production smoke 的 CLI 參數、env override 與工作區路徑設定。

import {
  getStringArg,
  parseBoundedIntegerOption,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import { DEFAULT_INACTIVE_IMAGE_RETENTION_DAYS } from "../shared/image-retention";
import {
  DEFAULT_BASE_URL,
  DEFAULT_CRAWLER_FAIL_AFTER_MINUTES,
  DEFAULT_CRAWLER_WARN_AFTER_MINUTES,
  DEFAULT_FILTER_EMPTY_WARN_MIN_COUNT,
  DEFAULT_FILTER_EMPTY_WARN_RATIO,
  DEFAULT_MIN_ACTIVE_PRODUCTS,
  DEFAULT_MISSING_IMAGE_FAIL_COUNT,
  DEFAULT_MISSING_IMAGE_WARN_COUNT,
  DEFAULT_PARSE_ERROR_FAIL_COUNT,
  DEFAULT_PARSE_ERROR_WARN_COUNT,
  DEFAULT_PRODUCT_IMAGE_SAMPLE_SIZE,
  DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
  DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
  DEFAULT_RAW_SNAPSHOT_FAIL_COUNT,
  DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
  DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
  DEFAULT_RAW_SNAPSHOT_WARN_COUNT,
  DEFAULT_RECENT_WINDOW_HOURS,
  DEFAULT_SOURCE_FAIL_AFTER_MINUTES,
  DEFAULT_SOURCE_IMAGE_FAILURE_FAIL_COUNT,
  DEFAULT_SOURCE_IMAGE_FAILURE_MIN_CONSECUTIVE,
  DEFAULT_SOURCE_IMAGE_FAILURE_WARN_COUNT,
  DEFAULT_SOURCE_WARN_AFTER_MINUTES,
  DEFAULT_TIMEOUT_MS,
  PUBLIC_ONLY_FLAG,
} from "./constants";
import type { ProductionSmokeOptions } from "./types";

// 正規化公開網站 smoke test 的 base URL，只允許 HTTP(S) 端點。
function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return url.toString();
  } catch {
    throw new Error("--base-url/SMOKE_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }
}

// 將 CLI args 與 env 組合成 production smoke 執行設定，並套用各檢查項目的安全上下限。
export function parseProductionSmokeOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ProductionSmokeOptions {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const baseUrl = normalizeBaseUrl(
    getStringArg(args, "--base-url") ?? env.SMOKE_PUBLIC_BASE_URL ?? DEFAULT_BASE_URL,
  );
  const filterSyncStateFile =
    getStringArg(args, "--filter-sync-state-file") ?? env.SMOKE_FILTER_SYNC_STATE_FILE;
  const crawlerRuntimeStatusFile = env.SMOKE_CRAWLER_RUNTIME_STATUS_FILE;

  return {
    workspaceRoot,
    baseUrl,
    publicOnly: args.includes(PUBLIC_ONLY_FLAG),
    filterSyncStateFilePath: filterSyncStateFile
      ? resolveWorkspacePathArgument(workspaceRoot, filterSyncStateFile)
      : null,
    crawlerRuntimeStatusFilePath: crawlerRuntimeStatusFile
      ? resolveWorkspacePathArgument(workspaceRoot, crawlerRuntimeStatusFile)
      : null,
    timeoutMs: parseBoundedIntegerOption({
      args,
      env,
      argName: "--timeout-ms",
      envName: "SMOKE_TIMEOUT_MS",
      fallback: DEFAULT_TIMEOUT_MS,
      min: 1000,
      max: 60000,
    }),
    productImageStorageDir: resolveWorkspacePathArgument(
      workspaceRoot,
      getStringArg(args, "--product-image-storage-dir") ??
        env.PRODUCT_IMAGE_STORAGE_DIR ??
        DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
    ),
    productImageSampleSize: parseBoundedIntegerOption({
      args,
      env,
      argName: "--product-image-sample-size",
      envName: "SMOKE_PRODUCT_IMAGE_SAMPLE_SIZE",
      fallback: DEFAULT_PRODUCT_IMAGE_SAMPLE_SIZE,
      min: 1,
      max: 50,
    }),
    imageInactiveRetentionDays: parseBoundedIntegerOption({
      args,
      env,
      argName: "--image-inactive-retention-days",
      envName: "IMAGE_CACHE_INACTIVE_RETENTION_DAYS",
      fallback: DEFAULT_INACTIVE_IMAGE_RETENTION_DAYS,
      min: 0,
      max: 3650,
    }),
    sourceWarnAfterMinutes: parseBoundedIntegerOption({
      args,
      env,
      argName: "--source-warn-after-minutes",
      envName: "SMOKE_SOURCE_WARN_AFTER_MINUTES",
      fallback: DEFAULT_SOURCE_WARN_AFTER_MINUTES,
      min: 1,
      max: 24 * 60,
    }),
    sourceFailAfterMinutes: parseBoundedIntegerOption({
      args,
      env,
      argName: "--source-fail-after-minutes",
      envName: "SMOKE_SOURCE_FAIL_AFTER_MINUTES",
      fallback: DEFAULT_SOURCE_FAIL_AFTER_MINUTES,
      min: 1,
      max: 7 * 24 * 60,
    }),
    crawlerWarnAfterMinutes: parseBoundedIntegerOption({
      args,
      env,
      argName: "--crawler-warn-after-minutes",
      envName: "SMOKE_CRAWLER_WARN_AFTER_MINUTES",
      fallback: DEFAULT_CRAWLER_WARN_AFTER_MINUTES,
      min: 1,
      max: 7 * 24 * 60,
    }),
    crawlerFailAfterMinutes: parseBoundedIntegerOption({
      args,
      env,
      argName: "--crawler-fail-after-minutes",
      envName: "SMOKE_CRAWLER_FAIL_AFTER_MINUTES",
      fallback: DEFAULT_CRAWLER_FAIL_AFTER_MINUTES,
      min: 1,
      max: 14 * 24 * 60,
    }),
    recentWindowHours: parseBoundedIntegerOption({
      args,
      env,
      argName: "--recent-window-hours",
      envName: "SMOKE_RECENT_WINDOW_HOURS",
      fallback: DEFAULT_RECENT_WINDOW_HOURS,
      min: 1,
      max: 30 * 24,
    }),
    parseErrorWarnCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--parse-error-warn-count",
      envName: "SMOKE_PARSE_ERROR_WARN_COUNT",
      fallback: DEFAULT_PARSE_ERROR_WARN_COUNT,
      min: 0,
      max: 100000,
    }),
    parseErrorFailCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--parse-error-fail-count",
      envName: "SMOKE_PARSE_ERROR_FAIL_COUNT",
      fallback: DEFAULT_PARSE_ERROR_FAIL_COUNT,
      min: 0,
      max: 100000,
    }),
    sourceImageFailureMinConsecutive: parseBoundedIntegerOption({
      args,
      env,
      argName: "--source-image-failure-min-consecutive",
      envName: "SMOKE_SOURCE_IMAGE_FAILURE_MIN_CONSECUTIVE",
      fallback: DEFAULT_SOURCE_IMAGE_FAILURE_MIN_CONSECUTIVE,
      min: 1,
      max: 5,
    }),
    sourceImageFailureWarnCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--source-image-failure-warn-count",
      envName: "SMOKE_SOURCE_IMAGE_FAILURE_WARN_COUNT",
      fallback: DEFAULT_SOURCE_IMAGE_FAILURE_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    sourceImageFailureFailCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--source-image-failure-fail-count",
      envName: "SMOKE_SOURCE_IMAGE_FAILURE_FAIL_COUNT",
      fallback: DEFAULT_SOURCE_IMAGE_FAILURE_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
    minActiveProducts: parseBoundedIntegerOption({
      args,
      env,
      argName: "--min-active-products",
      envName: "SMOKE_MIN_ACTIVE_PRODUCTS",
      fallback: DEFAULT_MIN_ACTIVE_PRODUCTS,
      min: 1,
      max: 1000000,
    }),
    filterEmptyWarnMinCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--filter-empty-warn-min-count",
      envName: "SMOKE_FILTER_EMPTY_WARN_MIN_COUNT",
      fallback: DEFAULT_FILTER_EMPTY_WARN_MIN_COUNT,
      min: 0,
      max: 1000000,
    }),
    filterEmptyWarnRatio: parseRatioOption(
      getStringArg(args, "--filter-empty-warn-ratio") ??
        env.SMOKE_FILTER_EMPTY_WARN_RATIO ??
        String(DEFAULT_FILTER_EMPTY_WARN_RATIO),
    ),
    missingImageWarnCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--missing-image-warn-count",
      envName: "SMOKE_MISSING_IMAGE_WARN_COUNT",
      fallback: DEFAULT_MISSING_IMAGE_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    missingImageFailCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--missing-image-fail-count",
      envName: "SMOKE_MISSING_IMAGE_FAIL_COUNT",
      fallback: DEFAULT_MISSING_IMAGE_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
    rawSnapshotNormalRetentionDays: parseBoundedIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-normal-retention-days",
      envName: "SMOKE_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
      min: 1,
      max: 365,
    }),
    rawSnapshotAbnormalRetentionDays: parseBoundedIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-abnormal-retention-days",
      envName: "SMOKE_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
      min: 1,
      max: 365,
    }),
    rawSnapshotRetentionGraceDays: parseBoundedIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-retention-grace-days",
      envName: "SMOKE_RAW_SNAPSHOT_RETENTION_GRACE_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
      min: 0,
      max: 30,
    }),
    rawSnapshotWarnCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-warn-count",
      envName: "SMOKE_RAW_SNAPSHOT_WARN_COUNT",
      fallback: DEFAULT_RAW_SNAPSHOT_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    rawSnapshotFailCount: parseBoundedIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-fail-count",
      envName: "SMOKE_RAW_SNAPSHOT_FAIL_COUNT",
      fallback: DEFAULT_RAW_SNAPSHOT_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
  };
}

function parseRatioOption(raw: string): number {
  const message =
    "--filter-empty-warn-ratio/SMOKE_FILTER_EMPTY_WARN_RATIO must be a number between 0 and 1.";

  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(message);
  }

  return value;
}
