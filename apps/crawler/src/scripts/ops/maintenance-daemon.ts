// apps/crawler/src/scripts/ops/maintenance-daemon.ts
import type { PrismaClient } from "@partsradar/db";
import {
  type ProductLinkCheckerOptions,
  type ProductLinkCheckerSummary,
  parseOptions as parseProductLinkOptions,
} from "./product-link-checker/options";
import {
  checkProductLinks,
  readProductLinkCandidates,
  type ProductLinkCandidate,
  type ProductLinkCheckerDependencies,
  type ProductLinkHealthClient,
} from "./product-link-checker/processor";
import {
  DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
  hasActiveExternalFetchPriority,
  tryAcquireExternalFetchLock,
} from "./external-fetch-lock";
import {
  getStringArg,
  loadWorkspaceEnv,
  resolveRelativeToWorkspace,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DRY_RUN_FLAG = "--dry-run";
const HELP_FLAG = "--help";
const RUN_ONCE_FLAG = "--run-once";
const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 24 * 60 * 60;
const DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS = 15 * 60;
const DEFAULT_PRICE_PRIORITY_PAUSE_SECONDS = 5 * 60;
const MIN_MAINTENANCE_INTERVAL_SECONDS = 60 * 60;
const MAX_MAINTENANCE_INTERVAL_SECONDS = 7 * 24 * 60 * 60;
const MIN_NON_NEGATIVE_SECONDS = 0;
const MAX_INITIAL_DELAY_SECONDS = 24 * 60 * 60;
const MIN_PRICE_PRIORITY_PAUSE_SECONDS = 60;
const MAX_PRICE_PRIORITY_PAUSE_SECONDS = 60 * 60;
const DEFAULT_LINK_LIMIT = 200;

export interface MaintenanceDaemonOptions {
  workspaceRoot: string;
  dryRun: boolean;
  runOnce: boolean;
  intervalSeconds: number;
  initialDelaySeconds: number;
  pricePriorityPauseSeconds: number;
  prioritySignalTtlSeconds: number;
  lockDir: string;
  lockStaleSeconds: number;
  link: ProductLinkCheckerOptions;
}

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
  ) => Promise<ProductLinkCandidate[]>;
  checkLinks?: (
    client: ProductLinkHealthClient,
    candidates: ProductLinkCandidate[],
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

export function parseMaintenanceDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): MaintenanceDaemonOptions {
  if (args.includes(HELP_FLAG)) {
    printHelp();
    process.exit(0);
  }

  const dryRun = args.includes(DRY_RUN_FLAG);

  if (!dryRun && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing scheduled maintenance live fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this daemon contacts external sites repeatedly.`,
    );
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const lockDir = resolveRelativeToWorkspace(
    workspaceRoot,
    getStringArg(args, "--lock-dir") ??
      env.EXTERNAL_FETCH_LOCK_DIR ??
      "temp/external-fetch.lock",
  );

  return {
    workspaceRoot,
    dryRun,
    runOnce: args.includes(RUN_ONCE_FLAG),
    intervalSeconds: parseIntegerOption({
      args,
      env,
      argName: "--interval-seconds",
      envName: "MAINTENANCE_INTERVAL_SECONDS",
      fallback: DEFAULT_MAINTENANCE_INTERVAL_SECONDS,
      min: MIN_MAINTENANCE_INTERVAL_SECONDS,
      max: MAX_MAINTENANCE_INTERVAL_SECONDS,
    }),
    initialDelaySeconds: parseIntegerOption({
      args,
      env,
      argName: "--initial-delay-seconds",
      envName: "MAINTENANCE_INITIAL_DELAY_SECONDS",
      fallback: DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS,
      min: MIN_NON_NEGATIVE_SECONDS,
      max: MAX_INITIAL_DELAY_SECONDS,
    }),
    pricePriorityPauseSeconds: parseIntegerOption({
      args,
      env,
      argName: "--price-priority-pause-seconds",
      envName: "MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS",
      fallback: DEFAULT_PRICE_PRIORITY_PAUSE_SECONDS,
      min: MIN_PRICE_PRIORITY_PAUSE_SECONDS,
      max: MAX_PRICE_PRIORITY_PAUSE_SECONDS,
    }),
    prioritySignalTtlSeconds: parseIntegerOption({
      args,
      env,
      argName: "--priority-signal-ttl-seconds",
      envName: "EXTERNAL_FETCH_PRIORITY_TTL_SECONDS",
      fallback: DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
      min: 60,
      max: 60 * 60,
    }),
    lockDir,
    lockStaleSeconds: parseIntegerOption({
      args,
      env,
      argName: "--lock-stale-seconds",
      envName: "EXTERNAL_FETCH_LOCK_STALE_SECONDS",
      fallback: DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
      min: 60,
      max: 7 * 24 * 60 * 60,
    }),
    link: parseProductLinkOptions(buildProductLinkArgs(args, env, dryRun), cwd),
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
  const readLinks = dependencies.readLinks ?? readProductLinkCandidates;
  const checkLinks = dependencies.checkLinks ?? checkProductLinks;
  const hasPriority = dependencies.hasPriority ?? hasActiveExternalFetchPriority;
  const logMessage = dependencies.logMessage ?? log;
  const candidates = await readLinks(client, options.link);

  logMessage(`Maintenance link task selected ${candidates.length} candidate(s).`);

  return checkLinks(client, candidates, options.link, {
    log: logMessage,
    shouldPause: () =>
      hasPriority({
        lockDir: options.lockDir,
        owner: "crawler-daemon",
        ttlSeconds: options.prioritySignalTtlSeconds,
      }),
  });
}

function buildProductLinkArgs(
  args: string[],
  env: NodeJS.ProcessEnv,
  dryRun: boolean,
): string[] {
  const linkArgs = dryRun ? [DRY_RUN_FLAG] : [CONFIRM_LIVE_FETCH_FLAG];
  appendOption(linkArgs, "--limit", getStringArg(args, "--link-limit") ?? env.MAINTENANCE_LINK_LIMIT ?? String(DEFAULT_LINK_LIMIT));
  appendOption(
    linkArgs,
    "--stale-after-hours",
    getStringArg(args, "--link-stale-after-hours") ??
      env.MAINTENANCE_LINK_STALE_AFTER_HOURS ??
      "48",
  );
  appendOption(
    linkArgs,
    "--min-delay-ms",
    getStringArg(args, "--link-min-delay-ms") ?? env.MAINTENANCE_LINK_MIN_DELAY_MS ?? "10000",
  );
  appendOption(
    linkArgs,
    "--max-delay-ms",
    getStringArg(args, "--link-max-delay-ms") ?? env.MAINTENANCE_LINK_MAX_DELAY_MS ?? "20000",
  );
  appendOption(
    linkArgs,
    "--timeout-ms",
    getStringArg(args, "--link-timeout-ms") ?? env.MAINTENANCE_LINK_TIMEOUT_MS ?? "10000",
  );

  return linkArgs;
}

function appendOption(args: string[], name: string, value: string): void {
  args.push(name, value);
}

function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const errorMessage = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(errorMessage);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(errorMessage);
  }

  return value;
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

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:maintenance-daemon -- --confirm-live-fetch [options]
  pnpm --filter @partsradar/crawler ops:maintenance-daemon -- --dry-run --run-once [options]

Options:
  --confirm-live-fetch          Required for scheduled live external requests.
  --dry-run                     Run selection only; no external requests or writes.
  --run-once                    Run one maintenance cycle and exit.
  --interval-seconds <sec>      Delay between maintenance cycles.
                                Default: ${DEFAULT_MAINTENANCE_INTERVAL_SECONDS}
  --initial-delay-seconds <sec> Delay before the first cycle in daemon mode.
                                Default: ${DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS}
  --price-priority-pause-seconds <sec>
                                Delay before resuming after yielding to the price crawler.
                                Default: ${DEFAULT_PRICE_PRIORITY_PAUSE_SECONDS}
  --link-limit <count>          Maximum due product links per cycle.
                                Default: ${DEFAULT_LINK_LIMIT}
  --lock-dir <path>             Shared external fetch lock directory.
                                Default: EXTERNAL_FETCH_LOCK_DIR, then temp/external-fetch.lock
  --lock-stale-seconds <sec>    Break stale external fetch locks after this age.
                                Default: ${DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS}
  --priority-signal-ttl-seconds <sec>
                                Higher-priority external fetch signal TTL.
                                Default: ${DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS}
  --help                        Show this help message.
`);
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
