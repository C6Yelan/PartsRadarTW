// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/options.ts
// 解析 scheduled CoolPC crawler daemon 的 CLI/env 設定，集中管理排程、外部抓取鎖與新商品圖片補圖參數。

import {
  DEFAULT_COOLPC_CATEGORY_DELAY_MS,
  validateCoolpcBaseUrl,
} from "../../../coolpc/live-crawl";
import {
  DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
  resolveAllowlistedRawSnapshotStorage,
} from "../../../coolpc/raw-snapshot-storage";
import {
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import { DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS } from "../external-fetch-lock";

export const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
export const DEFAULT_STORAGE_DIR = DEFAULT_RAW_SNAPSHOT_STORAGE_DIR;
export const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "storage/product-images";
export const DEFAULT_INTERVAL_SECONDS = 1800;
export const DEFAULT_BACKOFF_SECONDS = 3600;
export const DEFAULT_LOCK_RETRY_SECONDS = 120;
export const DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS = 5000;
export const DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS = 12000;
export const DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS = 15000;
export const DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MIN_INTERVAL_SECONDS = 60;
export const MIN_BACKOFF_SECONDS = 60;
export const MIN_LOCK_RETRY_SECONDS = 30;
export const MAX_LOCK_RETRY_SECONDS = 600;
export const MIN_CATEGORY_DELAY_MS = 3000;
export const MAX_CATEGORY_DELAY_MS = 60000;
export const MIN_NEW_PRODUCT_IMAGE_DELAY_MS = 1000;
export const MAX_NEW_PRODUCT_IMAGE_DELAY_MS = 60000;
export const MIN_NEW_PRODUCT_IMAGE_TIMEOUT_MS = 1000;
export const MAX_NEW_PRODUCT_IMAGE_TIMEOUT_MS = 120000;
export const MIN_NEW_PRODUCT_IMAGE_SOURCE_BYTES = 64 * 1024;
export const MAX_NEW_PRODUCT_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024;

// scheduled crawler 每輪成功後針對本輪新增商品執行圖片補圖所需的設定。
export interface NewProductImageBackfillOptions {
  workspaceRoot: string;
  storageDir: string;
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  maxSourceBytes: number;
}

// scheduled CoolPC crawler daemon 的完整執行設定，供 CLI entrypoint 與測試共用。
export interface CoolpcDaemonOptions {
  workspaceRoot: string;
  storageDir: string;
  intervalSeconds: number;
  backoffSeconds: number;
  categoryDelayMs: number;
  lockDir: string;
  lockStaleSeconds: number;
  lockRetrySeconds: number;
  runOnce: boolean;
  baseUrl?: string;
  newProductImageBackfill: NewProductImageBackfillOptions;
}

// 共用整數 option parser 的輸入契約，讓 CLI arg、env、default 與上下限驗證維持一致。
interface ParseIntegerOption {
  args: string[];
  argName: string;
  env: NodeJS.ProcessEnv;
  envName: string;
  fallback: number;
  min: number;
  max?: number;
}

// 解析 scheduled crawler daemon 設定；live fetch 必須顯式確認，且 base URL 僅允許 env 內的官方 CoolPC 位址。
export function parseDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): CoolpcDaemonOptions {
  if (args.includes("--base-url")) {
    throw new Error("Scheduled CoolPC crawler does not accept --base-url overrides.");
  }

  if (!args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing scheduled CoolPC live fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this daemon contacts the source site repeatedly.`,
    );
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const { storageDir } = resolveAllowlistedRawSnapshotStorage({
    workspaceRoot,
    requestedDir:
      getStringArg(args, "--storage-dir") ?? env.SNAPSHOT_STORAGE_DIR ?? DEFAULT_STORAGE_DIR,
    configuredDir: env.SNAPSHOT_STORAGE_DIR,
  });
  const newProductImageBackfill = parseNewProductImageBackfillOptions(args, env, workspaceRoot);

  return {
    workspaceRoot,
    storageDir,
    intervalSeconds: parseIntegerOption({
      args,
      argName: "--interval-seconds",
      env,
      envName: "CRAWLER_INTERVAL_SECONDS",
      fallback: DEFAULT_INTERVAL_SECONDS,
      min: MIN_INTERVAL_SECONDS,
    }),
    backoffSeconds: parseIntegerOption({
      args,
      argName: "--backoff-seconds",
      env,
      envName: "CRAWLER_BACKOFF_SECONDS",
      fallback: DEFAULT_BACKOFF_SECONDS,
      min: MIN_BACKOFF_SECONDS,
    }),
    categoryDelayMs: parseIntegerOption({
      args,
      argName: "--category-delay-ms",
      env,
      envName: "CRAWLER_CATEGORY_DELAY_MS",
      fallback: DEFAULT_COOLPC_CATEGORY_DELAY_MS,
      min: MIN_CATEGORY_DELAY_MS,
      max: MAX_CATEGORY_DELAY_MS,
    }),
    lockDir: resolveWorkspacePathArgument(
      workspaceRoot,
      getStringArg(args, "--lock-dir") ??
        env.EXTERNAL_FETCH_LOCK_DIR ??
        `${storageDir}/.locks/external-fetch`,
    ),
    lockStaleSeconds: parseIntegerOption({
      args,
      argName: "--lock-stale-seconds",
      env,
      envName: "EXTERNAL_FETCH_LOCK_STALE_SECONDS",
      fallback: DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
      min: 60,
      max: 7 * 24 * 60 * 60,
    }),
    lockRetrySeconds: parseIntegerOption({
      args,
      argName: "--lock-retry-seconds",
      env,
      envName: "CRAWLER_LOCK_RETRY_SECONDS",
      fallback: DEFAULT_LOCK_RETRY_SECONDS,
      min: MIN_LOCK_RETRY_SECONDS,
      max: MAX_LOCK_RETRY_SECONDS,
    }),
    runOnce: args.includes("--run-once"),
    baseUrl: validateCoolpcBaseUrl(env.COOLPC_BASE_URL),
    newProductImageBackfill,
  };
}

// 解析新商品圖片補圖設定，並確保最小/最大 delay 範圍不會互相衝突。
function parseNewProductImageBackfillOptions(
  args: string[],
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
): NewProductImageBackfillOptions {
  const minDelayMs = parseIntegerOption({
    args,
    argName: "--new-product-image-min-delay-ms",
    env,
    envName: "CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS",
    fallback: DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS,
    min: MIN_NEW_PRODUCT_IMAGE_DELAY_MS,
    max: MAX_NEW_PRODUCT_IMAGE_DELAY_MS,
  });
  const maxDelayMs = parseIntegerOption({
    args,
    argName: "--new-product-image-max-delay-ms",
    env,
    envName: "CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS",
    fallback: DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
    min: MIN_NEW_PRODUCT_IMAGE_DELAY_MS,
    max: MAX_NEW_PRODUCT_IMAGE_DELAY_MS,
  });

  if (minDelayMs > maxDelayMs) {
    throw new Error(
      "--new-product-image-min-delay-ms/CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS must be less than or equal to --new-product-image-max-delay-ms/CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS.",
    );
  }

  return {
    workspaceRoot,
    storageDir: resolveWorkspacePathArgument(
      workspaceRoot,
      getStringArg(args, "--product-image-storage-dir") ??
        env.PRODUCT_IMAGE_STORAGE_DIR ??
        DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
    ),
    minDelayMs,
    maxDelayMs,
    timeoutMs: parseIntegerOption({
      args,
      argName: "--new-product-image-timeout-ms",
      env,
      envName: "CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS",
      fallback: DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
      min: MIN_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
      max: MAX_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
    }),
    maxSourceBytes: parseIntegerOption({
      args,
      argName: "--new-product-image-max-source-bytes",
      env,
      envName: "CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES",
      fallback: DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
      min: MIN_NEW_PRODUCT_IMAGE_SOURCE_BYTES,
      max: MAX_NEW_PRODUCT_IMAGE_SOURCE_BYTES,
    }),
  };
}

// 解析單一整數設定值，統一套用 CLI 優先於 env，未設定則使用 fallback 的規則。
function parseIntegerOption({
  args,
  argName,
  env,
  envName,
  fallback,
  min,
  max,
}: ParseIntegerOption): number {
  const raw = getStringArg(args, argName) ?? env[envName];

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isFinite(value) || String(value) !== raw.trim()) {
    throw new Error(`${argName}/${envName} must be an integer.`);
  }

  if (value < min) {
    throw new Error(`${argName}/${envName} must be at least ${min}.`);
  }

  if (max !== undefined && value > max) {
    throw new Error(`${argName}/${envName} must be at most ${max}.`);
  }

  return value;
}
