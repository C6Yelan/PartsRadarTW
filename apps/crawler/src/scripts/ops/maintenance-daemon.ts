// apps/crawler/src/scripts/ops/maintenance-daemon.ts
// 啟動低頻 maintenance daemon，負責排程 product link health 檢查並配合 crawler priority 讓路。

import type { PrismaClient } from "@partsradar/db";
import type {
  ProductLinkCheckerOptions,
  ProductLinkCheckerSummary,
} from "./product-link-checker/options";
import {
  checkProductLinks,
  readProductPurchaseLinkTargets,
  type ProductPurchaseLinkTarget,
  type ProductLinkCheckerDependencies,
  type ProductLinkHealthClient,
} from "./product-link-checker/processor";
import { hasActiveExternalFetchPriority, tryAcquireExternalFetchLock } from "./external-fetch-lock";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  HELP_FLAG,
  parseMaintenanceDaemonOptions,
  printHelp,
  type MaintenanceDaemonOptions,
} from "./maintenance-daemon/options";
import { createOpsLogger } from "./shared/logger";

const logger = createOpsLogger();

export { parseMaintenanceDaemonOptions } from "./maintenance-daemon/options";
export type { MaintenanceDaemonOptions } from "./maintenance-daemon/options";

export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

// 單輪 maintenance 結果摘要，讓 daemon 判斷是否因 crawler priority 改用較短恢復延遲。
export interface MaintenanceCycleSummary {
  skippedForLock: boolean;
  pausedForPriority: boolean;
  link: ProductLinkCheckerSummary | null;
}

interface MaintenanceDaemonDependencies {
  acquireLock?: typeof tryAcquireExternalFetchLock;
  hasPriority?: typeof hasActiveExternalFetchPriority;
  readLinks?: (
    client: ProductLinkHealthClient,
    options: ProductLinkCheckerOptions,
    now?: Date,
  ) => Promise<ProductPurchaseLinkTarget[]>;
  checkLinks?: (
    client: ProductLinkHealthClient,
    purchaseLinkTargets: ProductPurchaseLinkTarget[],
    options: ProductLinkCheckerOptions,
    dependencies?: ProductLinkCheckerDependencies,
  ) => Promise<ProductLinkCheckerSummary>;
  logMessage?: (message: string) => void;
}

interface RunMaintenanceDaemonOptions {
  client: PrismaClient;
  options: MaintenanceDaemonOptions;
  shutdown: ShutdownController;
  dependencies?: MaintenanceDaemonDependencies;
}

// CLI 入口：載入 env、建立 Prisma client，並用 graceful shutdown 控制 maintenance loop。
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseMaintenanceDaemonOptions(args);
  let client: PrismaClient | null = null;
  const shutdown = createShutdownController();

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    log(
      `Maintenance daemon started. interval=${options.intervalSeconds}s initialDelay=${options.initialDelaySeconds}s pricePriorityPause=${options.pricePriorityPauseSeconds}s runOnce=${options.runOnce ? "yes" : "no"} dryRun=${options.dryRun ? "yes" : "no"}`,
    );
    await runMaintenanceDaemon({ client, options, shutdown });
  } finally {
    await client?.$disconnect();
    log("Maintenance daemon stopped.");
  }
}

// 執行 maintenance daemon 主迴圈；priority pause 會縮短下一輪等待，以便讓 crawler 先跑。
export async function runMaintenanceDaemon({
  client,
  options,
  shutdown,
  dependencies = {},
}: RunMaintenanceDaemonOptions): Promise<void> {
  const logMessage = dependencies.logMessage ?? log;

  if (!options.runOnce && options.initialDelaySeconds > 0) {
    logMessage(`Waiting ${options.initialDelaySeconds}s before first maintenance cycle.`);
    await shutdown.sleep(options.initialDelaySeconds * 1000);
  }

  while (!shutdown.requested) {
    let nextDelaySeconds = options.intervalSeconds;

    try {
      const summary = await runMaintenanceCycle({ client, options, dependencies });

      if (summary.pausedForPriority) {
        nextDelaySeconds = options.pricePriorityPauseSeconds;
      }
    } catch (error) {
      logMessage(`Maintenance cycle failed: ${toSafeCliErrorMessage(error)}`);

      if (options.runOnce) {
        throw error;
      }
    }

    if (options.runOnce || shutdown.requested) {
      break;
    }

    const nextRunAt = new Date(Date.now() + nextDelaySeconds * 1000).toISOString();
    logMessage(`Next maintenance cycle at ${nextRunAt} (${nextDelaySeconds}s).`);
    await shutdown.sleep(nextDelaySeconds * 1000);
  }
}

// 執行單輪 maintenance；先取得 external fetch lock，再跑 link health task。
export async function runMaintenanceCycle({
  client,
  options,
  dependencies = {},
}: Omit<RunMaintenanceDaemonOptions, "shutdown">): Promise<MaintenanceCycleSummary> {
  const acquireLock = dependencies.acquireLock ?? tryAcquireExternalFetchLock;
  const logMessage = dependencies.logMessage ?? log;
  const lock = await acquireLock({
    lockDir: options.lockDir,
    owner: "maintenance-daemon",
    staleSeconds: options.lockStaleSeconds,
  });

  if (!lock) {
    logMessage("Skipping maintenance cycle because another external fetch task holds the lock.");

    return {
      skippedForLock: true,
      pausedForPriority: false,
      link: null,
    };
  }

  try {
    logMessage("Starting maintenance cycle.");
    const linkSummary = await runLinkTask(client, options, dependencies);

    logMessage(
      `Maintenance cycle finished. linkRequests=${linkSummary.liveRequests} pausedForPriority=${linkSummary.pausedForPriority ? "yes" : "no"}`,
    );

    return {
      skippedForLock: false,
      pausedForPriority: linkSummary.pausedForPriority,
      link: linkSummary,
    };
  } finally {
    await lock.release();
  }
}

// 選出 due purchase links 並執行 link checker；若 crawler priority 存在，checker 會在安全邊界暫停。
async function runLinkTask(
  client: PrismaClient,
  options: MaintenanceDaemonOptions,
  dependencies: MaintenanceDaemonDependencies,
): Promise<ProductLinkCheckerSummary> {
  const readLinks = dependencies.readLinks ?? readProductPurchaseLinkTargets;
  const checkLinks = dependencies.checkLinks ?? checkProductLinks;
  const hasPriority = dependencies.hasPriority ?? hasActiveExternalFetchPriority;
  const logMessage = dependencies.logMessage ?? log;
  const purchaseLinkTargets = await readLinks(client, options.link);

  logMessage(
    `Maintenance link task selected ${purchaseLinkTargets.length} purchase link target(s).`,
  );

  return checkLinks(client, purchaseLinkTargets, options.link, {
    log: logMessage,
    shouldPause: () =>
      hasPriority({
        lockDir: options.lockDir,
        owner: "crawler-daemon",
        ttlSeconds: options.prioritySignalTtlSeconds,
      }),
  });
}

// 註冊 SIGINT/SIGTERM，讓 daemon 在目前 maintenance step 結束後停止，並可喚醒等待中的 sleep。
function createShutdownController(): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      log(`Received ${signal}; stopping after the current maintenance step.`);
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
      return new Promise((resolve) => {
        if (stopRequested) {
          resolve();
          return;
        }

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

// 透過 ops logger 輸出 maintenance daemon 訊息，讓格式與其他 daemon 一致。
function log(message: string): void {
  logger.info(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
