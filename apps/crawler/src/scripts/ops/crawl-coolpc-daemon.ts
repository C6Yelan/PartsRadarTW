import type { PrismaClient } from "@partsradar/db";
import {
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  type RunCoolpcCrawlOnceResult,
} from "../../coolpc/crawl-run";
import {
  DEFAULT_COOLPC_CATEGORY_DELAY_MS,
  assertSeededCategories,
  runCoolpcCategoryCrawl,
  validateCoolpcBaseUrl,
} from "../../coolpc/live-crawl";
import {
  getStringArg,
  loadWorkspaceEnv,
  resolveRelativeToWorkspace,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  tryAcquireExternalFetchLock,
} from "./external-fetch-lock";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "temp/coolpc-daemon/snapshots";
const DEFAULT_INTERVAL_SECONDS = 1800;
const DEFAULT_BACKOFF_SECONDS = 3600;
const MIN_INTERVAL_SECONDS = 60;
const MIN_BACKOFF_SECONDS = 60;
const MIN_CATEGORY_DELAY_MS = 3000;
const MAX_CATEGORY_DELAY_MS = 60000;
const SCHEDULED_CRAWL_USER_AGENT =
  "PartsRadarTW scheduled crawler (+https://github.com/C6Yelan/PartsRadarTW)";

export interface CoolpcDaemonOptions {
  workspaceRoot: string;
  storageDir: string;
  intervalSeconds: number;
  backoffSeconds: number;
  categoryDelayMs: number;
  lockDir: string;
  lockStaleSeconds: number;
  runOnce: boolean;
  baseUrl?: string;
}

interface ParseIntegerOption {
  args: string[];
  argName: string;
  env: NodeJS.ProcessEnv;
  envName: string;
  fallback: number;
  min: number;
  max?: number;
}

interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

