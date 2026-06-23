// apps/crawler/src/scripts/ops/price-change-discord-notification/types.ts

import type { PrismaClient } from "@partsradar/db";

export interface PriceChangeDiscordNotificationOptions {
  publicWebhookUrl: string | null;
  publicBaseUrl: string;
  maxItems: number;
}

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
  includePriceDrops?: boolean;
  includePriceRises?: boolean;
  includeNewProducts?: boolean;
}

export type PriceChangeDiscordNotificationSkipReason =
  | "missing_webhook_url"
  | "no_price_changes"
  | "sender_skipped";

export type PriceChangeDiscordNotificationResult =
  | {
      status: "skipped";
      reason: PriceChangeDiscordNotificationSkipReason;
      changeCount: number;
      listedCount: number;
      messageCount: number;
      snapshotCount?: number;
      unmatchedSnapshotCount?: number;
      unchangedSnapshotCount?: number;
      currencyMismatchCount?: number;
    }
  | {
      status: "sent";
      changeCount: number;
      listedCount: number;
      messageCount: number;
      httpStatuses: number[];
    }
  | {
      status: "rate_limited";
      changeCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      changeCount: number;
      listedCount: number;
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

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

export interface PriceChangeReportMessageOptions {
  publicBaseUrl: string;
  maxItems: number;
  title?: string;
  browseLabel?: string;
  hiddenLimitLabel?: string;
  emptyMessage?: string;
}
