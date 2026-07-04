// apps/crawler/src/scripts/ops/cleanup-raw-snapshots-daemon/options.ts

import {
  type CleanupOptions,
  normalizeCleanupArgs,
  parseCleanupOptions,
  validateCleanupArgs,
} from "../cleanup-raw-snapshots";
import { getStringArg, resolveWorkspaceRoot } from "../../shared/script-utils";

const CONFIRM_DELETE_FLAG = "--confirm-delete";
export const HELP_FLAG = "--help";
const RUN_ONCE_FLAG = "--run-once";
const INTERVAL_SECONDS_FLAG = "--interval-seconds";
const DEFAULT_CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60;
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

export interface RawSnapshotCleanupDaemonOptions extends CleanupOptions {
  intervalSeconds: number;
  runOnce: boolean;
}

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
    runOnce: normalizedArgs.includes(RUN_ONCE_FLAG),
  };
}

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

export function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup-daemon -- --confirm-delete [options]

Options:
  --confirm-delete                Required. Enables scheduled deletion using the normal retention rules.
  --run-once                      Run one cleanup cycle, then exit.
  --interval-seconds <sec>        Delay between cleanup cycles.
                                  Default: ${DEFAULT_CLEANUP_INTERVAL_SECONDS}, range: ${MIN_CLEANUP_INTERVAL_SECONDS}-${MAX_CLEANUP_INTERVAL_SECONDS}
  --normal-retention-days <days>  Retention for VALID snapshots.
  --abnormal-retention-days <days>
                                  Retention for INVALID and SUSPECTED_BLOCK snapshots.
  --storage-dir <path>            Snapshot storage directory from the workspace root or Docker volume path.
`);
}
