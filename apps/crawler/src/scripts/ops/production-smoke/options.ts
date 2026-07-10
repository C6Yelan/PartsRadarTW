// apps/crawler/src/scripts/ops/production-smoke/options.ts
// 解析 production smoke 的 CLI 參數、env override 與工作區路徑設定。

import {
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import {
  DEFAULT_BASE_URL,
  DEFAULT_CRAWLER_FAIL_AFTER_MINUTES,
  DEFAULT_CRAWLER_WARN_AFTER_MINUTES,
  DEFAULT_INVALID_IMAGE_URL_WARN_COUNT,
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
  DEFAULT_SOURCE_WARN_AFTER_MINUTES,
  DEFAULT_TIMEOUT_MS,
  HELP_FLAG,
  PUBLIC_ONLY_FLAG,
} from "./constants";
import { printProductionSmokeHelp } from "./options/help";
import { normalizeBaseUrl, parseIntegerOption } from "./options/values";
import type { ProductionSmokeOptions } from "./types";

export { printProductionSmokeHelp } from "./options/help";

// 將 CLI args 與 env 組合成 production smoke 執行設定，並套用各檢查項目的安全上下限。
export function parseProductionSmokeOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ProductionSmokeOptions {
  if (args.includes(HELP_FLAG)) {
    printProductionSmokeHelp();
    process.exit(0);
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const baseUrl = normalizeBaseUrl(
    getStringArg(args, "--base-url") ?? env.SMOKE_PUBLIC_BASE_URL ?? DEFAULT_BASE_URL,
  );

  return {
    workspaceRoot,
    baseUrl,
    publicOnly: args.includes(PUBLIC_ONLY_FLAG),
    timeoutMs: parseIntegerOption({
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
    productImageSampleSize: parseIntegerOption({
      args,
      env,
      argName: "--product-image-sample-size",
      envName: "SMOKE_PRODUCT_IMAGE_SAMPLE_SIZE",
      fallback: DEFAULT_PRODUCT_IMAGE_SAMPLE_SIZE,
      min: 1,
      max: 50,
    }),
    sourceWarnAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--source-warn-after-minutes",
      envName: "SMOKE_SOURCE_WARN_AFTER_MINUTES",
      fallback: DEFAULT_SOURCE_WARN_AFTER_MINUTES,
      min: 1,
      max: 24 * 60,
    }),
    sourceFailAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--source-fail-after-minutes",
      envName: "SMOKE_SOURCE_FAIL_AFTER_MINUTES",
      fallback: DEFAULT_SOURCE_FAIL_AFTER_MINUTES,
      min: 1,
      max: 7 * 24 * 60,
    }),
    crawlerWarnAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--crawler-warn-after-minutes",
      envName: "SMOKE_CRAWLER_WARN_AFTER_MINUTES",
      fallback: DEFAULT_CRAWLER_WARN_AFTER_MINUTES,
      min: 1,
      max: 7 * 24 * 60,
    }),
    crawlerFailAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--crawler-fail-after-minutes",
      envName: "SMOKE_CRAWLER_FAIL_AFTER_MINUTES",
      fallback: DEFAULT_CRAWLER_FAIL_AFTER_MINUTES,
      min: 1,
      max: 14 * 24 * 60,
    }),
    recentWindowHours: parseIntegerOption({
      args,
      env,
      argName: "--recent-window-hours",
      envName: "SMOKE_RECENT_WINDOW_HOURS",
      fallback: DEFAULT_RECENT_WINDOW_HOURS,
      min: 1,
      max: 30 * 24,
    }),
    parseErrorWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--parse-error-warn-count",
      envName: "SMOKE_PARSE_ERROR_WARN_COUNT",
      fallback: DEFAULT_PARSE_ERROR_WARN_COUNT,
      min: 0,
      max: 100000,
    }),
    parseErrorFailCount: parseIntegerOption({
      args,
      env,
      argName: "--parse-error-fail-count",
      envName: "SMOKE_PARSE_ERROR_FAIL_COUNT",
      fallback: DEFAULT_PARSE_ERROR_FAIL_COUNT,
      min: 0,
      max: 100000,
    }),
    invalidImageUrlWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--invalid-image-url-warn-count",
      envName: "SMOKE_INVALID_IMAGE_URL_WARN_COUNT",
      // Normal production baseline is roughly 624 invalid source image URLs
      // per 24h. Warn at a little over 3x that baseline so fixed third-party
      // source noise stays informational while spikes remain visible.
      fallback: DEFAULT_INVALID_IMAGE_URL_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    minActiveProducts: parseIntegerOption({
      args,
      env,
      argName: "--min-active-products",
      envName: "SMOKE_MIN_ACTIVE_PRODUCTS",
      fallback: DEFAULT_MIN_ACTIVE_PRODUCTS,
      min: 1,
      max: 1000000,
    }),
    missingImageWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--missing-image-warn-count",
      envName: "SMOKE_MISSING_IMAGE_WARN_COUNT",
      fallback: DEFAULT_MISSING_IMAGE_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    missingImageFailCount: parseIntegerOption({
      args,
      env,
      argName: "--missing-image-fail-count",
      envName: "SMOKE_MISSING_IMAGE_FAIL_COUNT",
      fallback: DEFAULT_MISSING_IMAGE_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
    rawSnapshotNormalRetentionDays: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-normal-retention-days",
      envName: "SMOKE_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
      min: 1,
      max: 365,
    }),
    rawSnapshotAbnormalRetentionDays: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-abnormal-retention-days",
      envName: "SMOKE_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
      min: 1,
      max: 365,
    }),
    rawSnapshotRetentionGraceDays: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-retention-grace-days",
      envName: "SMOKE_RAW_SNAPSHOT_RETENTION_GRACE_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
      min: 0,
      max: 30,
    }),
    rawSnapshotWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-warn-count",
      envName: "SMOKE_RAW_SNAPSHOT_WARN_COUNT",
      fallback: DEFAULT_RAW_SNAPSHOT_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    rawSnapshotFailCount: parseIntegerOption({
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
