// apps/crawler/src/coolpc/crawl-run/status.ts
// 定義 crawler run 與分類結果的狀態常數、型別與彙總規則。

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

/**
 * 依 category result 聚合判斷整體 crawl run 狀態。
 * 優先權順序（由高到低）：
 * 1) suspected_block：只要有一筆即代表整體應立即標記為阻斷。
 * 2) 成功比例：全部都是 success => 回傳 SUCCESS_CHANGED 或 SUCCESS_UNCHANGED。
 * 3) 成功+失敗混合：回傳 SUCCESS_WITH_ERRORS。
 * 4) 全部非成功且有 parse 失敗 => PARSE_FAILED。
 * 5) 全部非成功且有 fetch 失敗 => FETCH_FAILED。
 * 6) 其餘情境 => SUCCESS_UNCHANGED（包含空結果陣列，若要調整需同步監控與告警語意）。
 */
export function resolveCrawlRunStatus(
  results: Array<{ status: CrawlRunCategoryResultStatusValue }>,
): CrawlRunStatusValue {
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

/**
 * 判斷單一分類結果是否屬於成功類別。
 */
export function isSuccessStatus(status: CrawlRunCategoryResultStatusValue): boolean {
  return (
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED ||
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
  );
}
