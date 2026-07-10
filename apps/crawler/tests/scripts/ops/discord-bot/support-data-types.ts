// apps/crawler/tests/scripts/ops/discord-bot/support-data-types.ts
// 定義 Discord bot 測試資料列型別，供 fixture factory 與 fake client 共用。

import type { DiscordDeliveryErrorCategory } from "@partsradar/db";

export interface TestSnapshot {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  currency: string;
  capturedAt: Date;
  categoryIgrp: number;
  categoryName: string;
  vendorSlug: string | null;
  vendorName: string | null;
}

export interface TestPriceReportSetting {
  id: string;
  discordUserId: string;
  interval: "DAILY" | "EVERY_12H" | "EVERY_6H";
  window: "HOURS_24" | "HOURS_12" | "HOURS_6";
  scope: "ALL" | "WATCHLIST";
  timezone: string;
  maxItems: number;
  categoryIgrps: number[];
  productKeyword: string | null;
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
  enabled: boolean;
  nextSendAt: Date | null;
  lastSentAt: Date | null;
  notificationCursorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestSourceCategory {
  igrp: number;
  displayName: string;
}

export interface TestProductWhere {
  sourceCategory?: {
    igrp?: {
      in?: number[];
    };
  };
  name?: {
    contains?: string;
  };
  AND?: TestProductWhere[];
  OR?: TestProductWhere[];
}

export interface TestTargetPriceWatch {
  id: string;
  discordUserId: string;
  productId: string;
  targetPrice: number;
  currency: string;
  enabled: boolean;
  lastNotifiedAt: Date | null;
  notificationClaimedAt: Date | null;
  notificationCursorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestDiscordNotificationDelivery {
  id: string;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE";
  status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
  productId: string | null;
  targetPriceWatchId: string | null;
  dedupeKey: string | null;
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
  errorCategory: DiscordDeliveryErrorCategory | null;
  httpStatus: number | null;
  providerErrorCode: number | null;
  createdAt: Date;
}

export interface TestDiscordPublicPriceReportDelivery {
  id: string;
  crawlRunId: string;
  channelId: string;
  status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
  itemCount: number;
  messageCount: number;
  deliveredAt: Date | null;
  errorMessage: string | null;
  errorCategory: DiscordDeliveryErrorCategory | null;
  httpStatus: number | null;
  providerErrorCode: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestDiscordPublicPriceReportSetting {
  id: string;
  discordGuildId: string;
  channelId: string;
  maxItems: number;
  categoryIgrps: number[];
  productKeyword: string | null;
  includePriceDrops: boolean;
  includePriceRises: boolean;
  includeNewProducts: boolean;
  enabled: boolean;
  notificationCursorAt: Date | null;
  createdByDiscordUserId: string;
  updatedByDiscordUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestCrawlRun {
  id: string;
  status: "SUCCESS_CHANGED" | "SUCCESS_WITH_ERRORS" | "SUCCESS_UNCHANGED";
  triggerType: "SCHEDULED" | "MANUAL";
  finishedAt: Date | null;
}
