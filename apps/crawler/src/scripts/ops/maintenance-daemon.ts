// apps/crawler/src/scripts/ops/maintenance-daemon.ts
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

function log(message: string): void {
  logger.info(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
