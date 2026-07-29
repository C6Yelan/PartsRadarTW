// packages/db/src/price-report/limits.ts
// 集中定義價格報告資料庫讀取上限與超量錯誤，避免顯示上限被誤當成查詢工作量上限。

// 2026-07-29 aggregate baseline: recent 30d=1,037 rows, crawl-run max=2,392,
// and the representative product relation estimate was 4,044 rows.
export const PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT = 4_096;

// The same baseline observed at most six snapshots per product all-time.
export const PRICE_REPORT_PREVIOUS_SNAPSHOT_LIMIT = PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT * 8;

export type PriceReportWorkBudgetScope =
  | "recent_current"
  | "recent_baseline"
  | "crawl_run_current"
  | "crawl_run_previous";

export class PriceReportWorkBudgetExceededError extends Error {
  readonly name = "PriceReportWorkBudgetExceededError";

  constructor(
    readonly scope: PriceReportWorkBudgetScope,
    readonly limit: number,
    readonly observedRows: number,
  ) {
    super("Price report work budget exceeded.");
  }
}

export function assertPriceReportWorkBudget<T>(
  rows: T[],
  scope: PriceReportWorkBudgetScope,
  limit: number,
): T[] {
  if (rows.length > limit) {
    throw new PriceReportWorkBudgetExceededError(scope, limit, rows.length);
  }

  return rows;
}
