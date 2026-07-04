// apps/crawler/src/scripts/ops/cleanup-raw-snapshots-daemon.ts
import type { PrismaClient } from "@partsradar/db";
import {
  type CleanupRawSnapshotsResult,
  type PrismaRawSnapshotCleanupClient,
  cleanupRawSnapshotsWithPrisma,
} from "../../coolpc/raw-snapshot-cleanup";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  HELP_FLAG,
  parseRawSnapshotCleanupDaemonOptions,
  printHelp,
  type RawSnapshotCleanupDaemonOptions,
} from "./cleanup-raw-snapshots-daemon/options";
import { createOpsLogger } from "./shared/logger";

const logger = createOpsLogger();

export { parseRawSnapshotCleanupDaemonOptions } from "./cleanup-raw-snapshots-daemon/options";
export type { RawSnapshotCleanupDaemonOptions } from "./cleanup-raw-snapshots-daemon/options";

export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

export type RawSnapshotCleanupExecutor = (options: {
  client: PrismaRawSnapshotCleanupClient;
  storageDir: string;
  normalRetentionDays: number;
  abnormalRetentionDays: number;
  dryRun: boolean;
}) => Promise<CleanupRawSnapshotsResult>;

export interface RunRawSnapshotCleanupDaemonOptions {
  client: PrismaRawSnapshotCleanupClient;
  options: RawSnapshotCleanupDaemonOptions;
  shutdown: ShutdownController;
  cleanup?: RawSnapshotCleanupExecutor;
  logMessage?: (message: string) => void;
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
  client: PrismaRawSnapshotCleanupClient;
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
  return toSafeCliErrorMessage(error);
}

function log(message: string): void {
  logger.info(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toLogErrorMessage(error));
    process.exitCode = 1;
  });
}
