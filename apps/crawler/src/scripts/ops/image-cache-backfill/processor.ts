// apps/crawler/src/scripts/ops/image-cache-backfill/processor.ts
import { join, relative } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import { normalizeCoolpcProductImageUrl } from "../../../coolpc/parser";
import {
  createProductImageCandidateByIdsWhere,
  createProductImageCandidateSelect,
  createProductImageCandidateWhere,
  MISSING_IMAGE_CANDIDATE_BY_IDS_ORDER_BY,
  MISSING_IMAGE_CANDIDATE_ORDER_BY,
  PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
} from "./candidate-query";
import {
  createWebpThumbnail,
  delay,
  fetchSourceImageBytes,
  formatBytes,
  pathExists,
  randomDelayMs,
  toErrorMessage,
  writeFileAtomically,
  writeFileFromReusableImage,
} from "./image-files";
import type { BackfillSummary, ImageBackfillOptions } from "./options";

export interface ProductImageCandidate {
  id: string;
  name: string;
  primaryImageUrl: string | null;
  primaryImageCheckedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

type ProcessStatus = "cached" | "dry-run" | "failed" | "invalid" | "reused" | "skipped";

interface ProcessResult {
  status: ProcessStatus;
  didFetch: boolean;
}

interface BackfillLoggers {
  log?: (message: string) => void;
  debugLog?: (message: string) => void;
}

export async function readCandidates(
  client: PrismaClient,
  options: ImageBackfillOptions,
): Promise<ProductImageCandidate[]> {
  return client.product.findMany({
    where: createProductImageCandidateWhere(options),
    select: createProductImageCandidateSelect(),
    orderBy: PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
    take: options.limit ?? undefined,
  });
}

export async function readMissingImageCandidates(
  client: PrismaClient,
  options: ImageBackfillOptions,
): Promise<ProductImageCandidate[]> {
  const candidates = await client.product.findMany({
    where: createProductImageCandidateWhere(options),
    select: createProductImageCandidateSelect(),
    orderBy: MISSING_IMAGE_CANDIDATE_ORDER_BY,
  });
  const missingCandidates: ProductImageCandidate[] = [];

  for (const candidate of candidates) {
    if (await pathExists(join(options.storageDir, `${candidate.id}.webp`))) {
      continue;
    }

    missingCandidates.push(candidate);

    if (options.limit !== null && missingCandidates.length >= options.limit) {
      break;
    }
  }

  return missingCandidates;
}

export async function readMissingImageCandidatesByProductIds(
  client: PrismaClient,
  options: ImageBackfillOptions,
  productIds: string[],
): Promise<ProductImageCandidate[]> {
  const uniqueProductIds = [...new Set(productIds)];

  if (uniqueProductIds.length === 0) {
    return [];
  }

  const candidates = await client.product.findMany({
    where: createProductImageCandidateByIdsWhere(uniqueProductIds),
    select: createProductImageCandidateSelect(),
    orderBy: MISSING_IMAGE_CANDIDATE_BY_IDS_ORDER_BY,
  });
  const missingCandidates: ProductImageCandidate[] = [];

  for (const candidate of candidates) {
    if (await pathExists(join(options.storageDir, `${candidate.id}.webp`))) {
      continue;
    }

    missingCandidates.push(candidate);
  }

  return missingCandidates;
}

export async function backfillImages(
  candidates: ProductImageCandidate[],
  options: ImageBackfillOptions,
  loggers: BackfillLoggers = {},
): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    selected: candidates.length,
    cached: 0,
    dryRun: 0,
    skipped: 0,
    reused: 0,
    invalid: 0,
    failed: 0,
    liveFetches: 0,
  };

  const log = loggers.log ?? console.log;
  const debugLog = loggers.debugLog ?? (() => {});

  log(`Selected ${candidates.length} product image candidate(s).`);
  log(`Output directory: ${relative(options.workspaceRoot, options.storageDir)}`);
  log(
    options.dryRun
      ? "Mode: dry run; no source requests will be sent."
      : `Mode: live fetch; delay between source requests is ${options.minDelayMs}-${options.maxDelayMs}ms.`,
  );
  log("Duplicate source image URLs are downloaded once and reused locally.");

  const reusableImagePathsBySourceUrl = new Map<string, string>();

  for (const candidate of candidates) {
    const result = await processCandidate(
      candidate,
      options,
      summary.liveFetches,
      reusableImagePathsBySourceUrl,
      { debugLog, log },
    );
    summary[result.status === "dry-run" ? "dryRun" : result.status] += 1;

    if (result.didFetch) {
      summary.liveFetches += 1;
    }
  }

  return summary;
}

