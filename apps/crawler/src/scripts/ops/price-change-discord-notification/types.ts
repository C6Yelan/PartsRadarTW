// apps/crawler/src/scripts/ops/price-change-discord-notification/types.ts

import type { PrismaClient } from "@partsradar/db";

export interface PriceChangeDiscordNotificationItem {
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
  priceChanges: PriceChangeDiscordNotificationItem[];
  newProducts: PriceReportNewProductItem[];
}

export interface RecentPriceReportFilters {
  categoryIgrps?: number[];
  productKeyword?: string | null;
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
}

export type PriceChangeDiscordClient = Pick<PrismaClient, "priceSnapshot">;

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
  changes: PriceChangeDiscordNotificationItem[];
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
