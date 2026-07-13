// apps/crawler/src/scripts/ops/image-cache-backfill/processor.ts
// 執行商品圖片補圖核心流程：讀取候選、避開既有快取、重用相同來源圖並寫入 WebP 縮圖。

import { join, relative } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import { normalizeCoolpcProductImageUrl } from "../../../coolpc/parser/urls";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import {
  createProductImageCandidateSelect,
  createProductImageCandidateWhere,
  PRODUCT_IMAGE_CANDIDATE_ORDER_BY,
} from "./candidate-query";
import {
  createWebpThumbnail,
  delay,
  fetchSourceImageBytes,
  formatBytes,
  pathExists,
  randomDelayMs,
  SourceImageFetchError,
  type SourceImageFailureKind,
  writeFileAtomically,
  writeFileFromReusableImage,
} from "./image-files";
import type { BackfillSummary, ImageBackfillOptions } from "./options";

// 圖片補圖流程需要的商品候選資料，對應 Prisma 查詢 select 的最小欄位集合。
export interface ProductImageCandidate {
  id: string;
  name: string;
  isActive: boolean;
  primaryImageUrl: string | null;
  primaryImageCheckedAt: Date | null;
  imageCachedAt: Date | null;
  imageCacheCheckedAt: Date | null;
  imageCacheFailureCount: number;
  imageCacheFailureSince: Date | null;
  imageCacheNextRetryAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  priceSnapshots: Array<{ capturedAt: Date }>;
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

type ProcessStatus = "cached" | "dry-run" | "failed" | "invalid" | "reused" | "skipped";

interface ProcessResult {
  status: ProcessStatus;
  didRequestSource: boolean;
  errorMessage?: string;
  errorKind?: SourceImageFailureKind | "invalid_url" | "unknown";
  httpStatus?: number | null;
}

interface BackfillLoggers {
  log?: (message: string) => void;
  debugLog?: (message: string) => void;
}

type ImageCacheStateClient = Pick<PrismaClient, "product">;

// 讀取手動補圖候選；保留 limit 直接套用於 DB 查詢，避免全量維運時一次取出過多資料。
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

    if (webpExists || isMissingImageEligible(candidate, options, now)) {
      selected.push(candidate);
    }

    if (options.limit !== null && selected.length >= options.limit) {
      break;
    }
  }

  return selected;
}

// 輪替檢查既有商品快取；有檔案者刷新狀態，缺檔且已到重試時間者交給補圖流程。
export async function readImageRecoveryCandidates(
  client: PrismaClient,
  options: ImageBackfillOptions,
  limit: number,
  now = new Date(),
): Promise<ProductImageCandidate[]> {
  const candidates = await client.product.findMany({
    where: createProductImageCandidateWhere(options),
    select: createProductImageCandidateSelect(),
    orderBy: [{ imageCacheCheckedAt: "asc" }, ...PRODUCT_IMAGE_CANDIDATE_ORDER_BY],
    take: limit,
  });
  const missingCandidates: ProductImageCandidate[] = [];

  for (const candidate of candidates) {
    if (await pathExists(join(options.storageDir, `${candidate.id}.webp`))) {
      await markImageCacheReady(client, candidate.id, now);
    } else if (!isMissingImageEligible(candidate, options, now)) {
      await markImageCacheChecked(client, candidate.id, now);
    } else if (!candidate.imageCacheNextRetryAt || candidate.imageCacheNextRetryAt <= now) {
      missingCandidates.push(candidate);
    }
  }

  return missingCandidates;
}

function isMissingImageEligible(
  candidate: ProductImageCandidate,
  options: ImageBackfillOptions,
  now: Date,
): boolean {
  if (options.productId === candidate.id || candidate.isActive) {
    return true;
  }

  const retentionCutoff = now.getTime() - options.inactiveRetentionDays * 24 * 60 * 60 * 1000;

  return candidate.priceSnapshots.some(
    (snapshot) => snapshot.capturedAt.getTime() >= retentionCutoff,
  );
}

