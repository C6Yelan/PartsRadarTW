// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/new-product-images.ts

import type { PrismaClient } from "@partsradar/db";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { BackfillSummary, ImageBackfillOptions } from "../image-cache-backfill/options";
import {
  backfillImages,
  readMissingImageCandidatesByProductIds,
} from "../image-cache-backfill/processor";
import { createOpsLogger } from "../shared/logger";
import type { NewProductImageBackfillOptions } from "./options";

const logger = createOpsLogger();

export type NewProductImageBackfillHandler = (args: {
  client: PrismaClient;
  productIds: string[];
  options: NewProductImageBackfillOptions;
}) => Promise<void>;

export async function handleNewProductImageBackfill({
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
    const summary = await backfillImages(candidates, imageOptions, {
      log: (message) => logger.info(message),
      debugLog: (message) => logger.debug(message),
    });
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

function toSafeErrorMessage(error: unknown): string {
  return toSafeCliErrorMessage(error);
}

function log(message: string): void {
  logger.info(message);
}
