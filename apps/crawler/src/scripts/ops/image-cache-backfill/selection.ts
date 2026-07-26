// 選取手動補圖與自動 recovery 候選，並校正已存在的本地快取。

import { join } from "node:path";
import type { Prisma, PrismaClient } from "@partsradar/db";
import { markImageCacheReady } from "./cache-state";
import {
  CACHED_IMAGE_AUDIT_ORDER_BY,
  createCachedImageAuditWhere,
  createDueImageRetryWhere,
  createNeverCheckedImageRecoveryWhere,
  createProductImageCandidateSelect,
  createProductImageCandidateWhere,
  DUE_IMAGE_RETRY_ORDER_BY,
  NEVER_CHECKED_IMAGE_RECOVERY_ORDER_BY,
  PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
} from "./candidate-query";
import { pathExists } from "./image-files";
import type { ImageBackfillOptions } from "./options";
import type {
  ImageRecoveryBatch,
  ImageRecoverySelectionTelemetry,
  ProductImageCandidate,
} from "./types";

export async function readCandidates(
  client: PrismaClient,
  options: ImageBackfillOptions,
  now = new Date(),
): Promise<ProductImageCandidate[]> {
  const candidates = await client.product.findMany({
    where: createProductImageCandidateWhere(options, now),
    select: createProductImageCandidateSelect(),
    orderBy: PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
  });
  const selected: ProductImageCandidate[] = [];

  for (const candidate of candidates) {
    const webpExists = await pathExists(join(options.storageDir, `${candidate.id}.webp`));
    if (webpExists || isMissingImageEligible(candidate, options, now)) selected.push(candidate);
    if (options.limit !== null && selected.length >= options.limit) break;
  }
  return selected;
}

export async function readBoundedImageRecoveryBatch(
  client: PrismaClient,
  options: ImageBackfillOptions,
  limit: number,
  now = new Date(),
): Promise<ImageRecoveryBatch> {
  const telemetry: ImageRecoverySelectionTelemetry = {
    neverCheckedRead: 0,
    retryDueRead: 0,
    auditRead: 0,
    reconciledExisting: 0,
    selectedForBackfill: 0,
  };
  const orderedCandidates: ProductImageCandidate[] = [];
  const seenProductIds = new Set<string>();
  let totalRead = 0;

  const readLane = async (
    telemetryKey: "neverCheckedRead" | "retryDueRead" | "auditRead",
    where: Prisma.ProductWhereInput,
    orderBy: Prisma.ProductOrderByWithRelationInput[],
  ): Promise<void> => {
    const remaining = limit - totalRead;
    if (remaining <= 0) return;
    const laneCandidates = (await client.product.findMany({
      where,
      select: createProductImageCandidateSelect(),
      orderBy,
      take: remaining,
    })) as ProductImageCandidate[];
    telemetry[telemetryKey] = laneCandidates.length;
    totalRead += laneCandidates.length;
    for (const candidate of laneCandidates) {
      if (!seenProductIds.has(candidate.id)) {
        seenProductIds.add(candidate.id);
        orderedCandidates.push(candidate);
      }
    }
  };

  await readLane(
    "neverCheckedRead",
    createNeverCheckedImageRecoveryWhere(options, now),
    NEVER_CHECKED_IMAGE_RECOVERY_ORDER_BY,
  );
  await readLane("retryDueRead", createDueImageRetryWhere(options, now), DUE_IMAGE_RETRY_ORDER_BY);
  await readLane(
    "auditRead",
    createCachedImageAuditWhere(options, now),
    CACHED_IMAGE_AUDIT_ORDER_BY,
  );

  const missingCandidates: ProductImageCandidate[] = [];
  for (const candidate of orderedCandidates) {
    if (await pathExists(join(options.storageDir, `${candidate.id}.webp`))) {
      await markImageCacheReady(client, candidate.id, now);
      telemetry.reconciledExisting += 1;
    } else if (
      isMissingImageEligible(candidate, options, now) &&
      (!candidate.imageCacheNextRetryAt || candidate.imageCacheNextRetryAt <= now)
    ) {
      missingCandidates.push(candidate);
    }
  }

  telemetry.selectedForBackfill = missingCandidates.length;
  return { candidates: missingCandidates, telemetry };
}

function isMissingImageEligible(
  candidate: ProductImageCandidate,
  options: ImageBackfillOptions,
  now: Date,
): boolean {
  if (options.productId === candidate.id || candidate.isActive) return true;
  const retentionCutoff = now.getTime() - options.inactiveRetentionDays * 24 * 60 * 60 * 1000;
  return candidate.priceSnapshots.some(
    (snapshot) => snapshot.capturedAt.getTime() >= retentionCutoff,
  );
}
