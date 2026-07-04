// apps/crawler/src/scripts/ops/crawl-coolpc-daemon/summary.ts

import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  type CrawlRunCategoryProductWriteSummary,
  type RunCoolpcCrawlOnceResult,
} from "../../../coolpc/crawl-run";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { CoolpcDaemonOptions } from "./options";

const DEFAULT_ALL_FETCH_FAILED_RETRY_SECONDS = 600;

export type ProductWriteSummaryTotals = CrawlRunCategoryProductWriteSummary;

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

export function shouldBackoffAfter(result: RunCoolpcCrawlOnceResult): boolean {
  if (result.stoppedBySuspectedBlock) {
    return true;
  }

  return (
    result.status !== CRAWL_RUN_STATUSES.SUCCESS_CHANGED &&
    result.status !== CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED
  );
}

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