async function processCandidate(
  candidate: ProductImageCandidate,
  options: ImageBackfillOptions,
  liveFetches: number,
  reusableImagePathsBySourceUrl: Map<string, string>,
  { debugLog, log }: Required<BackfillLoggers>,
): Promise<ProcessResult> {
  const outputPath = join(options.storageDir, `${candidate.id}.webp`);
  const label = `${candidate.sourceCategory.displayName} IGrp=${candidate.sourceCategory.igrp}`;

  try {
    const sourceImageUrl = candidate.primaryImageUrl;

    if (!sourceImageUrl) {
      log(`[invalid] ${candidate.id} | missing image URL | ${candidate.name}`);
      return { status: "invalid", didFetch: false };
    }

    const normalizedImageUrl = normalizeCoolpcProductImageUrl(
      sourceImageUrl,
      candidate.sourceCategory.igrp,
    );

    if (!normalizedImageUrl) {
      log(`[invalid] ${candidate.id} | invalid source image URL | ${sourceImageUrl}`);
      return { status: "invalid", didFetch: false };
    }

    if (!options.overwrite && (await pathExists(outputPath))) {
      if (!reusableImagePathsBySourceUrl.has(normalizedImageUrl)) {
        reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);
      }

      debugLog(
        `[skipped] ${candidate.id} | existing ${relative(options.workspaceRoot, outputPath)} | ${candidate.name}`,
      );
      return { status: "skipped", didFetch: false };
    }

    const reusableImagePath = reusableImagePathsBySourceUrl.get(normalizedImageUrl);

    if (options.dryRun) {
      if (!reusableImagePath) {
        reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);
      }

      debugLog(
        `[dry-run] ${candidate.id} | ${label} | ${
          reusableImagePath ? "reuse local thumbnail" : normalizedImageUrl
        } -> ${relative(options.workspaceRoot, outputPath)}`,
      );
      return { status: "dry-run", didFetch: false };
    }

    if (reusableImagePath) {
      await writeFileFromReusableImage(reusableImagePath, outputPath);
      reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);

      debugLog(
        `[reused] ${candidate.id} | ${relative(options.workspaceRoot, reusableImagePath)} -> ${relative(
          options.workspaceRoot,
          outputPath,
        )} | ${candidate.name}`,
      );

      return { status: "reused", didFetch: false };
    }

    if (liveFetches > 0) {
      const waitMs = randomDelayMs(options.minDelayMs, options.maxDelayMs);
      debugLog(`Waiting ${waitMs}ms before the next source image request...`);
      await delay(waitMs);
    }

    const sourceBytes = await fetchSourceImageBytes(normalizedImageUrl, options);
    const thumbnailBytes = await createWebpThumbnail(sourceBytes);
    await writeFileAtomically(outputPath, thumbnailBytes);
    reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);

    debugLog(
      `[cached] ${candidate.id} | ${label} | ${formatBytes(sourceBytes.byteLength)} -> ${formatBytes(
        thumbnailBytes.byteLength,
      )} | ${candidate.name}`,
    );

    return { status: "cached", didFetch: true };
  } catch (error) {
    log(`[failed] ${candidate.id} | ${toErrorMessage(error)} | ${candidate.name}`);
    return { status: "failed", didFetch: true };
  }
}
