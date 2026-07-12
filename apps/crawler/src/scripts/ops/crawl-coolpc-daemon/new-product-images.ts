// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/new-product-images.ts
// 在 scheduled crawler 成功後補新商品圖片，並輪替修復既有商品缺少的本地快取。

import type { PrismaClient } from "@partsradar/db";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { BackfillSummary, ImageBackfillOptions } from "../image-cache-backfill/options";
import {
  backfillImages,
  readImageRecoveryCandidates,
  readMissingImageCandidatesByProductIds,
} from "../image-cache-backfill/processor";
import { createOpsLogger } from "../shared/logger";
import type { NewProductImageBackfillOptions } from "./options";

const logger = createOpsLogger();

// scheduled crawler 的新商品補圖 contract，隔離價格 crawl 與圖片下載流程。
export type NewProductImageBackfillHandler = (args: {
  client: PrismaClient;
  productIds: string[];
  options: NewProductImageBackfillOptions;
}) => Promise<void>;

// 只針對本輪新建商品查找缺圖候選並執行補圖；補圖失敗只記錄，不中斷價格 crawl daemon。
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

  const imageOptions = createImageBackfillOptions(options);

  try {
    const newProductCandidates = await readMissingImageCandidatesByProductIds(
      client,
      imageOptions,
      uniqueProductIds,
    );
    const recoveryCandidates = await readImageRecoveryCandidates(
      client,
      imageOptions,
      options.recoveryScanLimit,
    );
    const candidates = [
      ...new Map(
        [...newProductCandidates, ...recoveryCandidates].map((candidate) => [
          candidate.id,
          candidate,
        ]),
      ).values(),
    ];

    if (candidates.length === 0) {
      log(`Product image recovery skipped. createdProducts=${uniqueProductIds.length}`);
      return;
    }

    log(
      `Starting product image recovery. createdProducts=${uniqueProductIds.length} candidates=${candidates.length}`,
    );
    const summary = await backfillImages(
      candidates,
      imageOptions,
      {
        log: (message) => logger.info(message),
        debugLog: (message) => logger.debug(message),
      },
      client,
    );
    logNewProductImageBackfillSummary(summary, uniqueProductIds.length);
  } catch (error) {
    log(`Product image recovery failed: ${toSafeCliErrorMessage(error)}`);
  }
}

// 將 scheduled crawler 的新商品補圖設定轉成共用 image backfill processor 需要的完整選項。
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
    externalFetchLockDir: options.externalFetchLockDir,
    externalFetchLockStaleSeconds: options.externalFetchLockStaleSeconds,
    dryRun: false,
    overwrite: false,
  };
}

// 記錄新商品圖片補圖摘要，只輸出統計值，避免 daemon log 夾帶逐筆來源 URL。
function logNewProductImageBackfillSummary(
  summary: BackfillSummary,
  createdProductCount: number,
): void {
  log(
    `Product image recovery finished. createdProducts=${createdProductCount} selected=${summary.selected} cached=${summary.cached} reused=${summary.reused} skipped=${summary.skipped} invalid=${summary.invalid} failed=${summary.failed} liveFetches=${summary.liveFetches}`,
  );
}

function log(message: string): void {
  logger.info(message);
}
