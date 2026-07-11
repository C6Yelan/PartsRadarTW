// packages/db/src/price-report/index.ts
// 公開價格報告的共用唯讀查詢入口，不初始化 Prisma client 或包含通知流程。

export { readCrawlRunPriceChangeSummary, readRecentPriceReport } from "./reader";
export type {
  CrawlRunPriceChangeReadResult,
  CrawlRunPriceSnapshot,
  PreviousPriceSnapshot,
  PriceReportNewProductItem,
  PriceReportPriceChangeItem,
  PriceReportProductCategory,
  PriceReportProductSubcategory,
  PriceReportReaderClient,
  RecentPriceChangeOptions,
  RecentPriceReport,
  RecentPriceReportFilters,
} from "./types";
