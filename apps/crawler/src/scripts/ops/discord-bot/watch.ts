// apps/crawler/src/scripts/ops/discord-bot/watch.ts
// 集中轉出 Discord 目標價 watch 管理流程使用的 CRUD、清單、訊息與回覆 helper。

export {
  consumeTargetPriceWatchBulkRemovalConfirmation,
  createTargetPriceWatchBulkRemovalConfirmation,
} from "./watch/bulk-removal";
export type { TargetPriceWatchBulkRemovalConfirmationResult } from "./watch/bulk-removal";
export {
  createTargetPriceWatchBulkRemovalConfirmationMessage,
  createTargetPriceWatchBulkRemovalMessage,
} from "./watch/bulk-removal-messages";
export {
  createTargetPriceWatch,
  disableTargetPriceWatch,
  disableTargetPriceWatches,
  readTargetPriceWatch,
  updateTargetPriceWatch,
} from "./watch/crud";
export { readLatestTargetPriceWatchDelivery } from "./watch/delivery-status";
export { readTargetPriceWatchlist } from "./watch/list";
export { createTargetPriceWatchManagerMessage } from "./watch/manager-message";
export { normalizeWatchProductReference } from "./watch/reference";
export {
  createTargetPriceWatchRemovalConfirmationMessage,
  createTargetPriceWatchResponseMessage,
} from "./watch/response-messages";
export type {
  CreateTargetPriceWatchResult,
  DisableTargetPriceWatchResult,
  DisableTargetPriceWatchesResult,
  TargetPriceWatchDeliveryStatus,
  TargetPriceWatchListRecord,
  TargetPriceWatchLookupResult,
  TargetPriceWatchlistResult,
  UpdateTargetPriceWatchResult,
} from "./watch/records";
