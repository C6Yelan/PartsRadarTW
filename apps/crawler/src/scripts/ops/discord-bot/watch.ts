// apps/crawler/src/scripts/ops/discord-bot/watch.ts
// 集中轉出 Discord 目標價 watch 管理流程使用的 CRUD、清單、訊息與回覆 helper。

export {
  createTargetPriceWatch,
  disableTargetPriceWatch,
  readTargetPriceWatch,
  updateTargetPriceWatch,
} from "./watch/crud";
export { readLatestTargetPriceWatchDelivery } from "./watch/delivery-status";
export { readTargetPriceWatchlist } from "./watch/list";
export { createTargetPriceWatchManagerMessage } from "./watch/manager-message";
export type {
  CreateTargetPriceWatchResult,
  DisableTargetPriceWatchResult,
  TargetPriceWatchDeliveryStatus,
  TargetPriceWatchListRecord,
  TargetPriceWatchLookupResult,
  TargetPriceWatchlistResult,
  UpdateTargetPriceWatchResult,
} from "./watch/records";
export { normalizeWatchProductReference } from "./watch/reference";
export {
  createTargetPriceWatchRemovalConfirmationMessage,
  createTargetPriceWatchResponseMessage,
} from "./watch/response-messages";
