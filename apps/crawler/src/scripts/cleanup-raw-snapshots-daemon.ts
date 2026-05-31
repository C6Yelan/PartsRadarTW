import type { PrismaClient } from "@partsradar/db";
import {
  type CleanupRawSnapshotsResult,
  type PrismaRawSnapshotRetentionClient,
  cleanupRawSnapshotsWithPrisma,
} from "../coolpc/raw-snapshot-retention";
import {
  type CleanupOptions,
  normalizeCleanupArgs,
  parseCleanupOptions,
  validateCleanupArgs,
} from "./cleanup-raw-snapshots";
import { getStringArg, loadWorkspaceEnv, resolveWorkspaceRoot } from "./script-utils";

const CONFIRM_DELETE_FLAG = "--confirm-delete";
const HELP_FLAG = "--help";
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

export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

export type RawSnapshotCleanupExecutor = (options: {
  client: PrismaRawSnapshotRetentionClient;
  storageDir: string;
  normalRetentionDays: number;
  abnormalRetentionDays: number;
  dryRun: boolean;
}) => Promise<CleanupRawSnapshotsResult>;

export interface RunRawSnapshotCleanupDaemonOptions {
  client: PrismaRawSnapshotRetentionClient;
  options: RawSnapshotCleanupDaemonOptions;
  shutdown: ShutdownController;
  cleanup?: RawSnapshotCleanupExecutor;
  logMessage?: (message: string) => void;
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseRawSnapshotCleanupDaemonOptions(args);
  let client: PrismaClient | null = null;
  const shutdown = createShutdownController();

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    log(
      `Raw snapshot cleanup daemon started. interval=${options.intervalSeconds}s runOnce=${options.runOnce ? "yes" : "no"} storage=${options.storageDir}`,
    );
    await runRawSnapshotCleanupDaemon({ client, options, shutdown });
  } finally {
    await client?.$disconnect();
    log("Raw snapshot cleanup daemon stopped.");
  }
}

export async function runRawSnapshotCleanupDaemon({
  client,
  options,
  shutdown,
  cleanup = cleanupRawSnapshotsWithPrisma,
  logMessage = log,
}: RunRawSnapshotCleanupDaemonOptions): Promise<void> {
  do {
    const result = await runCleanupCycle({
      client,
      options,
      cleanup,
      logMessage,
    });

    if (!result.ok && options.runOnce) {
      throw result.error;
    }

    if (options.runOnce || shutdown.requested) {
      break;
    }

    const waitMs = options.intervalSeconds * 1000;
    const nextRunAt = new Date(Date.now() + waitMs).toISOString();
    logMessage(`Next raw snapshot cleanup at ${nextRunAt} (${options.intervalSeconds}s).`);
    await shutdown.sleep(waitMs);
  } while (!shutdown.requested);
}

async function runCleanupCycle({
  client,
  options,
  cleanup,
  logMessage,
}: {
  client: PrismaRawSnapshotRetentionClient;
  options: RawSnapshotCleanupDaemonOptions;
  cleanup: RawSnapshotCleanupExecutor;
  logMessage: (message: string) => void;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  logMessage("Starting raw snapshot cleanup cycle.");

  try {
    const result = await cleanup({
      client,
      storageDir: options.storageDir,
      normalRetentionDays: options.normalRetentionDays,
      abnormalRetentionDays: options.abnormalRetentionDays,
      dryRun: false,
    });

    printCleanupSummary(result, logMessage);

    return { ok: true };
  } catch (error) {
    logMessage(`Raw snapshot cleanup cycle failed: ${toLogErrorMessage(error)}`);

    return { ok: false, error };
  }
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

function createShutdownController(): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      log(`Received ${signal}; stopping after the current cleanup step.`);
    }

    stopRequested = true;
    wakeSleeper?.();
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  return {
    get requested() {
      return stopRequested;
    },
    sleep(ms: number) {
      if (stopRequested) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeout);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}

function printCleanupSummary(
  result: CleanupRawSnapshotsResult,
  logMessage: (message: string) => void,
): void {
  logMessage(
    `Raw snapshot cleanup finished. metadataCandidates=${result.candidateMetadataCount} metadataDeleted=${result.deletedMetadataCount} deletableFiles=${result.deletableCompressedFilePathCount} filesDeleted=${result.deletedCompressedFileCount} missingFiles=${result.missingCompressedFileCount}`,
  );
}

function toLogErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler raw-snapshots:cleanup-daemon -- --confirm-delete [options]

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

if (require.main === module) {
  main().catch((error) => {
    console.error(toLogErrorMessage(error));
    process.exitCode = 1;
  });
}
