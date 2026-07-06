// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/summary.ts
// 彙整 scheduled crawler 單輪結果，輸出維運摘要並決定下一輪是否進入 backoff。

import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  type CrawlRunCategoryProductWriteSummary,
  type RunCoolpcCrawlOnceResult,
} from "../../../coolpc/crawl-run";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { CoolpcDaemonOptions } from "./options";

const DEFAULT_ALL_FETCH_FAILED_RETRY_SECONDS = 600;

// scheduled crawler 需要的商品寫入彙總欄位，沿用 crawl-run category summary 的資料契約。
export type ProductWriteSummaryTotals = CrawlRunCategoryProductWriteSummary;

// 輸出單輪 scheduled crawl 的總結與各分類結果，避免 daemon 主流程混入 log 組字細節。
export function printCycleSummary(
  result: RunCoolpcCrawlOnceResult,
  productWriteSummary: ProductWriteSummaryTotals,
  logMessage: (message: string) => void,
): void {
  logMessage(
    `CoolPC scheduled crawl finished. run=${result.crawlRunId} status=${result.status} stoppedBySuspectedBlock=${result.stoppedBySuspectedBlock ? "yes" : "no"} items=${productWriteSummary.processedItemCount} createdProducts=${productWriteSummary.createdProductCount} updatedProducts=${productWriteSummary.updatedProductCount} priceSnapshots=${productWriteSummary.priceSnapshotCreatedCount} priceUnchanged=${productWriteSummary.priceUnchangedCount} missingUpdated=${productWriteSummary.missingProductUpdatedCount} markedInactive=${productWriteSummary.markedInactiveProductCount}`,
  );

  for (const categoryResult of result.categoryResults) {
    const errorSuffix = categoryResult.errorMessage
      ? ` error=${toSafeCliErrorMessage(categoryResult.errorMessage)}`
      : "";
    const writeSuffix = categoryResult.productWriteSummary
      ? ` items=${categoryResult.productWriteSummary.processedItemCount} createdProducts=${categoryResult.productWriteSummary.createdProductCount} updatedProducts=${categoryResult.productWriteSummary.updatedProductCount} priceSnapshots=${categoryResult.productWriteSummary.priceSnapshotCreatedCount} priceUnchanged=${categoryResult.productWriteSummary.priceUnchangedCount} missingUpdated=${categoryResult.productWriteSummary.missingProductUpdatedCount} markedInactive=${categoryResult.productWriteSummary.markedInactiveProductCount}`
      : "";
    logMessage(
      `IGrp=${categoryResult.igrp} status=${categoryResult.status}${writeSuffix}${errorSuffix}`,
    );
  }
}

// 將各分類的 product write summary 加總成單輪總表，供 log 與後續新商品圖片補圖使用。
export function summarizeProductWrites(
  result: RunCoolpcCrawlOnceResult,
): ProductWriteSummaryTotals {
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

// 判斷下一輪是否要使用 backoff；疑似封鎖與非成功結果都視為需要降速。
export function shouldBackoffAfter(result: RunCoolpcCrawlOnceResult): boolean {
  if (result.stoppedBySuspectedBlock) {
    return true;
  }

  return (
    result.status !== CRAWL_RUN_STATUSES.SUCCESS_CHANGED &&
    result.status !== CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED
  );
}

// 當所有分類都是 fetch 失敗時先用較短重試，避免暫時性 DNS/網路問題拖到完整 backoff。
export function resolveAllFetchFailedRetrySeconds(
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
