// apps/crawler/src/coolpc/crawl-run/status.ts

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

export type CrawlTriggerTypeValue = (typeof CRAWL_TRIGGER_TYPES)[keyof typeof CRAWL_TRIGGER_TYPES];

export type CrawlRunStatusValue = (typeof CRAWL_RUN_STATUSES)[keyof typeof CRAWL_RUN_STATUSES];

export type CrawlRunCategoryResultStatusValue =
  (typeof CRAWL_RUN_CATEGORY_RESULT_STATUSES)[keyof typeof CRAWL_RUN_CATEGORY_RESULT_STATUSES];

export function resolveCrawlRunStatus(
  results: Array<{ status: CrawlRunCategoryResultStatusValue }>,
): CrawlRunStatusValue {
  // The run table stores only the overall state. Category counts and per-category
  // details remain derivable from crawl_run_category_results.
  if (
    results.some((result) => result.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK)
  ) {
    return CRAWL_RUN_STATUSES.SUSPECTED_BLOCK;
  }

  const successCount = results.filter((result) => isSuccessStatus(result.status)).length;

  if (successCount === results.length) {
    return results.some(
      (result) => result.status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
    )
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

export function isSuccessStatus(status: CrawlRunCategoryResultStatusValue): boolean {
  return (
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED ||
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
  );
}
