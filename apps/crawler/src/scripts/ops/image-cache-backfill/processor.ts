// apps/crawler/src/scripts/ops/image-cache-backfill/processor.ts
// 執行商品圖片補圖核心流程：讀取候選、避開既有快取、重用相同來源圖並寫入 WebP 縮圖。

import { join, relative } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import { normalizeCoolpcProductImageUrl } from "../../../coolpc/parser/urls";
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

// 圖片補圖流程需要的商品候選資料，對應 Prisma 查詢 select 的最小欄位集合。
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
  didRequestSource: boolean;
}

interface BackfillLoggers {
  log?: (message: string) => void;
  debugLog?: (message: string) => void;
}

// 讀取手動補圖候選；保留 limit 直接套用於 DB 查詢，避免全量維運時一次取出過多資料。
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

// 讀取目前本地尚未有 WebP 快取的候選，並在檔案檢查後才套用 limit。
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

// scheduled crawler 只針對本輪新增商品補圖，因此以 product id 清單收斂查詢範圍。
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

// 逐筆處理圖片候選並彙整摘要；逐筆失敗會記入 failed，不中斷整批補圖。
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

    if (result.didRequestSource) {
      summary.liveFetches += 1;
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
  { debugLog, log }: Required<BackfillLoggers>,
): Promise<ProcessResult> {
  const outputPath = join(options.storageDir, `${candidate.id}.webp`);
  const label = `${candidate.sourceCategory.displayName} IGrp=${candidate.sourceCategory.igrp}`;
  let didRequestSource = false;

  try {
    const sourceImageUrl = candidate.primaryImageUrl;

    if (!sourceImageUrl) {
      log(`[invalid] ${candidate.id} | missing image URL | ${candidate.name}`);
      return { status: "invalid", didRequestSource };
    }

    const normalizedImageUrl = normalizeCoolpcProductImageUrl(
      sourceImageUrl,
      candidate.sourceCategory.igrp,
    );

    if (!normalizedImageUrl) {
      log(`[invalid] ${candidate.id} | invalid source image URL | ${sourceImageUrl}`);
      return { status: "invalid", didRequestSource };
    }

    if (!options.overwrite && (await pathExists(outputPath))) {
      if (!reusableImagePathsBySourceUrl.has(normalizedImageUrl)) {
        reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);
      }

      debugLog(
        `[skipped] ${candidate.id} | existing ${relative(options.workspaceRoot, outputPath)} | ${candidate.name}`,
      );
      return { status: "skipped", didRequestSource };
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

    const sourceRequest = fetchSourceImageBytes(normalizedImageUrl, options);
    didRequestSource = true;
    const sourceBytes = await sourceRequest;
    const thumbnailBytes = await createWebpThumbnail(sourceBytes);
    await writeFileAtomically(outputPath, thumbnailBytes);
    reusableImagePathsBySourceUrl.set(normalizedImageUrl, outputPath);

    debugLog(
      `[cached] ${candidate.id} | ${label} | ${formatBytes(sourceBytes.byteLength)} -> ${formatBytes(
        thumbnailBytes.byteLength,
      )} | ${candidate.name}`,
    );

    return { status: "cached", didRequestSource };
  } catch (error) {
    log(`[failed] ${candidate.id} | ${toErrorMessage(error)} | ${candidate.name}`);
    return { status: "failed", didRequestSource };
  }
}