export function parseDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): CoolpcDaemonOptions {
  if (args.includes("--base-url")) {
    throw new Error("Scheduled CoolPC crawler does not accept --base-url overrides.");
  }

  if (!args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing scheduled CoolPC live fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this daemon contacts the source site repeatedly.`,
    );
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const storageDir = resolveRelativeToWorkspace(
    workspaceRoot,
    getStringArg(args, "--storage-dir") ?? env.SNAPSHOT_STORAGE_DIR ?? DEFAULT_STORAGE_DIR,
  );

  return {
    workspaceRoot,
    storageDir,
    intervalSeconds: parseIntegerOption({
      args,
      argName: "--interval-seconds",
      env,
      envName: "CRAWLER_INTERVAL_SECONDS",
      fallback: DEFAULT_INTERVAL_SECONDS,
      min: MIN_INTERVAL_SECONDS,
    }),
    backoffSeconds: parseIntegerOption({
      args,
      argName: "--backoff-seconds",
      env,
      envName: "CRAWLER_BACKOFF_SECONDS",
      fallback: DEFAULT_BACKOFF_SECONDS,
      min: MIN_BACKOFF_SECONDS,
    }),
    categoryDelayMs: parseIntegerOption({
      args,
      argName: "--category-delay-ms",
      env,
      envName: "CRAWLER_CATEGORY_DELAY_MS",
      fallback: DEFAULT_COOLPC_CATEGORY_DELAY_MS,
      min: MIN_CATEGORY_DELAY_MS,
      max: MAX_CATEGORY_DELAY_MS,
    }),
    lockDir: resolveRelativeToWorkspace(
      workspaceRoot,
      getStringArg(args, "--lock-dir") ??
        env.EXTERNAL_FETCH_LOCK_DIR ??
        `${storageDir}/.locks/external-fetch`,
    ),
    lockStaleSeconds: parseIntegerOption({
      args,
      argName: "--lock-stale-seconds",
      env,
      envName: "EXTERNAL_FETCH_LOCK_STALE_SECONDS",
      fallback: DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
      min: 60,
      max: 7 * 24 * 60 * 60,
    }),
    runOnce: args.includes("--run-once"),
    baseUrl: validateCoolpcBaseUrl(env.COOLPC_BASE_URL),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseDaemonOptions(args);
  let client: PrismaClient | null = null;
  const shutdown = createShutdownController();

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    await assertSeededCategories(client);
    log(
      `CoolPC scheduled crawler started. interval=${options.intervalSeconds}s backoff=${options.backoffSeconds}s categoryDelay=${options.categoryDelayMs}ms runOnce=${options.runOnce ? "yes" : "no"}`,
    );

    do {
      const result = await runScheduledCycle(client, options);

      if (options.runOnce || shutdown.requested) {
        break;
      }

      const waitSeconds = result.shouldBackoff ? options.backoffSeconds : options.intervalSeconds;
      const nextRunAt = new Date(Date.now() + waitSeconds * 1000).toISOString();
      log(
        `Next CoolPC scheduled crawl at ${nextRunAt} (${waitSeconds}s, ${result.shouldBackoff ? "backoff" : "normal interval"}).`,
      );
      await shutdown.sleep(waitSeconds * 1000);
    } while (!shutdown.requested);
  } finally {
    await client?.$disconnect();
    log("CoolPC scheduled crawler stopped.");
  }
}

async function runScheduledCycle(
  client: PrismaClient,
  options: CoolpcDaemonOptions,
): Promise<{ shouldBackoff: boolean }> {
  const lock = await tryAcquireExternalFetchLock({
    lockDir: options.lockDir,
    owner: "crawler-daemon",
    staleSeconds: options.lockStaleSeconds,
  });

  if (!lock) {
    log("Skipping CoolPC scheduled crawl because another external fetch task holds the lock.");

    return {
      shouldBackoff: false,
    };
  }

  log("Starting CoolPC scheduled crawl cycle.");

  try {
    const result = await runCoolpcCategoryCrawl({
      client,
      storageDir: options.storageDir,
      triggerType: CRAWL_TRIGGER_TYPES.SCHEDULED,
      delayMs: options.categoryDelayMs,
      baseUrl: options.baseUrl,
      fetchUserAgent: SCHEDULED_CRAWL_USER_AGENT,
      log,
    });

    printCycleSummary(result);

    return {
      shouldBackoff: shouldBackoffAfter(result),
    };
  } catch (error) {
    log(`CoolPC scheduled crawl cycle failed: ${toSafeErrorMessage(error)}`);

    return {
      shouldBackoff: true,
    };
  } finally {
    await lock.release();
  }
}

function printCycleSummary(result: RunCoolpcCrawlOnceResult): void {
  log(
    `CoolPC scheduled crawl finished. run=${result.crawlRunId} status=${result.status} stoppedBySuspectedBlock=${result.stoppedBySuspectedBlock ? "yes" : "no"}`,
  );

  for (const categoryResult of result.categoryResults) {
    const errorSuffix = categoryResult.errorMessage
      ? ` error=${toSafeCliErrorMessage(categoryResult.errorMessage)}`
      : "";
    log(`IGrp=${categoryResult.igrp} status=${categoryResult.status}${errorSuffix}`);
  }
}

function shouldBackoffAfter(result: RunCoolpcCrawlOnceResult): boolean {
  if (result.stoppedBySuspectedBlock) {
    return true;
  }

  return (
    result.status !== CRAWL_RUN_STATUSES.SUCCESS_CHANGED &&
    result.status !== CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED
  );
}

function parseIntegerOption({
  args,
  argName,
  env,
  envName,
  fallback,
  min,
  max,
}: ParseIntegerOption): number {
  const raw = getStringArg(args, argName) ?? env[envName];

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isFinite(value) || String(value) !== raw.trim()) {
    throw new Error(`${argName}/${envName} must be an integer.`);
  }

  if (value < min) {
    throw new Error(`${argName}/${envName} must be at least ${min}.`);
  }

  if (max !== undefined && value > max) {
    throw new Error(`${argName}/${envName} must be at most ${max}.`);
  }

  return value;
}

function createShutdownController(): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      log(`Received ${signal}; stopping after the current crawler step.`);
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

function toSafeErrorMessage(error: unknown): string {
  return toSafeCliErrorMessage(error);
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:crawl-coolpc-daemon -- --confirm-live-fetch [options]

Options:
  --confirm-live-fetch       Required for scheduled CoolPC live requests.
  --run-once                 Run one scheduled cycle, then exit.
  --interval-seconds <sec>   Delay after a successful cycle.
                             Default: ${DEFAULT_INTERVAL_SECONDS}, minimum: ${MIN_INTERVAL_SECONDS}
  --backoff-seconds <sec>    Delay after fetch/parse/block failures.
                             Default: ${DEFAULT_BACKOFF_SECONDS}, minimum: ${MIN_BACKOFF_SECONDS}
  --category-delay-ms <ms>   Delay between live category requests.
                             Default: ${DEFAULT_COOLPC_CATEGORY_DELAY_MS}, range: ${MIN_CATEGORY_DELAY_MS}-${MAX_CATEGORY_DELAY_MS}
  --lock-dir <path>          Shared external fetch lock directory.
  --lock-stale-seconds <sec> Break stale external fetch locks after this age.
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Default: ${DEFAULT_STORAGE_DIR}

Environment:
  CRAWLER_INTERVAL_SECONDS, CRAWLER_BACKOFF_SECONDS, CRAWLER_CATEGORY_DELAY_MS,
  SNAPSHOT_STORAGE_DIR, EXTERNAL_FETCH_LOCK_DIR, EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  COOLPC_BASE_URL
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeErrorMessage(error));
    process.exitCode = 1;
  });
}
