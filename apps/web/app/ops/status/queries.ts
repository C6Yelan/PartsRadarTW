// apps/web/app/ops/status/queries.ts
// 定義 /ops/status 資料收集使用的 Prisma query select，避免狀態頁讀取不必要欄位。

import type { CrawlRunStatus, Prisma } from "@partsradar/db";

const SUCCESSFUL_SCHEDULED_STATUSES: CrawlRunStatus[] = ["SUCCESS_CHANGED", "SUCCESS_UNCHANGED"];

// 讀取啟用中的來源分類同步時間，供 freshness 檢查與表格顯示。
export const OPS_SOURCE_CATEGORY_QUERY = {
  where: { enabled: true },
  orderBy: { igrp: "asc" },
  select: {
    igrp: true,
    displayName: true,
    sourceName: true,
    lastCheckedAt: true,
    lastSuccessAt: true,
  },
} as const satisfies Prisma.SourceCategoryFindManyArgs;

// 讀取最近一筆 scheduled crawl run，用來顯示目前最新排程結果。
export const OPS_LATEST_SCHEDULED_RUN_QUERY = {
  where: {
    triggerType: "SCHEDULED",
  },
  orderBy: {
    startedAt: "desc",
  },
  select: {
    id: true,
    status: true,
    startedAt: true,
    finishedAt: true,
  },
} as const satisfies Prisma.CrawlRunFindFirstArgs;

// 讀取最近一筆成功的 scheduled crawl run，用來判斷 crawler freshness。
export const OPS_LATEST_SUCCESSFUL_SCHEDULED_RUN_QUERY = {
  where: {
    triggerType: "SCHEDULED",
    status: {
      in: [...SUCCESSFUL_SCHEDULED_STATUSES],
    },
    finishedAt: {
      not: null,
    },
  },
  orderBy: {
    finishedAt: "desc",
  },
  select: {
    id: true,
    status: true,
    finishedAt: true,
  },
} as const satisfies Prisma.CrawlRunFindFirstArgs;

// 讀取最近 crawl run 清單，供內部頁面表格顯示高層結果。
export const OPS_RECENT_CRAWL_RUN_QUERY = {
  take: 6,
  orderBy: {
    startedAt: "desc",
  },
  select: {
    id: true,
    status: true,
    triggerType: true,
    startedAt: true,
    finishedAt: true,
    backoffUntil: true,
    _count: {
      select: {
        categoryResults: true,
        parseErrors: true,
        priceSnapshots: true,
      },
    },
  },
} as const satisfies Prisma.CrawlRunFindManyArgs;

// 讀取最近 Discord delivery 清單；刻意不選 user id 或錯誤訊息。
export const OPS_RECENT_DISCORD_DELIVERY_QUERY = {
  take: 6,
  orderBy: {
    createdAt: "desc",
  },
  select: {
    id: true,
    kind: true,
    status: true,
    itemCount: true,
    messageCount: true,
    deliveredAt: true,
    createdAt: true,
  },
} as const satisfies Prisma.DiscordNotificationDeliveryFindManyArgs;

// delivery health 掃描數量上限，避免狀態頁一次讀取過多歷史紀錄。
export const OPS_DISCORD_DELIVERY_HEALTH_SCAN_LIMIT = 500;
// delivery health 需要用 user / watch stream 去重，因此此 select 僅供內部聚合使用。
export const OPS_DISCORD_DELIVERY_HEALTH_SELECT = {
  id: true,
  discordUserId: true,
  kind: true,
  status: true,
  targetPriceWatchId: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

// 定義「可顯示商品」條件，用於商品數與圖片快取檢查。
export const OPS_DISPLAY_READY_PRODUCT_WHERE = {
  isActive: true,
  primaryImageUrl: {
    not: null,
  },
  primaryImageCheckedAt: {
    not: null,
  },
  currentPrice: {
    isNot: null,
  },
} as const satisfies Prisma.ProductWhereInput;

// 只讀可顯示商品 id，供圖片快取檔案存在性檢查使用。
export const OPS_DISPLAY_READY_PRODUCT_ID_QUERY = {
  where: OPS_DISPLAY_READY_PRODUCT_WHERE,
  select: {
    id: true,
  },
} as const satisfies Prisma.ProductFindManyArgs;

export type OpsSourceCategoryRecord = Prisma.SourceCategoryGetPayload<{
  select: typeof OPS_SOURCE_CATEGORY_QUERY.select;
}>;
export type OpsLatestScheduledRunRecord = Prisma.CrawlRunGetPayload<{
  select: typeof OPS_LATEST_SCHEDULED_RUN_QUERY.select;
}>;
export type OpsLatestSuccessfulScheduledRunRecord = Prisma.CrawlRunGetPayload<{
  select: typeof OPS_LATEST_SUCCESSFUL_SCHEDULED_RUN_QUERY.select;
}>;
export type OpsRecentCrawlRunRecord = Prisma.CrawlRunGetPayload<{
  select: typeof OPS_RECENT_CRAWL_RUN_QUERY.select;
}>;
export type OpsDiscordDeliveryRecord = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof OPS_RECENT_DISCORD_DELIVERY_QUERY.select;
}>;
export type OpsDiscordDeliveryHealthRecord = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof OPS_DISCORD_DELIVERY_HEALTH_SELECT;
}>;
export type OpsDisplayReadyProductRecord = Prisma.ProductGetPayload<{
  select: typeof OPS_DISPLAY_READY_PRODUCT_ID_QUERY.select;
}>;
