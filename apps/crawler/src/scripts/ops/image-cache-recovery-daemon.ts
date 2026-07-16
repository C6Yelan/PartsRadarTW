// apps/crawler/src/scripts/ops/image-cache-recovery-daemon.ts
// Runs bounded image recovery independently so image failures cannot delay the price crawler cadence.

import type { PrismaClient } from "@partsradar/db";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  type BackfillSummary,
  type ImageBackfillOptions,
  parseOptions as parseImageOptions,
} from "./image-cache-backfill/options";
import {
  backfillImages,
  type ImageRecoverySelectionTelemetry,
  readBoundedImageRecoveryBatch,
} from "./image-cache-backfill/processor";
import { createOpsLogger } from "./shared/logger";
import { createInterruptibleShutdownController } from "./shared/shutdown";

const logger = createOpsLogger();
const DEFAULT_INTERVAL_SECONDS = 300;
const DEFAULT_BATCH_LIMIT = 25;

export interface ImageRecoveryDaemonOptions {
  intervalSeconds: number;
  batchLimit: number;
  runOnce: boolean;
  imageOptions: ImageBackfillOptions;
}

interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseImageRecoveryDaemonOptions(args);
  const shutdown = createInterruptibleShutdownController();
  let client: PrismaClient | null = null;

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;
    await runImageRecoveryDaemon(client, options, shutdown);
  } finally {
    await client?.$disconnect();
  }
}

export function parseImageRecoveryDaemonOptions(
  args: string[],
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): ImageRecoveryDaemonOptions {
  const imageOptions = parseImageOptions(args, cwd, env);
  if (imageOptions.dryRun) {
    throw new Error("Refusing image recovery daemon live fetch without --confirm-live-fetch.");
  }

  const minDelayMs = readNonNegativeInteger(
    env.CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS,
    imageOptions.minDelayMs,
    "CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS",
  );
  const maxDelayMs = readNonNegativeInteger(
    env.CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
    imageOptions.maxDelayMs,
    "CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS",
  );
  if (minDelayMs > maxDelayMs) {
    throw new Error(
      "CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS must be less than or equal to CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS.",
    );
  }

  return {
    intervalSeconds: readPositiveInteger(
      env.IMAGE_RECOVERY_INTERVAL_SECONDS,
      DEFAULT_INTERVAL_SECONDS,
      "IMAGE_RECOVERY_INTERVAL_SECONDS",
    ),
    batchLimit: readPositiveInteger(
      env.IMAGE_RECOVERY_BATCH_LIMIT,
      DEFAULT_BATCH_LIMIT,
      "IMAGE_RECOVERY_BATCH_LIMIT",
    ),
    runOnce: args.includes("--run-once"),
    imageOptions: {
      ...imageOptions,
      limit: null,
      productId: null,
      igrp: null,
      minDelayMs,
      maxDelayMs,
      timeoutMs: readPositiveInteger(
        env.CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
        imageOptions.timeoutMs,
        "CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS",
      ),
      maxSourceBytes: readPositiveInteger(
        env.CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
        imageOptions.maxSourceBytes,
        "CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES",
      ),
      overwrite: false,
    },
  };
}

async function runImageRecoveryDaemon(
  client: PrismaClient,
  options: ImageRecoveryDaemonOptions,
  shutdown: ShutdownController,
): Promise<void> {
  do {
    try {
      const cycleNow = new Date();
      const recoveryBatch = await readBoundedImageRecoveryBatch(
        client,
        options.imageOptions,
        options.batchLimit,
        cycleNow,
      );
      const summary = await backfillImages(
        recoveryBatch.candidates,
        options.imageOptions,
        {
          log: (message) => logger.debug(message),
          debugLog: (message) => logger.debug(message),
        },
        client,
      );
      const selection = recoveryBatch.telemetry;
      logger.info(formatImageRecoveryCycleSummary(selection, summary));
    } catch (error) {
      logger.error(`Image recovery cycle failed: ${toSafeCliErrorMessage(error)}`);
      if (options.runOnce) {
        throw error;
      }
    }

    if (options.runOnce || shutdown.requested) {
      break;
    }
    await shutdown.sleep(options.intervalSeconds * 1000);
  } while (!shutdown.requested);
}

export function formatImageRecoveryCycleSummary(
  selection: ImageRecoverySelectionTelemetry,
  summary: BackfillSummary,
): string {
  return `Image recovery cycle finished. neverCheckedRead=${selection.neverCheckedRead} retryDueRead=${selection.retryDueRead} auditRead=${selection.auditRead} reconciledExisting=${selection.reconciledExisting} selectedForBackfill=${selection.selectedForBackfill} cached=${summary.cached} reused=${summary.reused} failed=${summary.failed} invalid=${summary.invalid} liveFetches=${summary.liveFetches}`;
}

function readPositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function readNonNegativeInteger(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function printHelp(): void {
  console.log("Usage: pnpm ops:image-cache:recovery-daemon -- --confirm-live-fetch [--run-once]");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