// 逐筆處理圖片候選並彙整摘要；逐筆失敗會記入 failed，不中斷整批補圖。
export async function backfillImages(
  candidates: ProductImageCandidate[],
  options: ImageBackfillOptions,
  loggers: BackfillLoggers = {},
  stateClient?: ImageCacheStateClient,
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
  const failedResultsBySourceUrl = new Map<string, ProcessResult>();

  for (const candidate of candidates) {
    const result = await processCandidate(
      candidate,
      options,
      summary.liveFetches,
      reusableImagePathsBySourceUrl,
      failedResultsBySourceUrl,
      { debugLog, log },
    );
    summary[result.status === "dry-run" ? "dryRun" : result.status] += 1;

    if (result.didRequestSource) {
      summary.liveFetches += 1;
    }

    if (stateClient && !options.dryRun) {
      if (["cached", "reused", "skipped"].includes(result.status)) {
        await markImageCacheReady(stateClient, candidate.id, new Date());
      } else if (result.status === "failed" || result.status === "invalid") {
        await markImageCacheFailure(stateClient, candidate, result);
      }
    }
  }

  return summary;
}

// 處理單一商品圖片：驗證來源 URL、略過既有快取、重用相同來源圖，必要時下載並轉 WebP。
async function processCandidate(
  candidate: ProductImageCandidate,
  options: ImageBackfillOptions,
  liveFetches: number,
  reusableImagePathsBySourceUrl: Map<string, string>,
  failedResultsBySourceUrl: Map<string, ProcessResult>,
  { debugLog, log }: Required<BackfillLoggers>,
): Promise<ProcessResult> {
  const outputPath = join(options.storageDir, `${candidate.id}.webp`);
  const label = `${candidate.sourceCategory.displayName} IGrp=${candidate.sourceCategory.igrp}`;
  let didRequestSource = false;
  let normalizedImageUrl: string | null = null;

  try {
    if (!options.overwrite && (await pathExists(outputPath))) {
      const normalizedExistingSourceUrl = candidate.primaryImageUrl
        ? normalizeCoolpcProductImageUrl(candidate.primaryImageUrl, candidate.sourceCategory.igrp)
        : null;

      if (
        normalizedExistingSourceUrl &&
        !reusableImagePathsBySourceUrl.has(normalizedExistingSourceUrl)
      ) {
        reusableImagePathsBySourceUrl.set(normalizedExistingSourceUrl, outputPath);
      }

      debugLog(
        `[skipped] ${candidate.id} | existing ${relative(options.workspaceRoot, outputPath)} | ${candidate.name}`,
      );
      return { status: "skipped", didRequestSource };
    }

    const sourceImageUrl = candidate.primaryImageUrl;

    if (!sourceImageUrl) {
      log(`[invalid] ${candidate.id} | missing image URL | ${candidate.name}`);
      return {
        status: "invalid",
        didRequestSource,
        errorMessage: "missing image URL",
        errorKind: "invalid_url",
      };
    }

    normalizedImageUrl = normalizeCoolpcProductImageUrl(
      sourceImageUrl,
      candidate.sourceCategory.igrp,
    );

    if (!normalizedImageUrl) {
      log(`[invalid] ${candidate.id} | invalid source image URL | ${sourceImageUrl}`);
      return {
        status: "invalid",
        didRequestSource,
        errorMessage: "invalid source image URL",
        errorKind: "invalid_url",
      };
    }

    const previousFailure = failedResultsBySourceUrl.get(normalizedImageUrl);
    if (previousFailure) {
      debugLog(`[deferred] ${candidate.id} | shared failed source ${normalizedImageUrl}`);
      return { ...previousFailure, didRequestSource: false };
    }

    // 相同來源圖片只下載一次，後續商品直接複製已產生的本地縮圖。
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
      return { status: "dry-run", didRequestSource };
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

      return { status: "reused", didRequestSource };
    }

    // 第一筆 live request 不等待；從第二筆開始套用隨機延遲，降低手動補圖對來源站的壓力。
    if (liveFetches > 0) {
      const waitMs = randomDelayMs(options.minDelayMs, options.maxDelayMs);
      debugLog(`Waiting ${waitMs}ms before the next source image request...`);
      await delay(waitMs);
    }

    const sourceBytes = await fetchSourceImageBytes(normalizedImageUrl, options, () => {
      didRequestSource = true;
    });
    let thumbnailBytes: Buffer;
    try {
      thumbnailBytes = await createWebpThumbnail(sourceBytes);
    } catch (error) {
      throw new SourceImageFetchError(toSafeCliErrorMessage(error), "decode");
    }
    await writeFileAtomically(outputPath, thumbnailBytes);
    reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);

    debugLog(
      `[cached] ${candidate.id} | ${label} | ${formatBytes(sourceBytes.byteLength)} -> ${formatBytes(
        thumbnailBytes.byteLength,
      )} | ${candidate.name}`,
    );

    return { status: "cached", didRequestSource };
  } catch (error) {
    const errorMessage = toSafeCliErrorMessage(error);
    const result: ProcessResult = {
      status: "failed",
      didRequestSource,
      errorMessage,
      errorKind: error instanceof SourceImageFetchError ? error.kind : "unknown",
      httpStatus: error instanceof SourceImageFetchError ? error.httpStatus : null,
    };
    if (normalizedImageUrl) {
      failedResultsBySourceUrl.set(normalizedImageUrl, result);
    }
    log(`[failed] ${candidate.id} | ${errorMessage} | ${candidate.name}`);
    return result;
  }
}

