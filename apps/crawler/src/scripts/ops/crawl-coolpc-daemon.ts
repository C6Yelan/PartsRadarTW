// apps/crawler/src/scripts/ops/crawl-coolpc-daemon.ts
import type { PrismaClient } from "@partsradar/db";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  type CrawlRunCategoryProductWriteSummary,
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
  clearExternalFetchPriority,
  DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
  requestExternalFetchPriority,
  tryAcquireExternalFetchLock,
} from "./external-fetch-lock";
import type { BackfillSummary, ImageBackfillOptions } from "./image-cache-backfill/options";
import {
  backfillImages,
  readMissingImageCandidatesByProductIds,
} from "./image-cache-backfill/processor";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "temp/coolpc-daemon/snapshots";
const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "storage/product-images";
const DEFAULT_INTERVAL_SECONDS = 1800;
const DEFAULT_BACKOFF_SECONDS = 3600;
const DEFAULT_ALL_FETCH_FAILED_RETRY_SECONDS = 600;
const DEFAULT_LOCK_RETRY_SECONDS = 120;
const DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS = 5000;
const DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS = 12000;
const DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS = 15000;
const DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MIN_INTERVAL_SECONDS = 60;
const MIN_BACKOFF_SECONDS = 60;
const MIN_LOCK_RETRY_SECONDS = 30;
const MAX_LOCK_RETRY_SECONDS = 600;
const MIN_CATEGORY_DELAY_MS = 3000;
const MAX_CATEGORY_DELAY_MS = 60000;
const MIN_NEW_PRODUCT_IMAGE_DELAY_MS = 1000;
const MAX_NEW_PRODUCT_IMAGE_DELAY_MS = 60000;
const MIN_NEW_PRODUCT_IMAGE_TIMEOUT_MS = 1000;
const MAX_NEW_PRODUCT_IMAGE_TIMEOUT_MS = 120000;
const MIN_NEW_PRODUCT_IMAGE_SOURCE_BYTES = 64 * 1024;
const MAX_NEW_PRODUCT_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024;
const SCHEDULED_CRAWL_USER_AGENT =
  "PartsRadarTW scheduled crawler (+https://github.com/C6Yelan/PartsRadarTW)";

export interface NewProductImageBackfillOptions {
  workspaceRoot: string;
  storageDir: string;
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  maxSourceBytes: number;
}

export interface CoolpcDaemonOptions {
  workspaceRoot: string;
  storageDir: string;
  intervalSeconds: number;
  backoffSeconds: number;
  categoryDelayMs: number;
  lockDir: string;
  lockStaleSeconds: number;
  lockRetrySeconds: number;
  prioritySignalTtlSeconds: number;
  runOnce: boolean;
  baseUrl?: string;
  newProductImageBackfill: NewProductImageBackfillOptions;
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

type ProductWriteSummaryTotals = CrawlRunCategoryProductWriteSummary;

type NewProductImageBackfillHandler = (args: {
  client: PrismaClient;
  productIds: string[];
  options: NewProductImageBackfillOptions;
}) => Promise<void>;

interface ScheduledCycleResult {
  shouldBackoff: boolean;
  retryAfterSeconds?: number;
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
  const newProductImageBackfill = parseNewProductImageBackfillOptions(args, env, workspaceRoot);

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
    lockRetrySeconds: parseIntegerOption({
      args,
      argName: "--lock-retry-seconds",
      env,
      envName: "CRAWLER_LOCK_RETRY_SECONDS",
      fallback: DEFAULT_LOCK_RETRY_SECONDS,
      min: MIN_LOCK_RETRY_SECONDS,
      max: MAX_LOCK_RETRY_SECONDS,
    }),
    prioritySignalTtlSeconds: parseIntegerOption({
      args,
      argName: "--priority-signal-ttl-seconds",
      env,
      envName: "EXTERNAL_FETCH_PRIORITY_TTL_SECONDS",
      fallback: DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
      min: 60,
      max: 60 * 60,
    }),
    runOnce: args.includes("--run-once"),
    baseUrl: validateCoolpcBaseUrl(env.COOLPC_BASE_URL),
    newProductImageBackfill,
  };
}

