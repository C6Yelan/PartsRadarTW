// apps/crawler/src/scripts/ops/cleanup-raw-snapshots-daemon.ts
// 啟動 raw snapshot cleanup 常駐程序，定期執行保留規則清理並處理 shutdown / logging 邊界。

import type { PrismaClient } from "@partsradar/db";
import {
  type CleanupRawSnapshotsResult,
  cleanupRawSnapshotsWithPrisma,
  type PrismaRawSnapshotCleanupClient,
} from "../../coolpc/raw-snapshot-cleanup";
import {
  RawSnapshotStorageBusyError,
  tryAcquireRawSnapshotMutationLock,
} from "../../coolpc/raw-snapshot-storage";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  RawSnapshotCleanupExecutionError,
  type RawSnapshotCleanupExecutor,
  runRawSnapshotCleanup,
} from "./cleanup-raw-snapshots";
import {
  HELP_FLAG,
  parseRawSnapshotCleanupDaemonOptions,
  printHelp,
  type RawSnapshotCleanupDaemonOptions,
} from "./cleanup-raw-snapshots-daemon/options";
import {
  type RawSnapshotCleanupCycleResult,
  writeRawSnapshotCleanupRuntimeStatus,
} from "./cleanup-raw-snapshots-daemon/runtime-status";
import { createOpsLogger } from "./shared/logger";
import { createInterruptibleShutdownController } from "./shared/shutdown";

const logger = createOpsLogger();

// 描述 daemon loop 需要的停止狀態與可中斷 sleep 行為。
export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

// 集中 daemon loop 的清理執行器、logger 與關閉控制。
export interface RunRawSnapshotCleanupDaemonOptions {
  client: PrismaRawSnapshotCleanupClient;
  options: RawSnapshotCleanupDaemonOptions;
  shutdown: ShutdownController;
  cleanup?: RawSnapshotCleanupExecutor;
  acquireMutationLock?: typeof tryAcquireRawSnapshotMutationLock;
  logMessage?: (message: string, fields?: Record<string, unknown>) => void;
  now?: () => Date;
  random?: () => number;
  writeRuntimeStatus?: typeof writeRawSnapshotCleanupRuntimeStatus;
}

interface CleanupCycleResult {
  cycleResult: RawSnapshotCleanupCycleResult;
  error?: unknown;
}

// CLI 入口載入環境、建立 DB client，並啟動可安全停止的 cleanup loop。
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
  const shutdown = createInterruptibleShutdownController({
    onSignal: (signal) => {
      log(`Received ${signal}; stopping after the current cleanup step.`);
    },
  });

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    log(
      `Raw snapshot cleanup daemon started. interval=${options.intervalSeconds}s lockBusyRetry=${options.lockBusyRetrySeconds}s lockBusyMaxRetries=${options.lockBusyMaxRetries} runOnce=${options.runOnce ? "yes" : "no"} storage=${options.storageDir}`,
    );
    await runRawSnapshotCleanupDaemon({ client, options, shutdown });
  } finally {
    await client?.$disconnect();
    log("Raw snapshot cleanup daemon stopped.");
  }
}

// 執行 raw snapshot cleanup daemon 主迴圈；run-once 模式會在單輪失敗時直接拋出，常駐模式則記錄錯誤後等待下一輪。
export async function runRawSnapshotCleanupDaemon({
  client,
  options,
  shutdown,
  cleanup = cleanupRawSnapshotsWithPrisma,
  acquireMutationLock = tryAcquireRawSnapshotMutationLock,
  logMessage = log,
  now = () => new Date(),
  random = Math.random,
  writeRuntimeStatus = writeRawSnapshotCleanupRuntimeStatus,
}: RunRawSnapshotCleanupDaemonOptions): Promise<void> {
  let consecutiveLockBusyCount = 0;
  let lockBusySince: string | null = null;

  if (!options.runOnce && options.initialDelaySeconds > 0) {
    const firstRunAt = new Date(now().getTime() + options.initialDelaySeconds * 1000).toISOString();
    logMessage(
      `Delaying first raw snapshot cleanup until ${firstRunAt} (${options.initialDelaySeconds}s) so crawler startup has priority.`,
    );
    await shutdown.sleep(options.initialDelaySeconds * 1000);
    if (shutdown.requested) {
      return;
    }
  }

  do {
    const result = await runCleanupCycle({
      client,
      options,
      cleanup,
      acquireMutationLock,
      logMessage,
    });
    consecutiveLockBusyCount =
      result.cycleResult === "LOCK_BUSY" ? consecutiveLockBusyCount + 1 : 0;
    lockBusySince =
      result.cycleResult === "LOCK_BUSY" ? (lockBusySince ?? now().toISOString()) : null;
    const persistentLockBusy =
      result.cycleResult === "LOCK_BUSY" && consecutiveLockBusyCount > options.lockBusyMaxRetries;
    const retrySeconds =
      result.cycleResult === "LOCK_BUSY"
        ? resolveCleanupLockBusyRetrySeconds(options, consecutiveLockBusyCount, random)
        : resolveCleanupRetrySeconds(result.cycleResult, options.intervalSeconds);
    const nextAttemptAt =
      options.runOnce || shutdown.requested
        ? null
        : new Date(now().getTime() + retrySeconds * 1000).toISOString();

    await writeRuntimeStatusSafely(
      options.runtimeStatusFilePath,
      {
        version: 1,
        state:
          result.cycleResult === "LOCK_BUSY"
            ? "WAITING_LOCK"
            : result.cycleResult === "SUCCESS"
              ? "IDLE"
              : "BACKOFF",
        cycleResult: result.cycleResult,
        observedAt: now().toISOString(),
        nextAttemptAt,
        lockBusySince,
        consecutiveLockBusyCount,
        persistentLockBusy,
      },
      logMessage,
      writeRuntimeStatus,
    );

    if (result.cycleResult !== "SUCCESS" && options.runOnce) {
      throw result.error;
    }
    if (options.runOnce || shutdown.requested) break;

    logMessage("Next raw snapshot cleanup scheduled.", {
      cycleResult: result.cycleResult,
      consecutiveLockBusyCount,
      nextAttemptAt,
      retrySeconds,
    });
    await shutdown.sleep(retrySeconds * 1000);
  } while (!shutdown.requested);
}

