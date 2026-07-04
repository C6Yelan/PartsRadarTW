// apps/web/app/ops/status/queries.ts

import type { CrawlRunStatus, Prisma } from "@partsradar/db";

const SUCCESSFUL_SCHEDULED_STATUSES: CrawlRunStatus[] = ["SUCCESS_CHANGED", "SUCCESS_UNCHANGED"];

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

export const OPS_DISCORD_DELIVERY_HEALTH_SCAN_LIMIT = 500;
export const OPS_DISCORD_DELIVERY_HEALTH_SELECT = {
  id: true,
  discordUserId: true,
  kind: true,
  status: true,
  targetPriceWatchId: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

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