function parseNewProductImageBackfillOptions(
  args: string[],
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
): NewProductImageBackfillOptions {
  const minDelayMs = parseIntegerOption({
    args,
    argName: "--new-product-image-min-delay-ms",
    env,
    envName: "CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS",
    fallback: DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS,
    min: MIN_NEW_PRODUCT_IMAGE_DELAY_MS,
    max: MAX_NEW_PRODUCT_IMAGE_DELAY_MS,
  });
  const maxDelayMs = parseIntegerOption({
    args,
    argName: "--new-product-image-max-delay-ms",
    env,
    envName: "CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS",
    fallback: DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
    min: MIN_NEW_PRODUCT_IMAGE_DELAY_MS,
    max: MAX_NEW_PRODUCT_IMAGE_DELAY_MS,
  });

  if (minDelayMs > maxDelayMs) {
    throw new Error(
      "--new-product-image-min-delay-ms/CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS must be less than or equal to --new-product-image-max-delay-ms/CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS.",
    );
  }

  return {
    workspaceRoot,
    storageDir: resolveRelativeToWorkspace(
      workspaceRoot,
      getStringArg(args, "--product-image-storage-dir") ??
        env.PRODUCT_IMAGE_STORAGE_DIR ??
        DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
    ),
    minDelayMs,
    maxDelayMs,
    timeoutMs: parseIntegerOption({
      args,
      argName: "--new-product-image-timeout-ms",
      env,
      envName: "CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS",
      fallback: DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
      min: MIN_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
      max: MAX_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
    }),
    maxSourceBytes: parseIntegerOption({
      args,
      argName: "--new-product-image-max-source-bytes",
      env,
      envName: "CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES",
      fallback: DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
      min: MIN_NEW_PRODUCT_IMAGE_SOURCE_BYTES,
      max: MAX_NEW_PRODUCT_IMAGE_SOURCE_BYTES,
    }),
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
      `CoolPC scheduled crawler started. interval=${options.intervalSeconds}s backoff=${options.backoffSeconds}s categoryDelay=${options.categoryDelayMs}ms newProductImageDelay=${options.newProductImageBackfill.minDelayMs}-${options.newProductImageBackfill.maxDelayMs}ms runOnce=${options.runOnce ? "yes" : "no"}`,
    );

    do {
      const result = await runScheduledCycle(client, options);

      if (options.runOnce || shutdown.requested) {
        break;
      }

      const waitSeconds =
        result.retryAfterSeconds ??
        (result.shouldBackoff ? options.backoffSeconds : options.intervalSeconds);
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

export async function runScheduledCycle(
  client: PrismaClient,
  options: CoolpcDaemonOptions,
  dependencies: {
    acquireLock?: typeof tryAcquireExternalFetchLock;
    requestPriority?: typeof requestExternalFetchPriority;
    clearPriority?: typeof clearExternalFetchPriority;
    crawlCategories?: typeof runCoolpcCategoryCrawl;
    backfillNewProductImages?: NewProductImageBackfillHandler;
  } = {},
): Promise<ScheduledCycleResult> {
  const acquireLock = dependencies.acquireLock ?? tryAcquireExternalFetchLock;
  const requestPriority = dependencies.requestPriority ?? requestExternalFetchPriority;
  const clearPriority = dependencies.clearPriority ?? clearExternalFetchPriority;
  const crawlCategories = dependencies.crawlCategories ?? runCoolpcCategoryCrawl;
  const backfillNewProductImages =
    dependencies.backfillNewProductImages ?? handleNewProductImageBackfill;
  const lock = await acquireLock({
    lockDir: options.lockDir,
    owner: "crawler-daemon",
    staleSeconds: options.lockStaleSeconds,
  });

  if (!lock) {
    await requestPriority({
      lockDir: options.lockDir,
      owner: "crawler-daemon",
      ttlSeconds: options.prioritySignalTtlSeconds,
    });
    log(
      `Skipping CoolPC scheduled crawl because another external fetch task holds the lock. Requested priority retry in ${options.lockRetrySeconds}s.`,
    );

    return {
      shouldBackoff: false,
      retryAfterSeconds: options.lockRetrySeconds,
    };
  }

  await clearPriority({
    lockDir: options.lockDir,
    owner: "crawler-daemon",
  });

  log("Starting CoolPC scheduled crawl cycle.");

  let result: RunCoolpcCrawlOnceResult;
  let productWriteSummary: ProductWriteSummaryTotals;
  let shouldBackoff: boolean;

  try {
    result = await crawlCategories({
      client,
      storageDir: options.storageDir,
      triggerType: CRAWL_TRIGGER_TYPES.SCHEDULED,
      delayMs: options.categoryDelayMs,
      baseUrl: options.baseUrl,
      fetchUserAgent: SCHEDULED_CRAWL_USER_AGENT,
      log,
    });

    productWriteSummary = summarizeProductWrites(result);
    shouldBackoff = shouldBackoffAfter(result);
    printCycleSummary(result, productWriteSummary);
  } catch (error) {
    log(`CoolPC scheduled crawl cycle failed: ${toSafeErrorMessage(error)}`);

    return {
      shouldBackoff: true,
    };
  } finally {
    await lock.release();
  }

  const retryAfterSeconds = resolveAllFetchFailedRetrySeconds(result, options);

  if (retryAfterSeconds !== undefined) {
    log(
      `All CoolPC categories failed during fetch. Retrying in ${retryAfterSeconds}s before using the regular ${options.backoffSeconds}s backoff.`,
    );
  }

  if (shouldBackoff) {
    if (productWriteSummary.createdProductIds.length > 0) {
      log(
        `New product image backfill skipped. reason=crawl_not_clean status=${result.status} stoppedBySuspectedBlock=${result.stoppedBySuspectedBlock ? "yes" : "no"} createdProducts=${productWriteSummary.createdProductIds.length}`,
      );
    }
  } else {
    await backfillNewProductImages({
      client,
      productIds: productWriteSummary.createdProductIds,
      options: options.newProductImageBackfill,
    });
  }

  return retryAfterSeconds === undefined
    ? {
        shouldBackoff,
      }
    : {
        shouldBackoff,
        retryAfterSeconds,
      };
}

async function handleNewProductImageBackfill({
  client,
  productIds,
  options,
}: {
  client: PrismaClient;
  productIds: string[];
  options: NewProductImageBackfillOptions;
}): Promise<void> {
  const uniqueProductIds = [...new Set(productIds)];

  if (uniqueProductIds.length === 0) {
    return;
  }

  const imageOptions = createImageBackfillOptions(options);

  try {
    const candidates = await readMissingImageCandidatesByProductIds(
      client,
      imageOptions,
      uniqueProductIds,
    );

    if (candidates.length === 0) {
      log(`New product image backfill skipped. createdProducts=${uniqueProductIds.length}`);
      return;
    }

    log(
      `Starting new product image backfill. createdProducts=${uniqueProductIds.length} candidates=${candidates.length}`,
    );
    const summary = await backfillImages(candidates, imageOptions);
    logNewProductImageBackfillSummary(summary, uniqueProductIds.length);
  } catch (error) {
    log(`New product image backfill failed: ${toSafeErrorMessage(error)}`);
  }
}

function createImageBackfillOptions(options: NewProductImageBackfillOptions): ImageBackfillOptions {
  return {
    workspaceRoot: options.workspaceRoot,
    storageDir: options.storageDir,
    limit: null,
    productId: null,
    igrp: null,
    minDelayMs: options.minDelayMs,
    maxDelayMs: options.maxDelayMs,
    timeoutMs: options.timeoutMs,
    maxSourceBytes: options.maxSourceBytes,
    dryRun: false,
    overwrite: false,
  };
}

function logNewProductImageBackfillSummary(
  summary: BackfillSummary,
  createdProductCount: number,
): void {
  log(
    `New product image backfill finished. createdProducts=${createdProductCount} selected=${summary.selected} cached=${summary.cached} reused=${summary.reused} skipped=${summary.skipped} invalid=${summary.invalid} failed=${summary.failed} liveFetches=${summary.liveFetches}`,
  );
}

function printCycleSummary(
  result: RunCoolpcCrawlOnceResult,
  productWriteSummary: ProductWriteSummaryTotals,
): void {
  log(
    `CoolPC scheduled crawl finished. run=${result.crawlRunId} status=${result.status} stoppedBySuspectedBlock=${result.stoppedBySuspectedBlock ? "yes" : "no"} items=${productWriteSummary.processedItemCount} createdProducts=${productWriteSummary.createdProductCount} updatedProducts=${productWriteSummary.updatedProductCount} priceSnapshots=${productWriteSummary.priceSnapshotCreatedCount} priceUnchanged=${productWriteSummary.priceUnchangedCount} missingUpdated=${productWriteSummary.missingProductUpdatedCount} markedInactive=${productWriteSummary.markedInactiveProductCount}`,
  );

  for (const categoryResult of result.categoryResults) {
    const errorSuffix = categoryResult.errorMessage
      ? ` error=${toSafeCliErrorMessage(categoryResult.errorMessage)}`
      : "";
    const writeSuffix = categoryResult.productWriteSummary
      ? ` items=${categoryResult.productWriteSummary.processedItemCount} createdProducts=${categoryResult.productWriteSummary.createdProductCount} updatedProducts=${categoryResult.productWriteSummary.updatedProductCount} priceSnapshots=${categoryResult.productWriteSummary.priceSnapshotCreatedCount} priceUnchanged=${categoryResult.productWriteSummary.priceUnchangedCount} missingUpdated=${categoryResult.productWriteSummary.missingProductUpdatedCount} markedInactive=${categoryResult.productWriteSummary.markedInactiveProductCount}`
      : "";
    log(`IGrp=${categoryResult.igrp} status=${categoryResult.status}${writeSuffix}${errorSuffix}`);
  }
}

function summarizeProductWrites(result: RunCoolpcCrawlOnceResult): ProductWriteSummaryTotals {
  const totals: ProductWriteSummaryTotals = {
    processedItemCount: 0,
    createdProductCount: 0,
    createdProductIds: [],
    updatedProductCount: 0,
    priceSnapshotCreatedCount: 0,
    priceUnchangedCount: 0,
    missingProductUpdatedCount: 0,
    markedInactiveProductCount: 0,
  };

  for (const categoryResult of result.categoryResults) {
    if (!categoryResult.productWriteSummary) {
      continue;
    }

    totals.processedItemCount += categoryResult.productWriteSummary.processedItemCount;
    totals.createdProductCount += categoryResult.productWriteSummary.createdProductCount;
    totals.createdProductIds.push(...categoryResult.productWriteSummary.createdProductIds);
    totals.updatedProductCount += categoryResult.productWriteSummary.updatedProductCount;
    totals.priceSnapshotCreatedCount +=
      categoryResult.productWriteSummary.priceSnapshotCreatedCount;
    totals.priceUnchangedCount += categoryResult.productWriteSummary.priceUnchangedCount;
    totals.missingProductUpdatedCount +=
      categoryResult.productWriteSummary.missingProductUpdatedCount;
    totals.markedInactiveProductCount +=
      categoryResult.productWriteSummary.markedInactiveProductCount;
  }

  return totals;
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

function resolveAllFetchFailedRetrySeconds(
  result: RunCoolpcCrawlOnceResult,
  options: CoolpcDaemonOptions,
): number | undefined {
  if (!isAllCategoryFetchFailed(result)) {
    return undefined;
  }

  return Math.min(options.backoffSeconds, DEFAULT_ALL_FETCH_FAILED_RETRY_SECONDS);
}

function isAllCategoryFetchFailed(result: RunCoolpcCrawlOnceResult): boolean {
  return (
    result.categoryResults.length > 0 &&
    result.categoryResults.every(
      (categoryResult) => categoryResult.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED,
    )
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
  --lock-retry-seconds <sec> Delay before retrying when another external fetch task holds the lock.
                             Default: ${DEFAULT_LOCK_RETRY_SECONDS}, range: ${MIN_LOCK_RETRY_SECONDS}-${MAX_LOCK_RETRY_SECONDS}
  --category-delay-ms <ms>   Delay between live category requests.
                             Default: ${DEFAULT_COOLPC_CATEGORY_DELAY_MS}, range: ${MIN_CATEGORY_DELAY_MS}-${MAX_CATEGORY_DELAY_MS}
  --new-product-image-min-delay-ms <ms>
                             Minimum delay between new-product image requests.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS}
  --new-product-image-max-delay-ms <ms>
                             Maximum delay between new-product image requests.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS}
  --new-product-image-timeout-ms <ms>
                             Timeout for each new-product source image request.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS}
  --new-product-image-max-source-bytes <bytes>
                             Maximum accepted source image size for new products.
                             Default: ${DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES}
  --product-image-storage-dir <path>
                             Product image cache directory from the workspace root.
                             Default: PRODUCT_IMAGE_STORAGE_DIR, then ${DEFAULT_PRODUCT_IMAGE_STORAGE_DIR}
  --lock-dir <path>          Shared external fetch lock directory.
  --lock-stale-seconds <sec> Break stale external fetch locks after this age.
  --priority-signal-ttl-seconds <sec>
                             Higher-priority external fetch signal TTL.
                             Default: ${DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS}
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Default: ${DEFAULT_STORAGE_DIR}

Environment:
  CRAWLER_INTERVAL_SECONDS, CRAWLER_BACKOFF_SECONDS, CRAWLER_LOCK_RETRY_SECONDS,
  CRAWLER_CATEGORY_DELAY_MS,
  CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS, CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
  CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS, CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
  SNAPSHOT_STORAGE_DIR, EXTERNAL_FETCH_LOCK_DIR, EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
  PRODUCT_IMAGE_STORAGE_DIR, COOLPC_BASE_URL
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeErrorMessage(error));
    process.exitCode = 1;
  });
}
