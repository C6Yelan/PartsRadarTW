// apps/crawler/src/scripts/ops/cleanup-raw-snapshots-daemon.ts
// 啟動 raw snapshot cleanup 常駐程序，定期執行保留規則清理並處理 shutdown / logging 邊界。

import type { PrismaClient } from "@partsradar/db";
import {
  type CleanupRawSnapshotsResult,
  cleanupRawSnapshotsWithPrisma,
  type PrismaRawSnapshotCleanupClient,
} from "../../coolpc/raw-snapshot-cleanup";
import { tryAcquireRawSnapshotMutationLock } from "../../coolpc/raw-snapshot-storage";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { type RawSnapshotCleanupExecutor, runRawSnapshotCleanup } from "./cleanup-raw-snapshots";
import {
  HELP_FLAG,
  parseRawSnapshotCleanupDaemonOptions,
  printHelp,
  type RawSnapshotCleanupDaemonOptions,
} from "./cleanup-raw-snapshots-daemon/options";
import { createOpsLogger } from "./shared/logger";

const logger = createOpsLogger();

export type { RawSnapshotCleanupDaemonOptions } from "./cleanup-raw-snapshots-daemon/options";
export { parseRawSnapshotCleanupDaemonOptions } from "./cleanup-raw-snapshots-daemon/options";

// 抽象化 daemon 的停止狀態與 sleep 行為，讓測試能驗證 loop 行為而不依賴真實 process signal。
export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

// 啟動 daemon loop 所需的依賴集合；production 使用 Prisma cleanup，測試可替換 cleanup 與 log。
export interface RunRawSnapshotCleanupDaemonOptions {
  client: PrismaRawSnapshotCleanupClient;
  options: RawSnapshotCleanupDaemonOptions;
  shutdown: ShutdownController;
  cleanup?: RawSnapshotCleanupExecutor;
  acquireMutationLock?: typeof tryAcquireRawSnapshotMutationLock;
  logMessage?: (message: string) => void;
}

// CLI 入口：載入環境、建立 DB client，並把實際循環交給可測試的 daemon runner。
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

// 執行 raw snapshot cleanup daemon 主迴圈；run-once 模式會在單輪失敗時直接拋出，常駐模式則記錄錯誤後等待下一輪。
export async function runRawSnapshotCleanupDaemon({
  client,
  options,
  shutdown,
  cleanup = cleanupRawSnapshotsWithPrisma,
  acquireMutationLock = tryAcquireRawSnapshotMutationLock,
  logMessage = log,
}: RunRawSnapshotCleanupDaemonOptions): Promise<void> {
  do {
    const result = await runCleanupCycle({
      client,
      options,
      cleanup,
      acquireMutationLock,
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
  logMessage: (message: string) => void;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
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

    return { ok: true };
  } catch (error) {
    logMessage(`Raw snapshot cleanup cycle failed: ${toLogErrorMessage(error)}`);

    return { ok: false, error };
  }
}

// 註冊 SIGINT/SIGTERM，讓 daemon 能在目前 cleanup step 結束後停止，且可中斷等待中的 sleep。
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
        const timeoutId = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeoutId);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
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

// 統一套用 CLI 錯誤遮蔽，避免 daemon log 直接輸出敏感 env 或連線字串。
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
