// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/options.ts
// 解析 scheduled CoolPC crawler daemon 的 CLI/env 設定，集中管理排程與外部抓取鎖參數。

import { DEFAULT_COOLPC_CATEGORY_DELAY_MS } from "../../../coolpc/live-crawl";
import { DEFAULT_FILTER_SYNC_INTERVAL_SECONDS } from "../../../coolpc/filter-sync";
import { join } from "node:path";
import {
  DEFAULT_RAW_SNAPSHOT_STORAGE_DIR,
  resolveAllowlistedRawSnapshotStorage,
} from "../../../coolpc/raw-snapshot-storage";
import {
  getStringArg,
  resolveWorkspacePathArgument,
  resolveWorkspaceRoot,
} from "../../shared/script-utils";
import { parseExternalFetchLockStaleSeconds } from "../external-fetch-lock";

export const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
export const DEFAULT_STORAGE_DIR = DEFAULT_RAW_SNAPSHOT_STORAGE_DIR;
export const DEFAULT_INTERVAL_SECONDS = 1800;
export const DEFAULT_BACKOFF_SECONDS = 3600;
export const DEFAULT_LOCK_RETRY_SECONDS = 120;
export const MIN_INTERVAL_SECONDS = 60;
export const MIN_BACKOFF_SECONDS = 60;
export const MIN_LOCK_RETRY_SECONDS = 30;
export const MAX_LOCK_RETRY_SECONDS = 600;
export const MIN_CATEGORY_DELAY_MS = 3000;
export const MAX_CATEGORY_DELAY_MS = 60000;
export const MIN_FILTER_SYNC_INTERVAL_SECONDS = 60 * 60;

const ENV_ONLY_DAEMON_OPTIONS = {
  "--interval-seconds": "CRAWLER_INTERVAL_SECONDS",
  "--backoff-seconds": "CRAWLER_BACKOFF_SECONDS",
  "--category-delay-ms": "CRAWLER_CATEGORY_DELAY_MS",
  "--lock-retry-seconds": "CRAWLER_LOCK_RETRY_SECONDS",
  "--lock-dir": "EXTERNAL_FETCH_LOCK_DIR",
  "--lock-stale-seconds": "EXTERNAL_FETCH_LOCK_STALE_SECONDS",
  "--filter-sync-interval-seconds": "CRAWLER_FILTER_SYNC_INTERVAL_SECONDS",
} as const;

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
  filterSyncIntervalSeconds: number;
  filterSyncStateFilePath: string;
}

// 共用整數 env parser 的輸入契約，讓 env、default 與上下限驗證維持一致。
interface ParseIntegerEnvironmentValue {
  env: NodeJS.ProcessEnv;
  envName: string;
  fallback: number;
  min: number;
  max?: number;
}

// 解析 scheduled crawler daemon 設定；live fetch 必須顯式確認，低頻調參由 deployment env 管理。
export function parseDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): CoolpcDaemonOptions {
  if (args.includes("--base-url")) {
    throw new Error("Scheduled CoolPC crawler does not accept --base-url overrides.");
  }

  const envOnlyOption = Object.entries(ENV_ONLY_DAEMON_OPTIONS).find(([flag]) =>
    args.includes(flag),
  );

  if (envOnlyOption) {
    const [flag, envName] = envOnlyOption;
    throw new Error(`${flag} is environment-only. Configure ${envName} instead.`);
  }

  if (!args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing scheduled CoolPC live fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this daemon contacts the source site repeatedly.`,
    );
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const { mutationRoot, storageDir } = resolveAllowlistedRawSnapshotStorage({
    workspaceRoot,
    requestedDir:
      getStringArg(args, "--storage-dir") ?? env.SNAPSHOT_STORAGE_DIR ?? DEFAULT_STORAGE_DIR,
    configuredDir: env.SNAPSHOT_STORAGE_DIR,
  });
  const lockDir = resolveWorkspacePathArgument(
    workspaceRoot,
    env.EXTERNAL_FETCH_LOCK_DIR ?? `${mutationRoot}/.locks/external-fetch`,
  );
  const lockStaleSeconds = parseExternalFetchLockStaleSeconds(
    env.EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  );
  return {
    workspaceRoot,
    storageDir,
    intervalSeconds: parseIntegerEnvironmentValue({
      env,
      envName: "CRAWLER_INTERVAL_SECONDS",
      fallback: DEFAULT_INTERVAL_SECONDS,
      min: MIN_INTERVAL_SECONDS,
    }),
    backoffSeconds: parseIntegerEnvironmentValue({
      env,
      envName: "CRAWLER_BACKOFF_SECONDS",
      fallback: DEFAULT_BACKOFF_SECONDS,
      min: MIN_BACKOFF_SECONDS,
    }),
    categoryDelayMs: parseIntegerEnvironmentValue({
      env,
      envName: "CRAWLER_CATEGORY_DELAY_MS",
      fallback: DEFAULT_COOLPC_CATEGORY_DELAY_MS,
      min: MIN_CATEGORY_DELAY_MS,
      max: MAX_CATEGORY_DELAY_MS,
    }),
    lockDir,
    lockStaleSeconds,
    lockRetrySeconds: parseIntegerEnvironmentValue({
      env,
      envName: "CRAWLER_LOCK_RETRY_SECONDS",
      fallback: DEFAULT_LOCK_RETRY_SECONDS,
      min: MIN_LOCK_RETRY_SECONDS,
      max: MAX_LOCK_RETRY_SECONDS,
    }),
    runOnce: args.includes("--run-once"),
    filterSyncIntervalSeconds: parseIntegerEnvironmentValue({
      env,
      envName: "CRAWLER_FILTER_SYNC_INTERVAL_SECONDS",
      fallback: DEFAULT_FILTER_SYNC_INTERVAL_SECONDS,
      min: MIN_FILTER_SYNC_INTERVAL_SECONDS,
      max: 30 * 24 * 60 * 60,
    }),
    filterSyncStateFilePath: join(storageDir, "ops", "coolpc-filter-sync-state.json"),
  };
}

// 解析單一整數環境設定，未設定時使用既有 fallback。
function parseIntegerEnvironmentValue({
  env,
  envName,
  fallback,
  min,
  max,
}: ParseIntegerEnvironmentValue): number {
  const raw = env[envName];

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isFinite(value) || String(value) !== raw.trim()) {
    throw new Error(`${envName} must be an integer.`);
  }

  if (value < min) {
    throw new Error(`${envName} must be at least ${min}.`);
  }

  if (max !== undefined && value > max) {
    throw new Error(`${envName} must be at most ${max}.`);
  }

  return value;
}
