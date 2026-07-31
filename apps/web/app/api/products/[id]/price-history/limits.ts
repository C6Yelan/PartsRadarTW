// apps/web/app/api/products/[id]/price-history/limits.ts
// 集中定義公開價格歷史端點的 DB、points 與序列化回應硬上限。

export const PRICE_HISTORY_MAX_RESPONSE_POINTS = 256;
export const PRICE_HISTORY_CONFIRMATION_POINT_RESERVE = 1;
export const PRICE_HISTORY_SNAPSHOT_LIMIT =
  PRICE_HISTORY_MAX_RESPONSE_POINTS - PRICE_HISTORY_CONFIRMATION_POINT_RESERVE;
export const PRICE_HISTORY_RAW_PROBE_LIMIT = PRICE_HISTORY_SNAPSHOT_LIMIT + 1;
export const PRICE_HISTORY_BUCKET_COUNT = Math.floor((PRICE_HISTORY_SNAPSHOT_LIMIT - 2) / 2);
export const PRICE_HISTORY_MAX_RESPONSE_BYTES = 64 * 1024;
export const PRICE_HISTORY_DB_STATEMENT_TIMEOUT_MS = 2_500;
export const PRICE_HISTORY_DB_TRANSACTION_TIMEOUT_MS = 3_000;

export const PRICE_HISTORY_INDEX_NAME = "price_snapshots_product_id_captured_at_id_idx";

if (2 + PRICE_HISTORY_BUCKET_COUNT * 2 > PRICE_HISTORY_SNAPSHOT_LIMIT) {
  throw new Error("Price history sampling limits exceed the snapshot budget.");
}
