// apps/crawler/src/scripts/ops/discord-bot/price-report/reader.ts
// 保留 Discord Bot 既有 import path，實際查詢語意由共用 DB read module 提供。

export {
  readCrawlRunPriceChangeSummary,
  readRecentPriceReport,
} from "@partsradar/db/price-report";
