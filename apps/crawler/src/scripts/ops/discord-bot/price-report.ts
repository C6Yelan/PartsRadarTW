// apps/crawler/src/scripts/ops/discord-bot/price-report.ts
// 集中提供 Discord 個人價格報告流程對外使用的讀取、發送、排程、篩選與訊息組裝入口。

export {
  filterNewProductsForReport,
  filterPriceChangesForReport,
  formatPriceReportCategoryFilterLabel,
  formatPriceReportContentFilterLabel,
  formatPriceReportKeywordFilterLabel,
  normalizePriceReportFilters,
  toPriceReportFilters,
} from "./price-report/filters";
export {
  createPublicPriceChangeReportMessages,
  createPublicPriceReportMessages,
} from "./price-report/messages";
export { formatTaipeiMinute, formatWindowLabel } from "./price-report/schedule";
export {
  readLatestScheduledPriceReportDelivery,
  sendPriceReportNow,
} from "./price-report/delivery";
export { readPriceReportCategories } from "./price-report/categories";
export {
  calculateScheduledPriceReportSleepMs,
  readNextScheduledPriceReportDueAt,
  sendDueScheduledPriceReports,
} from "./price-report/scheduler";
export {
  disablePriceReport,
  enableDailyScheduledPriceReport,
  formatPriceReportSettingMessage,
  readPriceReportSetting,
} from "./price-report/settings";
export type {
  PriceReportCategoryOption,
  PriceReportFilterSetting,
  PriceReportFilters,
} from "./price-report/filters";
export type { PriceReportDeliveryStatus } from "./price-report/delivery";
export type { ScheduledPriceReportSummary } from "./price-report/scheduler";
