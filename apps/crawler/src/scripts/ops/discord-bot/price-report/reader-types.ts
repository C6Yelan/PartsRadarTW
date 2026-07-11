// apps/crawler/src/scripts/ops/discord-bot/price-report/reader-types.ts
// 定義價格報告 reader 對資料庫、訊息組裝與篩選流程輸出的共用資料契約。

import type { PrismaClient } from "@partsradar/db";

// 單筆價格變動項目，供個人與公開 Discord 報告共用。
export interface PriceReportPriceChangeItem {
  productId: string;
  productName: string;
  category: PriceReportProductCategory;
  subcategory: PriceReportProductSubcategory | null;
  previousPrice: number;
  currentPrice: number;
  currency: string;
  changedAt: Date;
  delta: number;
}

// 報告期間首次出現的商品項目，供新增商品區塊顯示。
export interface PriceReportNewProductItem {
  productId: string;
  productName: string;
  category: PriceReportProductCategory;
  subcategory: PriceReportProductSubcategory | null;
  currentPrice: number;
  currency: string;
  firstSeenAt: Date;
}

// 價格報告顯示與分組使用的來源分類資訊。
export interface PriceReportProductCategory {
  igrp: number;
  displayName: string;
}

// 由商品品牌資訊推得的報告子分類，用於縮短與分段商品清單。
export interface PriceReportProductSubcategory {
  slug: string | null;
  displayName: string;
}

// reader 對外輸出的近期價格報告結果。
export interface RecentPriceReport {
  priceChanges: PriceReportPriceChangeItem[];
  newProducts: PriceReportNewProductItem[];
}

// reader 層使用的篩選條件，對應個人與公開價格報告設定。
export interface RecentPriceReportFilters {
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
}

// 價格報告 reader 只依賴 priceSnapshot delegate，不綁定完整 PrismaClient。
export type PriceReportReaderClient = Pick<PrismaClient, "priceSnapshot">;

// 本次報告期間的 price snapshot 查詢結果，包含組裝報告需要的商品欄位。
export interface CrawlRunPriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: string;
  capturedAt: Date;
  product: {
    id: string;
    name: string;
    vendorSlug: string | null;
    vendorName: string | null;
    sourceCategory: {
      igrp: number;
      displayName: string;
    };
  };
}

// 前次價格比對只需要 snapshot 的價格、幣別與時間欄位。
export interface PreviousPriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: string;
  capturedAt: Date;
}

// 讀取指定 crawl run 價格變動時回傳的統計結果，供公開報告與維護判讀使用。
export interface CrawlRunPriceChangeReadResult {
  changes: PriceReportPriceChangeItem[];
  newProducts: PriceReportNewProductItem[];
  snapshotCount: number;
  unmatchedSnapshotCount: number;
  unchangedSnapshotCount: number;
  currencyMismatchCount: number;
}

// 近期價格報告 reader 的時間窗與篩選條件。
export interface RecentPriceChangeOptions {
  since: Date;
  until?: Date;
  filters?: RecentPriceReportFilters;
}