const PERSISTENT_LOCK_BUSY_RETRY_SECONDS = 10 * 60;
const CLEANUP_FAILURE_RETRY_SECONDS = 15 * 60;
const INTERNAL_FAILURE_RETRY_SECONDS = 30 * 60;

function resolveCleanupRetrySeconds(
  cycleResult: Exclude<RawSnapshotCleanupCycleResult, "LOCK_BUSY">,
  intervalSeconds: number,
): number {
  if (cycleResult === "CLEANUP_FAILURE") return CLEANUP_FAILURE_RETRY_SECONDS;
  if (cycleResult === "INTERNAL_FAILURE") return INTERNAL_FAILURE_RETRY_SECONDS;
  return intervalSeconds;
}

export function resolveCleanupLockBusyRetrySeconds(
  options: Pick<RawSnapshotCleanupDaemonOptions, "lockBusyMaxRetries" | "lockBusyRetrySeconds">,
  consecutiveLockBusyCount: number,
  random = Math.random,
): number {
  if (consecutiveLockBusyCount > options.lockBusyMaxRetries) {
    return PERSISTENT_LOCK_BUSY_RETRY_SECONDS;
  }

  return Math.round(options.lockBusyRetrySeconds * (0.9 + random() * 0.1));
}

// 包住單輪 cleanup 的錯誤邊界，避免常駐 daemon 因一次清理失敗直接結束。
async function runCleanupCycle({
  client,
  options,
  cleanup,
  acquireMutationLock,
  logMessage,
}: {
  client: PrismaRawSnapshotCleanupClient;
  options: RawSnapshotCleanupDaemonOptions;
  cleanup: RawSnapshotCleanupExecutor;
  acquireMutationLock: typeof tryAcquireRawSnapshotMutationLock;
  logMessage: (message: string, fields?: Record<string, unknown>) => void;
}): Promise<CleanupCycleResult> {
  logMessage("Starting raw snapshot cleanup cycle.");

  try {
    const result = await runRawSnapshotCleanup({
      client,
      options,
      owner: "raw-snapshot-cleanup-daemon",
      cleanup,
      acquireMutationLock,
    });

    printCleanupSummary(result, logMessage);

    return { cycleResult: "SUCCESS" };
  } catch (error) {
    if (error instanceof RawSnapshotStorageBusyError) {
      return { cycleResult: "LOCK_BUSY", error };
    }

    if (error instanceof RawSnapshotCleanupExecutionError) {
      logMessage("Raw snapshot cleanup cycle failed.", {
        cycleResult: "CLEANUP_FAILURE",
        error: toSafeCliErrorMessage(error),
      });
      return { cycleResult: "CLEANUP_FAILURE", error };
    }

    logMessage("Raw snapshot cleanup cycle failed.", {
      cycleResult: "INTERNAL_FAILURE",
      error: toSafeCliErrorMessage(error),
    });
    return { cycleResult: "INTERNAL_FAILURE", error };
  }
}

async function writeRuntimeStatusSafely(
  path: string,
  status: Parameters<typeof writeRawSnapshotCleanupRuntimeStatus>[1],
  logMessage: (message: string, fields?: Record<string, unknown>) => void,
  writeRuntimeStatus: typeof writeRawSnapshotCleanupRuntimeStatus,
): Promise<void> {
  try {
    await writeRuntimeStatus(path, status);
  } catch (error) {
    logMessage("Unable to write raw snapshot cleanup runtime status.", {
      cycleResult: "INTERNAL_FAILURE",
      error: toSafeCliErrorMessage(error),
    });
  }
}

// 輸出單輪 cleanup 的高層摘要，避免 log 夾帶 raw path 或逐筆 metadata。
function printCleanupSummary(
  result: CleanupRawSnapshotsResult,
  logMessage: (message: string) => void,
): void {
  logMessage(
    `Raw snapshot cleanup finished. metadataCandidates=${result.candidateMetadataCount} metadataDeleted=${result.deletedMetadataCount} deletableFiles=${result.deletableCompressedFilePathCount} filesDeleted=${result.deletedCompressedFileCount} missingFiles=${result.missingCompressedFileCount}`,
  );
}

function log(message: string, fields?: Record<string, unknown>): void {
  logger.info(message, fields);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
