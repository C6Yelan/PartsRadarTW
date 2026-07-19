// apps/crawler/src/scripts/ops/cleanup-raw-snapshots-daemon/options.ts
// 解析 raw snapshot cleanup daemon 的 CLI/env 選項，將 daemon 週期設定與一次性 cleanup 共用參數分流。

import { getStringArg, resolveWorkspaceRoot } from "../../shared/script-utils";
import {
  type CleanupOptions,
  normalizeCleanupArgs,
  parseCleanupOptions,
  validateCleanupArgs,
} from "../cleanup-raw-snapshots";

const CONFIRM_DELETE_FLAG = "--confirm-delete";
export const HELP_FLAG = "--help";
const RUN_ONCE_FLAG = "--run-once";
const INTERVAL_SECONDS_FLAG = "--interval-seconds";
const DEFAULT_CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60;
const DEFAULT_CLEANUP_INITIAL_DELAY_SECONDS = 5 * 60;
const MIN_CLEANUP_INTERVAL_SECONDS = 60 * 60;
const MAX_CLEANUP_INTERVAL_SECONDS = 7 * 24 * 60 * 60;
const CLEANUP_VALUE_FLAGS = new Set([
  "--storage-dir",
  "--normal-retention-days",
  "--abnormal-retention-days",
]);
const CLEANUP_BOOLEAN_FLAGS = new Set([CONFIRM_DELETE_FLAG]);
const DAEMON_VALUE_FLAGS = new Set([INTERVAL_SECONDS_FLAG]);
const DAEMON_BOOLEAN_FLAGS = new Set([HELP_FLAG, RUN_ONCE_FLAG]);
const ALLOWED_FLAGS = new Set([
  ...CLEANUP_VALUE_FLAGS,
  ...CLEANUP_BOOLEAN_FLAGS,
  ...DAEMON_VALUE_FLAGS,
  ...DAEMON_BOOLEAN_FLAGS,
]);
const VALUE_FLAGS = new Set([...CLEANUP_VALUE_FLAGS, ...DAEMON_VALUE_FLAGS]);

// raw snapshot cleanup daemon 的執行設定：包含共用清理參數，以及 daemon 自己的週期與單次執行模式。
export interface RawSnapshotCleanupDaemonOptions extends CleanupOptions {
  intervalSeconds: number;
  initialDelaySeconds: number;
  runOnce: boolean;
}

// 解析 daemon CLI 參數並套用 env/default；排程刪除必須明確帶 --confirm-delete，避免誤把 dry-run 規則帶進常駐清理。
export function parseRawSnapshotCleanupDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): RawSnapshotCleanupDaemonOptions {
  const normalizedArgs = normalizeCleanupArgs(args);
  validateDaemonArgs(normalizedArgs);

  if (!normalizedArgs.includes(CONFIRM_DELETE_FLAG)) {
    throw new Error(
      `Refusing scheduled raw snapshot cleanup without ${CONFIRM_DELETE_FLAG}. Use the one-shot cleanup command for dry runs.`,
    );
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const cleanupArgs = stripDaemonOnlyArgs(normalizedArgs);
  validateCleanupArgs(cleanupArgs);
  const cleanupOptions = parseCleanupOptions(cleanupArgs, workspaceRoot, env);

  return {
    ...cleanupOptions,
    intervalSeconds: parseIntervalSeconds(normalizedArgs, env),
    initialDelaySeconds: parseInitialDelaySeconds(env),
    runOnce: normalizedArgs.includes(RUN_ONCE_FLAG),
  };
}

function parseInitialDelaySeconds(env: NodeJS.ProcessEnv): number {
  const raw =
    env.RAW_SNAPSHOT_CLEANUP_INITIAL_DELAY_SECONDS?.trim() ??
    String(DEFAULT_CLEANUP_INITIAL_DELAY_SECONDS);
  const message =
    "RAW_SNAPSHOT_CLEANUP_INITIAL_DELAY_SECONDS must be an integer between 0 and 3600 seconds.";

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 3600) {
    throw new Error(message);
  }

  return value;
}

// 先驗證 daemon 與 cleanup 兩組允許的旗標，避免未知參數被下游 cleanup parser 誤解。
function validateDaemonArgs(args: string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected raw snapshot cleanup daemon argument: ${arg}`);
    }

    if (!ALLOWED_FLAGS.has(arg)) {
      throw new Error(`Unknown raw snapshot cleanup daemon option: ${arg}`);
    }

    if (!VALUE_FLAGS.has(arg)) {
      continue;
    }

    const value = args[index + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }

    index += 1;
  }
}

// 將 daemon-only 旗標移除後交給一次性 cleanup parser，讓 retention/storage 規則維持單一來源。
function stripDaemonOnlyArgs(args: string[]): string[] {
  const cleanupArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === RUN_ONCE_FLAG || arg === HELP_FLAG) {
      continue;
    }

    if (DAEMON_VALUE_FLAGS.has(arg)) {
      index += 1;
      continue;
    }

    cleanupArgs.push(arg);
  }

  return cleanupArgs;
}

// 解析常駐清理間隔；限制在一小時到七天，避免過度頻繁刪除或排程長到失去維護意義。
function parseIntervalSeconds(args: string[], env: NodeJS.ProcessEnv): number {
  const raw =
    getStringArg(args, INTERVAL_SECONDS_FLAG) ??
    env.RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS ??
    String(DEFAULT_CLEANUP_INTERVAL_SECONDS);

  const rangeMessage = `${INTERVAL_SECONDS_FLAG}/RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS must be an integer between ${MIN_CLEANUP_INTERVAL_SECONDS} and ${MAX_CLEANUP_INTERVAL_SECONDS} seconds.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(rangeMessage);
  }

  const value = Number(raw);

  if (
    !Number.isSafeInteger(value) ||
    value < MIN_CLEANUP_INTERVAL_SECONDS ||
    value > MAX_CLEANUP_INTERVAL_SECONDS
  ) {
    throw new Error(rangeMessage);
  }

  return value;
}

// 輸出 daemon CLI 的維運入口說明，實際刪除仍需 --confirm-delete 才會啟用。
export function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup-daemon -- --confirm-delete [options]

Options:
  --confirm-delete                Required. Enables scheduled deletion using the normal retention rules.
  --run-once                      Run one cleanup cycle, then exit.
  --interval-seconds <sec>        Delay between cleanup cycles.
                                  Default: ${DEFAULT_CLEANUP_INTERVAL_SECONDS}, range: ${MIN_CLEANUP_INTERVAL_SECONDS}-${MAX_CLEANUP_INTERVAL_SECONDS}
  RAW_SNAPSHOT_CLEANUP_INITIAL_DELAY_SECONDS
                                  Startup delay before the first daemon cycle. Default: ${DEFAULT_CLEANUP_INITIAL_DELAY_SECONDS}
  --normal-retention-days <days>  Retention for VALID snapshots.
  --abnormal-retention-days <days>
                                  Retention for INVALID and SUSPECTED_BLOCK snapshots.
  --storage-dir <path>            Must equal the active root or its controlled child.
                                  SNAPSHOT_STORAGE_DIR replaces the built-in default when set.

Safety:
  Each delete cycle stops if a crawler/replay holds the raw snapshot mutation lock.
`);
}
