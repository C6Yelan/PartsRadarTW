// apps/crawler/src/coolpc/crawl-run.ts
// 這是 crawler 的主流程總管：建立一次 crawlRun、逐分類呼叫處理器並彙整結果，最後回傳整體狀態。

import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunStatusValue,
  type CrawlTriggerTypeValue,
  isSuccessStatus,
  resolveCrawlRunStatus,
} from "./crawl-run/status";

// crawl-run 的狀態語彙由此公開入口統一提供，raw snapshot 與商品價格寫入維持各自模組。
export {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunStatusValue,
  type CrawlTriggerTypeValue,
} from "./crawl-run/status";

export const CRAWL_RUN_LIFECYCLE_FAILURE_MARKER = "crawl_run_lifecycle_failure";
export const CRAWL_RUN_INTERRUPTED_RECONCILED_MARKER = "crawl_run_interrupted_reconciled";

export interface CrawlRunSourceCategory {
  id: string;
  igrp: number;
  sourceName: string;
  displayName: string;
  enabled: boolean;
}

export interface CrawlRunWriteClient {
  sourceCategory: {
    findMany(args: {
      where: { enabled: true };
      orderBy: { igrp: "asc" };
    }): Promise<CrawlRunSourceCategory[]>;
    update(args: {
      where: { id: string };
      data: {
        lastCheckedAt: Date;
        lastSuccessAt?: Date;
      };
    }): Promise<{ id: string }>;
  };
  crawlRun: {
    create(args: {
      data: {
        status: typeof CRAWL_RUN_STATUSES.RUNNING;
        startedAt: Date;
        triggerType: CrawlTriggerTypeValue;
      };
    }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: {
        status: CrawlRunStatusValue;
        finishedAt: Date;
        errorMessage?: string | null;
      };
    }): Promise<{ id: string; status: CrawlRunStatusValue }>;
    updateMany(args: {
      where: {
        id: string;
        status: typeof CRAWL_RUN_STATUSES.RUNNING;
        finishedAt: null;
      };
      data: {
        status: typeof CRAWL_RUN_STATUSES.FETCH_FAILED;
        finishedAt: Date;
        errorMessage: typeof CRAWL_RUN_LIFECYCLE_FAILURE_MARKER;
      };
    }): Promise<{ count: number }>;
  };
  crawlRunCategoryResult: {
    create(args: {
      data: {
        crawlRunId: string;
        sourceCategoryId: string;
        status: CrawlRunCategoryResultStatusValue;
        rawSnapshotId?: string | null;
        errorMessage?: string | null;
      };
    }): Promise<{ id: string }>;
  };
}

export interface ProcessCrawlCategoryContext {
  crawlRunId: string;
  category: CrawlRunSourceCategory;
}

export interface ProcessCrawlCategoryResult {
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId?: string | null;
  errorMessage?: string | null;
  deduplicatedItemCount?: number;
  productWriteSummary?: CrawlRunCategoryProductWriteSummary | null;
  filterSyncJoinCoverage?: FilterSyncJoinCoverage | null;
}

export interface FilterSyncJoinCoverage {
  matchedCount: number;
  totalCount: number;
}

export interface RunCoolpcCrawlOnceOptions {
  client: CrawlRunWriteClient;
  triggerType?: CrawlTriggerTypeValue;
  processCategory: (context: ProcessCrawlCategoryContext) => Promise<ProcessCrawlCategoryResult>;
  now?: () => Date;
}

export interface InterruptedCrawlRunReconciliationClient {
  crawlRun: {
    updateMany(args: {
      where: {
        status: typeof CRAWL_RUN_STATUSES.RUNNING;
        finishedAt: null;
      };
      data: {
        status: typeof CRAWL_RUN_STATUSES.FETCH_FAILED;
        finishedAt: Date;
        errorMessage: typeof CRAWL_RUN_INTERRUPTED_RECONCILED_MARKER;
      };
    }): Promise<{ count: number }>;
  };
}

export interface ReconcileInterruptedCrawlRunsOptions {
  client: InterruptedCrawlRunReconciliationClient;
  now?: () => Date;
}

export interface RecordedCrawlRunCategoryResult {
  sourceCategoryId: string;
  igrp: number;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
  deduplicatedItemCount?: number;
  productWriteSummary: CrawlRunCategoryProductWriteSummary | null;
  filterSyncJoinCoverage?: FilterSyncJoinCoverage | null;
}

export interface CrawlRunCategoryProductWriteSummary {
  processedItemCount: number;
  createdProductCount: number;
  createdProductIds: string[];
  updatedProductCount: number;
  priceSnapshotCreatedCount: number;
  priceUnchangedCount: number;
  missingProductUpdatedCount: number;
  markedInactiveProductCount: number;
}

export interface RunCoolpcCrawlOnceResult {
  crawlRunId: string;
  status: CrawlRunStatusValue;
  stoppedBySuspectedBlock: boolean;
  categoryResults: RecordedCrawlRunCategoryResult[];
}

