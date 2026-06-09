// apps/crawler/src/scripts/ops/crawl-coolpc-daemon.ts
import type { PrismaClient } from "@partsradar/db";
import {
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
  DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  tryAcquireExternalFetchLock,
} from "./external-fetch-lock";
import {
  type ImageBackfillOptions,
  parseOptions as parseImageBackfillOptions,
} from "./image-cache-backfill/options";
import { backfillImages, readMissingImageCandidates } from "./image-cache-backfill/processor";
import {
  DEFAULT_PRICE_CHANGE_DISCORD_MAX_ITEMS,
  MAX_PRICE_CHANGE_DISCORD_ITEMS,
  parsePriceChangeDiscordNotificationOptions,
  sendCrawlRunPriceChangeDiscordNotification,
  type PriceChangeDiscordNotificationOptions,
} from "./price-change-discord-notification";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "temp/coolpc-daemon/snapshots";
const DEFAULT_INTERVAL_SECONDS = 1800;
const DEFAULT_BACKOFF_SECONDS = 3600;
const MIN_INTERVAL_SECONDS = 60;
const MIN_BACKOFF_SECONDS = 60;
const MIN_CATEGORY_DELAY_MS = 3000;
const MAX_CATEGORY_DELAY_MS = 60000;
const DEFAULT_IMAGE_BACKFILL_LIMIT = 20;
const MAX_IMAGE_BACKFILL_LIMIT = 50;
const DEFAULT_IMAGE_BACKFILL_MIN_DELAY_MS = 3000;
const DEFAULT_IMAGE_BACKFILL_MAX_DELAY_MS = 8000;
const DEFAULT_IMAGE_BACKFILL_TIMEOUT_MS = 15000;
const MIN_IMAGE_BACKFILL_DELAY_MS = 3000;
const MAX_IMAGE_BACKFILL_DELAY_MS = 60000;
const MIN_IMAGE_BACKFILL_TIMEOUT_MS = 1000;
const MAX_IMAGE_BACKFILL_TIMEOUT_MS = 60000;
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
  priceChangeDiscordNotification: PriceChangeDiscordNotificationOptions;
  imageBackfillLimit: number;
  imageBackfill: ImageBackfillOptions;
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
  const imageBackfillLimit = parseIntegerOption({
    args,
    argName: "--image-backfill-limit",
    env,
    envName: "CRAWLER_IMAGE_BACKFILL_LIMIT",
    fallback: DEFAULT_IMAGE_BACKFILL_LIMIT,
    min: 0,
    max: MAX_IMAGE_BACKFILL_LIMIT,
  });
  const imageBackfillMinDelayMs = parseIntegerOption({
    args,
    argName: "--image-backfill-min-delay-ms",
    env,
    envName: "CRAWLER_IMAGE_BACKFILL_MIN_DELAY_MS",
    fallback: DEFAULT_IMAGE_BACKFILL_MIN_DELAY_MS,
    min: MIN_IMAGE_BACKFILL_DELAY_MS,
    max: MAX_IMAGE_BACKFILL_DELAY_MS,
  });
  const imageBackfillMaxDelayMs = parseIntegerOption({
    args,
    argName: "--image-backfill-max-delay-ms",
    env,
    envName: "CRAWLER_IMAGE_BACKFILL_MAX_DELAY_MS",
    fallback: DEFAULT_IMAGE_BACKFILL_MAX_DELAY_MS,
    min: MIN_IMAGE_BACKFILL_DELAY_MS,
    max: MAX_IMAGE_BACKFILL_DELAY_MS,
  });

  if (imageBackfillMinDelayMs > imageBackfillMaxDelayMs) {
    throw new Error(
      "--image-backfill-min-delay-ms/CRAWLER_IMAGE_BACKFILL_MIN_DELAY_MS must be less than or equal to --image-backfill-max-delay-ms/CRAWLER_IMAGE_BACKFILL_MAX_DELAY_MS.",
    );
  }

  const imageBackfillTimeoutMs = parseIntegerOption({
    args,
    argName: "--image-backfill-timeout-ms",
    env,
    envName: "CRAWLER_IMAGE_BACKFILL_TIMEOUT_MS",
    fallback: DEFAULT_IMAGE_BACKFILL_TIMEOUT_MS,
    min: MIN_IMAGE_BACKFILL_TIMEOUT_MS,
    max: MAX_IMAGE_BACKFILL_TIMEOUT_MS,
  });

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
    priceChangeDiscordNotification: parsePriceChangeDiscordNotificationOptions(args, env),
    imageBackfillLimit,
    imageBackfill: {
      ...parseImageBackfillOptions(
        buildImageBackfillArgs({
          limit: Math.max(imageBackfillLimit, 1),
          minDelayMs: imageBackfillMinDelayMs,
          maxDelayMs: imageBackfillMaxDelayMs,
          timeoutMs: imageBackfillTimeoutMs,
        }),
        cwd,
        env,
      ),
      limit: imageBackfillLimit,
    },
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
      `CoolPC scheduled crawler started. interval=${options.intervalSeconds}s backoff=${options.backoffSeconds}s categoryDelay=${options.categoryDelayMs}ms imageBackfillLimit=${options.imageBackfillLimit} imageBackfillDelay=${options.imageBackfill.minDelayMs}-${options.imageBackfill.maxDelayMs}ms runOnce=${options.runOnce ? "yes" : "no"}`,
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

    const productWriteSummary = summarizeProductWrites(result);
    const shouldBackoff = shouldBackoffAfter(result);
    printCycleSummary(result, productWriteSummary);
    await handlePriceChangeDiscordNotification({
      client,
      crawlRunId: result.crawlRunId,
      options: options.priceChangeDiscordNotification,
      productWriteSummary,
    });
    await runImmediateImageBackfill({
      client,
      options,
      shouldBackoff,
      status: result.status,
      stoppedBySuspectedBlock: result.stoppedBySuspectedBlock,
    });

    return {
      shouldBackoff,
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

export async function runImmediateImageBackfill({
  client,
  options,
  shouldBackoff,
  status,
  stoppedBySuspectedBlock,
}: {
  client: PrismaClient;
  options: CoolpcDaemonOptions;
  shouldBackoff: boolean;
  status: RunCoolpcCrawlOnceResult["status"];
  stoppedBySuspectedBlock: boolean;
}): Promise<void> {
  if (options.imageBackfillLimit <= 0) {
    log("Immediate image backfill skipped. reason=disabled");
    return;
  }

  if (shouldBackoff) {
    log(
      `Immediate image backfill skipped. reason=crawl_not_clean status=${status} stoppedBySuspectedBlock=${stoppedBySuspectedBlock ? "yes" : "no"}`,
    );
    return;
  }

  try {
    const candidates = await readMissingImageCandidates(client, options.imageBackfill);

    log(`Immediate image backfill selected ${candidates.length} missing image candidate(s).`);

    if (candidates.length === 0) {
      return;
    }

    const summary = await backfillImages(candidates, options.imageBackfill);

    log(
      `Immediate image backfill finished. cached=${summary.cached} reused=${summary.reused} skipped=${summary.skipped} invalid=${summary.invalid} failed=${summary.failed} liveFetches=${summary.liveFetches}`,
    );
  } catch (error) {
    log(
      `Immediate image backfill failed without affecting crawler status: ${toSafeErrorMessage(error)}`,
    );
  }
}

async function handlePriceChangeDiscordNotification({
  client,
  crawlRunId,
  options,
  productWriteSummary,
}: {
  client: PrismaClient;
  crawlRunId: string;
  options: PriceChangeDiscordNotificationOptions;
  productWriteSummary: ProductWriteSummaryTotals;
}): Promise<void> {
  try {
    const result = await sendCrawlRunPriceChangeDiscordNotification({
      client,
      crawlRunId,
      options,
    });

    if (result.status === "sent") {
      log(
        `Price change Discord notification sent. changes=${result.changeCount} listed=${result.listedCount} messages=${result.messageCount}`,
      );
      return;
    }

    if (result.status === "rate_limited") {
      log(
        `Price change Discord notification rate limited. changes=${result.changeCount} listed=${result.listedCount} sentMessages=${result.sentMessageCount}/${result.messageCount} retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`,
      );
      return;
    }

    if (result.status === "failed") {
      log(
        `Price change Discord notification failed. changes=${result.changeCount} listed=${result.listedCount} sentMessages=${result.sentMessageCount}/${result.messageCount} httpStatus=${result.httpStatus ?? "none"} message=${toSafeCliErrorMessage(result.message)}`,
      );
      return;
    }

    if (result.reason === "no_price_changes") {
      log(
        `Price change Discord notification skipped. reason=no_existing_product_price_changes priceSnapshots=${productWriteSummary.priceSnapshotCreatedCount} queriedSnapshots=${result.snapshotCount ?? 0} unmatchedSnapshots=${result.unmatchedSnapshotCount ?? 0} unchangedSnapshots=${result.unchangedSnapshotCount ?? 0} currencyMismatches=${result.currencyMismatchCount ?? 0}`,
      );
      return;
    }
  } catch (error) {
    log(`Price change Discord notification failed before completion: ${toSafeErrorMessage(error)}`);
  }
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

function buildImageBackfillArgs({
  limit,
  minDelayMs,
  maxDelayMs,
  timeoutMs,
}: {
  limit: number;
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}): string[] {
  return [
    CONFIRM_LIVE_FETCH_FLAG,
    "--limit",
    String(limit),
    "--min-delay-ms",
    String(minDelayMs),
    "--max-delay-ms",
    String(maxDelayMs),
    "--timeout-ms",
    String(timeoutMs),
  ];
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
  --image-backfill-limit <n> Missing product thumbnails to backfill after a clean crawl.
                             Default: ${DEFAULT_IMAGE_BACKFILL_LIMIT}, range: 0-${MAX_IMAGE_BACKFILL_LIMIT}; 0 disables it.
  --image-backfill-min-delay-ms <ms>
                             Minimum delay between immediate source image requests.
                             Default: ${DEFAULT_IMAGE_BACKFILL_MIN_DELAY_MS}
  --image-backfill-max-delay-ms <ms>
                             Maximum delay between immediate source image requests.
                             Default: ${DEFAULT_IMAGE_BACKFILL_MAX_DELAY_MS}
  --image-backfill-timeout-ms <ms>
                             Immediate source image request timeout.
                             Default: ${DEFAULT_IMAGE_BACKFILL_TIMEOUT_MS}
  --lock-dir <path>          Shared external fetch lock directory.
  --lock-stale-seconds <sec> Break stale external fetch locks after this age.
  --price-change-discord-max-items <n>
                             Public Discord price-change rows per crawl.
                             Default: ${DEFAULT_PRICE_CHANGE_DISCORD_MAX_ITEMS}, range: 1-${MAX_PRICE_CHANGE_DISCORD_ITEMS}
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Default: ${DEFAULT_STORAGE_DIR}

Environment:
  CRAWLER_INTERVAL_SECONDS, CRAWLER_BACKOFF_SECONDS, CRAWLER_CATEGORY_DELAY_MS,
  CRAWLER_IMAGE_BACKFILL_LIMIT, CRAWLER_IMAGE_BACKFILL_MIN_DELAY_MS,
  CRAWLER_IMAGE_BACKFILL_MAX_DELAY_MS, CRAWLER_IMAGE_BACKFILL_TIMEOUT_MS,
  SNAPSHOT_STORAGE_DIR, EXTERNAL_FETCH_LOCK_DIR, EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  PRODUCT_IMAGE_STORAGE_DIR, COOLPC_BASE_URL, DISCORD_PUBLIC_WEBHOOK_URL,
  PARTSRADAR_PUBLIC_BASE_URL, PRICE_CHANGE_DISCORD_MAX_ITEMS
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeErrorMessage(error));
    process.exitCode = 1;
  });
}
