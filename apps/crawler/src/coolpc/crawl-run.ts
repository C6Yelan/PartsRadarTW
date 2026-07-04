// apps/crawler/src/coolpc/crawl-run.ts
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

// This module owns crawl-run orchestration. Raw snapshot and product/price
// writes stay in dedicated modules so their persistence rules are tested separately.
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
  // Keep the core runner dependency-injected for unit tests while still exposing
  // a Prisma-typed entry point for real crawler wiring.
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

    // Suspected block means the source may be serving non-product content. Stop
    // the current cycle before later categories can overwrite valid data.
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

  // Failed, blocked, or parser-broken categories were attempted, but they did
  // not produce a trustworthy product list. Keep last_success_at unchanged.
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
    // Unexpected processing errors are recorded as parse failures for this
    // category; the runner can still finish the cycle summary consistently.
    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown crawler processing error.",
    };
  }
}
