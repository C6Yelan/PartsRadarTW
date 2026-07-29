// packages/db/src/price-report/limits.ts
// 集中定義價格報告資料庫讀取上限與超量錯誤，避免顯示上限被誤當成查詢工作量上限。

// 2026-07-29 aggregate baseline: recent 30d=1,037 rows, crawl-run max=2,392,
// and the representative product relation estimate was 4,044 rows.
export const PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT = 4_096;

// Narrow clients without parameterized raw-query support use fixed-size lookup batches.
// The current-row limit also fixes the maximum number of batches and predecessor rows.
export const PRICE_REPORT_PREDECESSOR_LOOKUP_BATCH_SIZE = 32;

export type PriceReportWorkBudgetScope = "recent_current" | "crawl_run_current";

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