const MAX_CONSECUTIVE_IMAGE_FAILURES = 5;
const IMAGE_RETRY_BASE_MS = 60 * 60 * 1000;
const IMAGE_RETRY_LONG_COOLDOWN_MS = 7 * 24 * IMAGE_RETRY_BASE_MS;

async function markImageCacheReady(
  client: ImageCacheStateClient,
  productId: string,
  checkedAt: Date,
): Promise<void> {
  await client.product.update({
    where: { id: productId },
    data: {
      imageCachedAt: checkedAt,
      imageCacheCheckedAt: checkedAt,
      imageCacheFailureCount: 0,
      imageCacheLastError: null,
      imageCacheLastErrorKind: null,
      imageCacheLastHttpStatus: null,
      imageCacheFailureSince: null,
      imageCacheLastSuccessAt: checkedAt,
      imageCacheNextRetryAt: null,
    },
  });
}

async function markImageCacheChecked(
  client: ImageCacheStateClient,
  productId: string,
  checkedAt: Date,
): Promise<void> {
  await client.product.update({
    where: { id: productId },
    data: { imageCacheCheckedAt: checkedAt },
  });
}

async function markImageCacheFailure(
  client: ImageCacheStateClient,
  candidate: ProductImageCandidate,
  result: ProcessResult,
): Promise<void> {
  const attemptedAt = new Date();
  const failureCount = Math.min(
    candidate.imageCacheFailureCount + 1,
    MAX_CONSECUTIVE_IMAGE_FAILURES,
  );
  const retryDelayMs =
    failureCount >= MAX_CONSECUTIVE_IMAGE_FAILURES
      ? IMAGE_RETRY_LONG_COOLDOWN_MS
      : IMAGE_RETRY_BASE_MS * 2 ** (failureCount - 1);

  const data = {
    imageCachedAt: null,
    imageCacheCheckedAt: attemptedAt,
    imageCacheFailureCount: failureCount,
    imageCacheLastError: (result.errorMessage ?? result.status).slice(0, 1000),
    imageCacheLastErrorKind: result.errorKind ?? "unknown",
    imageCacheLastHttpStatus: result.httpStatus ?? null,
    imageCacheFailureSince: candidate.imageCacheFailureSince ?? attemptedAt,
    imageCacheNextRetryAt: new Date(attemptedAt.getTime() + retryDelayMs),
  };

  if (candidate.primaryImageUrl) {
    await client.product.updateMany({
      where: { primaryImageUrl: candidate.primaryImageUrl },
      data,
    });
    return;
  }

  await client.product.update({
    where: { id: candidate.id },
    data: {
      ...data,
    },
  });
}
