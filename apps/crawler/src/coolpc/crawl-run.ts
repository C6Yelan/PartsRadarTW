// apps/crawler/src/coolpc/crawl-run.ts
// 這是 crawler 的主流程總管：建立一次 crawlRun、逐分類呼叫處理器並彙整結果，最後回傳整體狀態。
import type { PrismaClient } from "@partsradar/db";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  isSuccessStatus,
  resolveCrawlRunStatus,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunStatusValue,
  type CrawlTriggerTypeValue,
} from "./crawl-run/status";

// 類別處理流程與狀態常數集中重導出，raw snapshot / 商品價格寫入維持在專門模組，保留可測試邊界。
export {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunStatusValue,
  type CrawlTriggerTypeValue,
} from "./crawl-run/status";

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
  productWriteSummary?: CrawlRunCategoryProductWriteSummary | null;
}

export interface RunCoolpcCrawlOnceOptions {
  client: CrawlRunWriteClient;
  triggerType?: CrawlTriggerTypeValue;
  processCategory: (context: ProcessCrawlCategoryContext) => Promise<ProcessCrawlCategoryResult>;
  now?: () => Date;
}

export interface RecordedCrawlRunCategoryResult {
  sourceCategoryId: string;
  igrp: number;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
  productWriteSummary: CrawlRunCategoryProductWriteSummary | null;
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

export type PrismaCrawlRunWriteClient = Pick<
  PrismaClient,
  "sourceCategory" | "crawlRun" | "crawlRunCategoryResult"
>;

export function runCoolpcCrawlOnceWithPrisma(
  options: Omit<RunCoolpcCrawlOnceOptions, "client"> & {
    client: PrismaCrawlRunWriteClient;
  },
): Promise<RunCoolpcCrawlOnceResult> {
  // 核心 runner 採依賴注入，方便測試；同時保留 Prisma 進入點給實際排程流程使用。
  return runCoolpcCrawlOnce(options);
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
      productWriteSummary: result.productWriteSummary ?? null,
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
