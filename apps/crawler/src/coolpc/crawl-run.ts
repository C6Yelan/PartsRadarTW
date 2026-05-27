import type { PrismaClient } from "@partsradar/db";

// This module owns the Phase 3 crawl-run skeleton only. Product, price, current
// price, and raw snapshot writes stay in later slices so their rules are tested separately.
export const CRAWL_TRIGGER_TYPES = {
  MANUAL: "MANUAL",
  SCHEDULED: "SCHEDULED",
} as const;

export const CRAWL_RUN_STATUSES = {
  RUNNING: "RUNNING",
  SUCCESS_CHANGED: "SUCCESS_CHANGED",
  SUCCESS_UNCHANGED: "SUCCESS_UNCHANGED",
  SUCCESS_WITH_ERRORS: "SUCCESS_WITH_ERRORS",
  FETCH_FAILED: "FETCH_FAILED",
  SUSPECTED_BLOCK: "SUSPECTED_BLOCK",
  PARSE_FAILED: "PARSE_FAILED",
  SKIPPED_OVERLAP: "SKIPPED_OVERLAP",
  BACKOFF: "BACKOFF",
} as const;

export const CRAWL_RUN_CATEGORY_RESULT_STATUSES = {
  SUCCESS_CHANGED: "SUCCESS_CHANGED",
  SUCCESS_UNCHANGED: "SUCCESS_UNCHANGED",
  FETCH_FAILED: "FETCH_FAILED",
  SUSPECTED_BLOCK: "SUSPECTED_BLOCK",
  PARSE_FAILED: "PARSE_FAILED",
} as const;

export type CrawlTriggerTypeValue =
  (typeof CRAWL_TRIGGER_TYPES)[keyof typeof CRAWL_TRIGGER_TYPES];

export type CrawlRunStatusValue =
  (typeof CRAWL_RUN_STATUSES)[keyof typeof CRAWL_RUN_STATUSES];

export type CrawlRunCategoryResultStatusValue =
  (typeof CRAWL_RUN_CATEGORY_RESULT_STATUSES)[keyof typeof CRAWL_RUN_CATEGORY_RESULT_STATUSES];

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
}

export interface RunCoolpcCrawlOnceOptions {
  client: CrawlRunWriteClient;
  triggerType?: CrawlTriggerTypeValue;
  processCategory: (
    context: ProcessCrawlCategoryContext,
  ) => Promise<ProcessCrawlCategoryResult>;
  now?: () => Date;
}

export interface RecordedCrawlRunCategoryResult {
  sourceCategoryId: string;
  igrp: number;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
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

    categoryResults.push({
      sourceCategoryId: category.id,
      igrp: category.igrp,
      status: result.status,
      rawSnapshotId: result.rawSnapshotId ?? null,
      errorMessage: result.errorMessage ?? null,
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

function resolveCrawlRunStatus(results: RecordedCrawlRunCategoryResult[]): CrawlRunStatusValue {
  // The run table stores only the overall state. Category counts and per-category
  // details remain derivable from crawl_run_category_results.
  if (results.some((result) => result.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK)) {
    return CRAWL_RUN_STATUSES.SUSPECTED_BLOCK;
  }

  const successCount = results.filter((result) => isSuccessStatus(result.status)).length;

  if (successCount === results.length) {
    return results.some((result) => result.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED)
      ? CRAWL_RUN_STATUSES.SUCCESS_CHANGED
      : CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED;
  }

  if (successCount > 0) {
    return CRAWL_RUN_STATUSES.SUCCESS_WITH_ERRORS;
  }

  if (results.some((result) => result.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED)) {
    return CRAWL_RUN_STATUSES.PARSE_FAILED;
  }

  if (results.some((result) => result.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED)) {
    return CRAWL_RUN_STATUSES.FETCH_FAILED;
  }

  return CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED;
}

function isSuccessStatus(status: CrawlRunCategoryResultStatusValue): boolean {
  return (
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED ||
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
  );
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
