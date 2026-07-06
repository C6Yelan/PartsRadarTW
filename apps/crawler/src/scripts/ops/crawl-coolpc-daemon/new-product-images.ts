// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/new-product-images.ts
// 在 scheduled crawler 成功寫入新商品後，針對本輪新增商品補齊本地商品圖片快取。

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

// scheduled crawler 注入用的新商品圖片補圖 handler，讓主流程可測試替換而不綁定實際圖片下載。
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
    `New product image backfill finished. createdProducts=${createdProductCount} selected=${summary.selected} cached=${summary.cached} reused=${summary.reused} skipped=${summary.skipped} invalid=${summary.invalid} failed=${summary.failed} liveFetches=${summary.liveFetches}`,
  );
}

function toSafeErrorMessage(error: unknown): string {
  return toSafeCliErrorMessage(error);
}

function log(message: string): void {
  logger.info(message);
}
