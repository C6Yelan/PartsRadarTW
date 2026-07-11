// apps/crawler/src/scripts/ops/discord-bot/price-report.ts
// 集中提供 Discord 個人價格報告流程對外使用的讀取、發送、排程、篩選與訊息組裝入口。

export { readPriceReportCategories } from "./price-report/categories";
export type { PriceReportDeliveryStatus } from "./price-report/delivery";
export {
  readLatestScheduledPriceReportDelivery,
  sendPriceReportNow,
} from "./price-report/delivery";
export type {
  PriceReportCategoryOption,
  PriceReportFilterSetting,
  PriceReportFilters,
} from "./price-report/filters";
export {
  filterNewProductsForReport,
  filterPriceChangesForReport,
  formatPriceReportCategoryFilterLabel,
  formatPriceReportContentFilterLabel,
  formatPriceReportKeywordFilterLabel,
  normalizePriceReportFilters,
  toPriceReportFilters,
} from "./price-report/filters";
export { formatTaipeiMinute, formatWindowLabel } from "./price-report/schedule";
export type { ScheduledPriceReportSummary } from "./price-report/scheduler";
export {
  calculateScheduledPriceReportSleepMs,
  readNextScheduledPriceReportDueAt,
  sendDueScheduledPriceReports,
} from "./price-report/scheduler";
export {
  disablePriceReport,
  enableDailyScheduledPriceReport,
  readPriceReportSetting,
} from "./price-report/settings";
