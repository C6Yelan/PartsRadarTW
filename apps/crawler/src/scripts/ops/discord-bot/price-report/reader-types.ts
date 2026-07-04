// apps/crawler/src/scripts/ops/discord-bot/price-report/reader-types.ts

import type { PrismaClient } from "@partsradar/db";

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

export interface PriceReportNewProductItem {
  productId: string;
  productName: string;
  category: PriceReportProductCategory;
  subcategory: PriceReportProductSubcategory | null;
  currentPrice: number;
  currency: string;
  firstSeenAt: Date;
}

export interface PriceReportProductCategory {
  igrp: number;
  displayName: string;
}

export interface PriceReportProductSubcategory {
  slug: string | null;
  displayName: string;
}

export interface RecentPriceReport {
  priceChanges: PriceReportPriceChangeItem[];
  newProducts: PriceReportNewProductItem[];
}

export interface RecentPriceReportFilters {
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
}

export type PriceReportReaderClient = Pick<PrismaClient, "priceSnapshot">;

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

export interface PreviousPriceSnapshot {
  id: string;
  productId: string;
  price: number;
  currency: string;
  capturedAt: Date;
}

export interface CrawlRunPriceChangeReadResult {
  changes: PriceReportPriceChangeItem[];
  newProducts: PriceReportNewProductItem[];
  snapshotCount: number;
  unmatchedSnapshotCount: number;
  unchangedSnapshotCount: number;
  currencyMismatchCount: number;
}

export interface RecentPriceChangeOptions {
  since: Date;
  until?: Date;
  filters?: RecentPriceReportFilters;
}