// 在新一輪 crawl 開始前，以單一 atomic update 收斂上次中斷的 RUNNING rows。
export async function reconcileInterruptedCrawlRuns({
  client,
  now = () => new Date(),
}: ReconcileInterruptedCrawlRunsOptions): Promise<number> {
  const result = await client.crawlRun.updateMany({
    where: {
      status: CRAWL_RUN_STATUSES.RUNNING,
      finishedAt: null,
    },
    data: {
      status: CRAWL_RUN_STATUSES.FETCH_FAILED,
      finishedAt: now(),
      errorMessage: CRAWL_RUN_INTERRUPTED_RECONCILED_MARKER,
    },
  });

  return result.count;
}

export async function runCoolpcCrawlOnce({
  client,
  triggerType = CRAWL_TRIGGER_TYPES.MANUAL,
  processCategory,
  now = () => new Date(),
}: RunCoolpcCrawlOnceOptions): Promise<RunCoolpcCrawlOnceResult> {
  const startedAt = now();
  const crawlRun = await client.crawlRun.create({
    data: {
      status: CRAWL_RUN_STATUSES.RUNNING,
      startedAt,
      triggerType,
    },
  });
  try {
    const categories = await client.sourceCategory.findMany({
      where: { enabled: true },
      orderBy: { igrp: "asc" },
    });
    const categoryResults: RecordedCrawlRunCategoryResult[] = [];
    let stoppedBySuspectedBlock = false;

    for (const category of categories) {
      const result = await processCategorySafely({
        crawlRunId: crawlRun.id,
        category,
        processCategory,
      });

      await client.crawlRunCategoryResult.create({
        data: {
          crawlRunId: crawlRun.id,
          sourceCategoryId: category.id,
          status: result.status,
          rawSnapshotId: result.rawSnapshotId,
          errorMessage: result.errorMessage,
        },
      });
      await updateSourceCategoryCheckTimestamps({
        client,
        sourceCategoryId: category.id,
        status: result.status,
        checkedAt: now(),
      });

      categoryResults.push({
        sourceCategoryId: category.id,
        igrp: category.igrp,
        status: result.status,
        rawSnapshotId: result.rawSnapshotId ?? null,
        errorMessage: result.errorMessage ?? null,
        ...(result.deduplicatedItemCount
          ? { deduplicatedItemCount: result.deduplicatedItemCount }
          : {}),
        productWriteSummary: result.productWriteSummary ?? null,
        ...(result.filterSyncJoinCoverage
          ? { filterSyncJoinCoverage: result.filterSyncJoinCoverage }
          : {}),
      });

      // 只要該分類判定疑似封鎖，先停止後續循環，避免繼續抓取時誤判正常分類而寫入混淆資料。
      if (result.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK) {
        stoppedBySuspectedBlock = true;
        break;
      }
    }

    const status = resolveCrawlRunStatus(categoryResults);
    await client.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status,
        finishedAt: now(),
      },
    });

    return {
      crawlRunId: crawlRun.id,
      status,
      stoppedBySuspectedBlock,
      categoryResults,
    };
  } catch (error) {
    try {
      await client.crawlRun.updateMany({
        where: {
          id: crawlRun.id,
          status: CRAWL_RUN_STATUSES.RUNNING,
          finishedAt: null,
        },
        data: {
          status: CRAWL_RUN_STATUSES.FETCH_FAILED,
          finishedAt: now(),
          errorMessage: CRAWL_RUN_LIFECYCLE_FAILURE_MARKER,
        },
      });
    } catch {
      // Finalization 僅是 best-effort，不得取代 caller 應收到的原始 lifecycle error。
    }

    throw error;
  }
}

async function updateSourceCategoryCheckTimestamps({
  client,
  sourceCategoryId,
  status,
  checkedAt,
}: {
  client: CrawlRunWriteClient;
  sourceCategoryId: string;
  status: CrawlRunCategoryResultStatusValue;
  checkedAt: Date;
}): Promise<void> {
  const data: { lastCheckedAt: Date; lastSuccessAt?: Date } = { lastCheckedAt: checkedAt };

  // 只在成功分類才更新 lastSuccessAt；失敗、封鎖、解析失敗只更新 lastCheckedAt，避免把不可信結果當成成功時間。
  if (isSuccessStatus(status)) {
    data.lastSuccessAt = checkedAt;
  }

  await client.sourceCategory.update({
    where: { id: sourceCategoryId },
    data,
  });
}

async function processCategorySafely({
  crawlRunId,
  category,
  processCategory,
}: ProcessCrawlCategoryContext & {
  processCategory: RunCoolpcCrawlOnceOptions["processCategory"];
}): Promise<ProcessCrawlCategoryResult> {
  try {
    return await processCategory({ crawlRunId, category });
  } catch (error) {
    // 未預期錯誤會被降級為此分類 PARSE_FAILED，確保整輪能持續回報完整結果彙總。
    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown crawler processing error.",
    };
  }
}
