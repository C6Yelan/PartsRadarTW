// apps/web/app/ops/status/data.ts
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { CrawlRunStatus, Prisma, PrismaClient } from "@partsradar/db";

const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "storage/product-images";
const DEFAULT_SOURCE_WARN_AFTER_MINUTES = 60;
const DEFAULT_SOURCE_FAIL_AFTER_MINUTES = 120;
const DEFAULT_CRAWLER_WARN_AFTER_MINUTES = 90;
const DEFAULT_CRAWLER_FAIL_AFTER_MINUTES = 180;
const DEFAULT_RECENT_WINDOW_HOURS = 24;
const DEFAULT_PARSE_ERROR_WARN_COUNT = 20;
const DEFAULT_PARSE_ERROR_FAIL_COUNT = 100;
const DEFAULT_INVALID_IMAGE_URL_WARN_COUNT = 2000;
const DEFAULT_MIN_ACTIVE_PRODUCTS = 1;
const DEFAULT_MISSING_IMAGE_WARN_COUNT = 200;
const DEFAULT_MISSING_IMAGE_FAIL_COUNT = 500;
const DEFAULT_BROKEN_LINK_WARN_COUNT = 1;
const DEFAULT_BROKEN_LINK_FAIL_COUNT = 50;
const DEFAULT_TEMPORARY_LINK_WARN_COUNT = 100;
const DEFAULT_TEMPORARY_LINK_FAIL_COUNT = 500;
const DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS = 30;
const DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS = 90;
const DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS = 2;
const DEFAULT_RAW_SNAPSHOT_WARN_COUNT = 1;
const DEFAULT_RAW_SNAPSHOT_FAIL_COUNT = 100;
const DEFAULT_CRAWLER_INTERVAL_SECONDS = 1800;
const DEFAULT_CRAWLER_BACKOFF_SECONDS = 3600;
const DEFAULT_CRAWLER_LOCK_RETRY_SECONDS = 120;
const DEFAULT_CRAWLER_CATEGORY_DELAY_MS = 8000;
const DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS = 5000;
const DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS = 12000;
const DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS = 15000;
const DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 24 * 60 * 60;
const DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS = 15 * 60;
const DEFAULT_MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS = 5 * 60;
const DEFAULT_MAINTENANCE_LINK_LIMIT = 200;
const DEFAULT_MAINTENANCE_LINK_STALE_AFTER_HOURS = 48;
const DEFAULT_MAINTENANCE_LINK_MIN_DELAY_MS = 10000;
const DEFAULT_MAINTENANCE_LINK_MAX_DELAY_MS = 20000;
const DEFAULT_RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60;
const DEFAULT_SMOKE_INTERVAL_SECONDS = 300;
const DEFAULT_SMOKE_INITIAL_DELAY_SECONDS = 60;
const DEFAULT_SMOKE_PUBLIC_BASE_URL = "http://web:3000";
const DEFAULT_DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS = 300;
const DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS = 12 * 60 * 60;
const DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS = 10 * 60;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

const SUCCESSFUL_SCHEDULED_STATUSES: CrawlRunStatus[] = ["SUCCESS_CHANGED", "SUCCESS_UNCHANGED"];
const LINK_KINDS = ["SOURCE"] as const;
const LINK_STATUSES = ["OK", "BROKEN", "TEMPORARY_ERROR"] as const;

export type OpsStatusLevel = "ok" | "warn" | "fail";
type ProductLinkKindValue = (typeof LINK_KINDS)[number];
type ProductLinkHealthStatusValue = (typeof LINK_STATUSES)[number];

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

const OPS_DISCORD_DELIVERY_HEALTH_SCAN_LIMIT = 500;
const OPS_DISCORD_DELIVERY_HEALTH_SELECT = {
  id: true,
  discordUserId: true,
  kind: true,
  status: true,
  targetPriceWatchId: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

const OPS_DISPLAY_READY_PRODUCT_WHERE = {
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

const OPS_DISPLAY_READY_PRODUCT_ID_QUERY = {
  where: OPS_DISPLAY_READY_PRODUCT_WHERE,
  select: {
    id: true,
  },
} as const satisfies Prisma.ProductFindManyArgs;

type OpsSourceCategoryRecord = Prisma.SourceCategoryGetPayload<{
  select: typeof OPS_SOURCE_CATEGORY_QUERY.select;
}>;
type OpsLatestScheduledRunRecord = Prisma.CrawlRunGetPayload<{
  select: typeof OPS_LATEST_SCHEDULED_RUN_QUERY.select;
}>;
type OpsLatestSuccessfulScheduledRunRecord = Prisma.CrawlRunGetPayload<{
  select: typeof OPS_LATEST_SUCCESSFUL_SCHEDULED_RUN_QUERY.select;
}>;
type OpsRecentCrawlRunRecord = Prisma.CrawlRunGetPayload<{
  select: typeof OPS_RECENT_CRAWL_RUN_QUERY.select;
}>;
type OpsDiscordDeliveryRecord = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof OPS_RECENT_DISCORD_DELIVERY_QUERY.select;
}>;
type OpsDiscordDeliveryHealthRecord = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof OPS_DISCORD_DELIVERY_HEALTH_SELECT;
}>;
type OpsDisplayReadyProductRecord = Prisma.ProductGetPayload<{
  select: typeof OPS_DISPLAY_READY_PRODUCT_ID_QUERY.select;
}>;

export interface OpsStatusThresholds {
  sourceWarnAfterMinutes: number;
  sourceFailAfterMinutes: number;
  crawlerWarnAfterMinutes: number;
  crawlerFailAfterMinutes: number;
  recentWindowHours: number;
  parseErrorWarnCount: number;
  parseErrorFailCount: number;
  invalidImageUrlWarnCount: number;
  minActiveProducts: number;
  missingImageWarnCount: number;
  missingImageFailCount: number;
  sourceBrokenLinkWarnCount: number;
  sourceBrokenLinkFailCount: number;
  sourceTemporaryLinkWarnCount: number;
  sourceTemporaryLinkFailCount: number;
  rawSnapshotNormalRetentionDays: number;
  rawSnapshotAbnormalRetentionDays: number;
  rawSnapshotRetentionGraceDays: number;
  rawSnapshotWarnCount: number;
  rawSnapshotFailCount: number;
}

export type OpsStatusEnv = Record<string, string | undefined>;

export interface OpsStatusReadClient {
  sourceCategory: {
    findMany(args: typeof OPS_SOURCE_CATEGORY_QUERY): Promise<OpsSourceCategoryRecord[]>;
  };
  crawlRun: {
    findLatestScheduled(): Promise<OpsLatestScheduledRunRecord | null>;
    findLatestSuccessfulScheduled(): Promise<OpsLatestSuccessfulScheduledRunRecord | null>;
    findMany(args: typeof OPS_RECENT_CRAWL_RUN_QUERY): Promise<OpsRecentCrawlRunRecord[]>;
    count(args: Prisma.CrawlRunCountArgs): Promise<number>;
  };
  parseError: {
    count(args: Prisma.ParseErrorCountArgs): Promise<number>;
  };
  product: {
    count(args: Prisma.ProductCountArgs): Promise<number>;
    findMany(
      args: typeof OPS_DISPLAY_READY_PRODUCT_ID_QUERY,
    ): Promise<OpsDisplayReadyProductRecord[]>;
  };
  productLinkHealth: {
    count(args: Prisma.ProductLinkHealthCountArgs): Promise<number>;
  };
  rawSnapshot: {
    count(args: Prisma.RawSnapshotCountArgs): Promise<number>;
  };
  discordPriceReportSetting: {
    count(args: Prisma.DiscordPriceReportSettingCountArgs): Promise<number>;
  };
  discordTargetPriceWatch: {
    count(args: Prisma.DiscordTargetPriceWatchCountArgs): Promise<number>;
  };
  discordNotificationDelivery: {
    count(args: Prisma.DiscordNotificationDeliveryCountArgs): Promise<number>;
    findMany(args: Prisma.DiscordNotificationDeliveryFindManyArgs): Promise<unknown[]>;
  };
}

export interface OpsStatusCheck {
  key: string;
  label: string;
  level: OpsStatusLevel;
  message: string;
}

export interface OpsStatusLinkKindSummary {
  ok: number;
  broken: number;
  temporaryError: number;
}

export interface OpsStatusScheduleJob {
  key: string;
  label: string;
  cadence: string;
  details: string[];
}

export interface OpsStatusRuntimePolicy {
  key: string;
  label: string;
  detail: string;
}

export interface OpsStatusRuntimeSchedule {
  jobs: OpsStatusScheduleJob[];
  policies: OpsStatusRuntimePolicy[];
}

export interface OpsStatusDiscordDeliveryKindSummary {
  sent: number;
  skipped: number;
  failed: number;
  rateLimited: number;
}

export interface OpsStatusDiscordBotSummary {
  priceReportSettings: {
    total: number;
    enabled: number;
    dueNow: number;
  };
  targetPriceWatches: {
    active: number;
    notified: number;
    claimed: number;
  };
  recentDeliveries: {
    windowHours: number;
    priceReportNow: OpsStatusDiscordDeliveryKindSummary;
    scheduledPriceReport: OpsStatusDiscordDeliveryKindSummary;
    targetPrice: OpsStatusDiscordDeliveryKindSummary;
  };
  latestDeliveries: OpsDiscordDeliveryRecord[];
}

export interface OpsStatusSummary {
  generatedAt: Date;
  overallLevel: OpsStatusLevel;
  checks: OpsStatusCheck[];
  productCounts: {
    active: number;
    displayReady: number;
    missingImages: number;
  };
  recentSignals: {
    windowHours: number;
    suspectedBlocks: number;
    parseErrors: number;
    invalidImageUrls: number;
  };
  rawSnapshotRetention: {
    expired: number;
    expiredNormal: number;
    expiredAbnormal: number;
  };
  linkHealth: {
    source: OpsStatusLinkKindSummary;
  };
  sourceCategories: OpsSourceCategoryRecord[];
  latestScheduledRun: OpsLatestScheduledRunRecord | null;
  latestSuccessfulScheduledRun: OpsLatestSuccessfulScheduledRunRecord | null;
  recentCrawlRuns: OpsRecentCrawlRunRecord[];
  discordBot: OpsStatusDiscordBotSummary;
  thresholds: OpsStatusThresholds;
  runtimeSchedule: OpsStatusRuntimeSchedule;
}

export interface CollectOpsStatusOptions {
  now?: () => Date;
  env?: OpsStatusEnv;
  thresholds?: OpsStatusThresholds;
  productImageStorageDir?: string;
  productImageExists?: (path: string) => Promise<boolean>;
}

export function createPrismaOpsStatusClient(prisma: PrismaClient): OpsStatusReadClient {
  return {
    sourceCategory: {
      findMany: (args) => prisma.sourceCategory.findMany(args),
    },
    crawlRun: {
      findLatestScheduled: () => prisma.crawlRun.findFirst(OPS_LATEST_SCHEDULED_RUN_QUERY),
      findLatestSuccessfulScheduled: () =>
        prisma.crawlRun.findFirst(OPS_LATEST_SUCCESSFUL_SCHEDULED_RUN_QUERY),
      findMany: (args) => prisma.crawlRun.findMany(args),
      count: (args) => prisma.crawlRun.count(args),
    },
    parseError: {
      count: (args) => prisma.parseError.count(args),
    },
    product: {
      count: (args) => prisma.product.count(args),
      findMany: (args) => prisma.product.findMany(args),
    },
    productLinkHealth: {
      count: (args) => prisma.productLinkHealth.count(args),
    },
    rawSnapshot: {
      count: (args) => prisma.rawSnapshot.count(args),
    },
    discordPriceReportSetting: {
      count: (args) => prisma.discordPriceReportSetting.count(args),
    },
    discordTargetPriceWatch: {
      count: (args) => prisma.discordTargetPriceWatch.count(args),
    },
    discordNotificationDelivery: {
      count: (args) => prisma.discordNotificationDelivery.count(args),
      findMany: (args) => prisma.discordNotificationDelivery.findMany(args),
    },
  };
}

export async function collectOpsStatus(
  client: OpsStatusReadClient,
  options: CollectOpsStatusOptions = {},
): Promise<OpsStatusSummary> {
  const now = options.now?.() ?? new Date();
  const thresholds = options.thresholds ?? readOpsStatusThresholds(options.env ?? process.env);
  const recentSince = new Date(
    now.getTime() - thresholds.recentWindowHours * MILLISECONDS_PER_HOUR,
  );
  const productImageStorageDir =
    options.productImageStorageDir ?? DEFAULT_PRODUCT_IMAGE_STORAGE_DIR;
  const productImageExists = options.productImageExists ?? pathExists;

  const [
    sourceCategories,
    latestScheduledRun,
    latestSuccessfulScheduledRun,
    recentCrawlRuns,
    activeProductCount,
    displayReadyProductCount,
    displayReadyProducts,
    suspectedBlockCount,
    parseErrorCount,
    invalidImageUrlCount,
    linkHealth,
    rawSnapshotRetention,
    discordBot,
  ] = await Promise.all([
    client.sourceCategory.findMany(OPS_SOURCE_CATEGORY_QUERY),
    client.crawlRun.findLatestScheduled(),
    client.crawlRun.findLatestSuccessfulScheduled(),
    client.crawlRun.findMany(OPS_RECENT_CRAWL_RUN_QUERY),
    client.product.count({ where: { isActive: true } }),
    client.product.count({ where: OPS_DISPLAY_READY_PRODUCT_WHERE }),
    client.product.findMany(OPS_DISPLAY_READY_PRODUCT_ID_QUERY),
    client.crawlRun.count({
      where: {
        triggerType: "SCHEDULED",
        status: "SUSPECTED_BLOCK",
        startedAt: {
          gte: recentSince,
        },
      },
    }),
    client.parseError.count({
      where: {
        errorType: {
          not: "INVALID_IMAGE_URL",
        },
        createdAt: {
          gte: recentSince,
        },
      },
    }),
    client.parseError.count({
      where: {
        errorType: "INVALID_IMAGE_URL",
        createdAt: {
          gte: recentSince,
        },
      },
    }),
    collectLinkHealth(client),
    collectRawSnapshotRetention(client, thresholds, now),
    collectDiscordBotStatus(client, thresholds, recentSince, now),
  ]);
  const missingImageCount = await countMissingImages(
    displayReadyProducts,
    productImageStorageDir,
    productImageExists,
  );
  const checks = [
    activeProductsCheck(displayReadyProductCount, thresholds),
    sourceFreshnessCheck(sourceCategories, thresholds, now),
    crawlerFreshnessCheck(latestScheduledRun, latestSuccessfulScheduledRun, thresholds, now),
    suspectedBlocksCheck(suspectedBlockCount, thresholds),
    thresholdCheck(
      "parse-errors",
      "解析錯誤",
      parseErrorCount,
      thresholds.parseErrorWarnCount,
      thresholds.parseErrorFailCount,
      `${parseErrorCount} parser issue(s) in ${thresholds.recentWindowHours}h`,
    ),
    invalidImageUrlCheck(invalidImageUrlCount, thresholds),
    thresholdCheck(
      "missing-images",
      "商品圖片快取",
      missingImageCount,
      thresholds.missingImageWarnCount,
      thresholds.missingImageFailCount,
      `${missingImageCount}/${displayReadyProducts.length} display-ready product image(s) missing`,
    ),
    linkHealthCheck(linkHealth, thresholds),
    rawSnapshotRetentionCheck(rawSnapshotRetention, thresholds),
    discordDeliveryCheck(discordBot, thresholds),
  ];

  return {
    generatedAt: now,
    overallLevel: checks.reduce(
      (level, check) => worseLevel(level, check.level),
      "ok" as OpsStatusLevel,
    ),
    checks,
    productCounts: {
      active: activeProductCount,
      displayReady: displayReadyProductCount,
      missingImages: missingImageCount,
    },
    recentSignals: {
      windowHours: thresholds.recentWindowHours,
      suspectedBlocks: suspectedBlockCount,
      parseErrors: parseErrorCount,
      invalidImageUrls: invalidImageUrlCount,
    },
    rawSnapshotRetention,
    linkHealth,
    sourceCategories,
    latestScheduledRun,
    latestSuccessfulScheduledRun,
    recentCrawlRuns,
    discordBot,
    thresholds,
    runtimeSchedule: readOpsRuntimeSchedule(options.env ?? process.env, thresholds),
  };
}

export function readOpsRuntimeSchedule(
  env: OpsStatusEnv,
  thresholds: OpsStatusThresholds = readOpsStatusThresholds(env),
): OpsStatusRuntimeSchedule {
  const crawlerIntervalSeconds = readPositiveInteger(
    env.CRAWLER_INTERVAL_SECONDS,
    DEFAULT_CRAWLER_INTERVAL_SECONDS,
  );
  const crawlerBackoffSeconds = readPositiveInteger(
    env.CRAWLER_BACKOFF_SECONDS,
    DEFAULT_CRAWLER_BACKOFF_SECONDS,
  );
  const crawlerLockRetrySeconds = readPositiveInteger(
    env.CRAWLER_LOCK_RETRY_SECONDS,
    DEFAULT_CRAWLER_LOCK_RETRY_SECONDS,
  );
  const crawlerCategoryDelayMs = readPositiveInteger(
    env.CRAWLER_CATEGORY_DELAY_MS,
    DEFAULT_CRAWLER_CATEGORY_DELAY_MS,
  );
  const newProductImageMinDelayMs = readPositiveInteger(
    env.CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS,
    DEFAULT_NEW_PRODUCT_IMAGE_MIN_DELAY_MS,
  );
  const newProductImageMaxDelayMs = readPositiveInteger(
    env.CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
    DEFAULT_NEW_PRODUCT_IMAGE_MAX_DELAY_MS,
  );
  const newProductImageTimeoutMs = readPositiveInteger(
    env.CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
    DEFAULT_NEW_PRODUCT_IMAGE_TIMEOUT_MS,
  );
  const newProductImageMaxSourceBytes = readPositiveInteger(
    env.CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
    DEFAULT_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES,
  );
  const maintenanceIntervalSeconds = readPositiveInteger(
    env.MAINTENANCE_INTERVAL_SECONDS,
    DEFAULT_MAINTENANCE_INTERVAL_SECONDS,
  );
  const maintenanceInitialDelaySeconds = readNonNegativeInteger(
    env.MAINTENANCE_INITIAL_DELAY_SECONDS,
    DEFAULT_MAINTENANCE_INITIAL_DELAY_SECONDS,
  );
  const maintenancePricePriorityPauseSeconds = readPositiveInteger(
    env.MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS,
    DEFAULT_MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS,
  );
  const maintenanceLinkLimit = readPositiveInteger(
    env.MAINTENANCE_LINK_LIMIT,
    DEFAULT_MAINTENANCE_LINK_LIMIT,
  );
  const maintenanceLinkStaleAfterHours = readPositiveInteger(
    env.MAINTENANCE_LINK_STALE_AFTER_HOURS,
    DEFAULT_MAINTENANCE_LINK_STALE_AFTER_HOURS,
  );
  const maintenanceLinkMinDelayMs = readPositiveInteger(
    env.MAINTENANCE_LINK_MIN_DELAY_MS,
    DEFAULT_MAINTENANCE_LINK_MIN_DELAY_MS,
  );
  const maintenanceLinkMaxDelayMs = readPositiveInteger(
    env.MAINTENANCE_LINK_MAX_DELAY_MS,
    DEFAULT_MAINTENANCE_LINK_MAX_DELAY_MS,
  );
  const rawSnapshotCleanupIntervalSeconds = readPositiveInteger(
    env.RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS,
    DEFAULT_RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS,
  );
  const smokeIntervalSeconds = readPositiveInteger(
    env.SMOKE_INTERVAL_SECONDS,
    DEFAULT_SMOKE_INTERVAL_SECONDS,
  );
  const smokeInitialDelaySeconds = readNonNegativeInteger(
    env.SMOKE_INITIAL_DELAY_SECONDS,
    DEFAULT_SMOKE_INITIAL_DELAY_SECONDS,
  );
  const discordPriceReportScheduleIntervalSeconds = readPositiveInteger(
    env.DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
    DEFAULT_DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS,
  );
  const externalFetchLockStaleSeconds = readPositiveInteger(
    env.EXTERNAL_FETCH_LOCK_STALE_SECONDS,
    DEFAULT_EXTERNAL_FETCH_LOCK_STALE_SECONDS,
  );
  const externalFetchPriorityTtlSeconds = readPositiveInteger(
    env.EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
    DEFAULT_EXTERNAL_FETCH_PRIORITY_TTL_SECONDS,
  );

  return {
    jobs: [
      {
        key: "price-crawler",
        label: "價格 crawler",
        cadence: `每 ${formatDuration(crawlerIntervalSeconds)} 執行；疑似攔截 backoff ${formatDuration(crawlerBackoffSeconds)}`,
        details: [
          `分類請求間隔 ${formatDurationMs(crawlerCategoryDelayMs)}`,
          `遇到外部抓取鎖時送 priority signal，${formatDuration(crawlerLockRetrySeconds)} 後重試`,
          `成功 crawl 後才處理本輪新增商品圖片`,
        ],
      },
      {
        key: "new-product-images",
        label: "新增商品圖片補圖",
        cadence: "每輪價格 crawl 完成後，只針對本輪新增商品",
        details: [
          `來源請求間隔 ${formatDurationMs(newProductImageMinDelayMs)}-${formatDurationMs(newProductImageMaxDelayMs)}`,
          `單張 timeout ${formatDurationMs(newProductImageTimeoutMs)}，來源上限 ${formatBytes(newProductImageMaxSourceBytes)}`,
          "不做既有商品全量缺圖重掃；既有缺圖修復使用手動 backfill",
        ],
      },
      {
        key: "link-health",
        label: "Link health maintenance",
        cadence: `每 ${formatDuration(maintenanceIntervalSeconds)} 執行；啟動延遲 ${formatDuration(maintenanceInitialDelaySeconds)}`,
        details: [
          `每輪最多 ${maintenanceLinkLimit} 個 due source link`,
          `連結超過 ${maintenanceLinkStaleAfterHours}h 重新檢查，請求間隔 ${formatDurationMs(maintenanceLinkMinDelayMs)}-${formatDurationMs(maintenanceLinkMaxDelayMs)}`,
          `價格 crawler priority 生效時暫停，延後 ${formatDuration(maintenancePricePriorityPauseSeconds)} 再繼續`,
        ],
      },
      {
        key: "raw-snapshot-cleanup",
        label: "Raw snapshot cleanup",
        cadence: `每 ${formatDuration(rawSnapshotCleanupIntervalSeconds)} 執行`,
        details: [
          `清理規則：正常 snapshot ${DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS}d，異常 snapshot ${DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS}d`,
          `狀態頁過期判定：正常 ${thresholds.rawSnapshotNormalRetentionDays}d / 異常 ${thresholds.rawSnapshotAbnormalRetentionDays}d，額外 ${thresholds.rawSnapshotRetentionGraceDays}d grace`,
        ],
      },
      {
        key: "production-smoke",
        label: "Production smoke",
        cadence: `每 ${formatDuration(smokeIntervalSeconds)} 檢查；啟動延遲 ${formatDuration(smokeInitialDelaySeconds)}`,
        details: [
          `目標 ${env.SMOKE_PUBLIC_BASE_URL || DEFAULT_SMOKE_PUBLIC_BASE_URL}`,
          `source warn/fail ${thresholds.sourceWarnAfterMinutes}m/${thresholds.sourceFailAfterMinutes}m；crawler warn/fail ${thresholds.crawlerWarnAfterMinutes}m/${thresholds.crawlerFailAfterMinutes}m`,
        ],
      },
      {
        key: "discord-bot",
        label: "Discord bot",
        cadence: `每 ${formatDuration(discordPriceReportScheduleIntervalSeconds)} 掃描 due 每日價格報告與目標價通知`,
        details: [
          `slash command 啟動註冊：${readBoolean(env.DISCORD_BOT_REGISTER_COMMANDS_ON_START, true) ? "啟用" : "停用"}`,
          "目前只註冊 global command，settings 透過選單、按鈕與 modal 管理每日報告",
          "settings 顯示最近每日報告 delivery 狀態，立即預覽會寫入 PRICE_REPORT_NOW delivery log",
          "/watch 使用私密管理介面新增、編輯、移除目標價追蹤",
        ],
      },
    ],
    policies: [
      {
        key: "external-fetch-lock",
        label: "外部抓取互斥",
        detail: `價格 crawler、link health 與圖片來源請求共用 external-fetch lock；stale 判定 ${formatDuration(externalFetchLockStaleSeconds)}`,
      },
      {
        key: "price-priority",
        label: "價格更新優先",
        detail: `價格 crawler 到點但鎖被占用時會發 priority signal；signal TTL ${formatDuration(externalFetchPriorityTtlSeconds)}，maintenance 會暫停並延後`,
      },
      {
        key: "image-policy",
        label: "圖片策略",
        detail: "排程不再重複全量抓圖；新商品即時低頻補圖，既有缺圖由手動 image backfill 處理",
      },
    ],
  };
}

export function readOpsStatusThresholds(env: OpsStatusEnv): OpsStatusThresholds {
  return {
    sourceWarnAfterMinutes: readPositiveInteger(
      env.SMOKE_SOURCE_WARN_AFTER_MINUTES,
      DEFAULT_SOURCE_WARN_AFTER_MINUTES,
    ),
    sourceFailAfterMinutes: readPositiveInteger(
      env.SMOKE_SOURCE_FAIL_AFTER_MINUTES,
      DEFAULT_SOURCE_FAIL_AFTER_MINUTES,
    ),
    crawlerWarnAfterMinutes: readPositiveInteger(
      env.SMOKE_CRAWLER_WARN_AFTER_MINUTES,
      DEFAULT_CRAWLER_WARN_AFTER_MINUTES,
    ),
    crawlerFailAfterMinutes: readPositiveInteger(
      env.SMOKE_CRAWLER_FAIL_AFTER_MINUTES,
      DEFAULT_CRAWLER_FAIL_AFTER_MINUTES,
    ),
    recentWindowHours: readPositiveInteger(
      env.SMOKE_RECENT_WINDOW_HOURS,
      DEFAULT_RECENT_WINDOW_HOURS,
    ),
    parseErrorWarnCount: readNonNegativeInteger(
      env.SMOKE_PARSE_ERROR_WARN_COUNT,
      DEFAULT_PARSE_ERROR_WARN_COUNT,
    ),
    parseErrorFailCount: readNonNegativeInteger(
      env.SMOKE_PARSE_ERROR_FAIL_COUNT,
      DEFAULT_PARSE_ERROR_FAIL_COUNT,
    ),
    invalidImageUrlWarnCount: readNonNegativeInteger(
      env.SMOKE_INVALID_IMAGE_URL_WARN_COUNT,
      DEFAULT_INVALID_IMAGE_URL_WARN_COUNT,
    ),
    minActiveProducts: readPositiveInteger(
      env.SMOKE_MIN_ACTIVE_PRODUCTS,
      DEFAULT_MIN_ACTIVE_PRODUCTS,
    ),
    missingImageWarnCount: readNonNegativeInteger(
      env.SMOKE_MISSING_IMAGE_WARN_COUNT,
      DEFAULT_MISSING_IMAGE_WARN_COUNT,
    ),
    missingImageFailCount: readNonNegativeInteger(
      env.SMOKE_MISSING_IMAGE_FAIL_COUNT,
      DEFAULT_MISSING_IMAGE_FAIL_COUNT,
    ),
    sourceBrokenLinkWarnCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_BROKEN_LINK_WARN_COUNT ?? env.SMOKE_BROKEN_LINK_WARN_COUNT,
      DEFAULT_BROKEN_LINK_WARN_COUNT,
    ),
    sourceBrokenLinkFailCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_BROKEN_LINK_FAIL_COUNT ?? env.SMOKE_BROKEN_LINK_FAIL_COUNT,
      DEFAULT_BROKEN_LINK_FAIL_COUNT,
    ),
    sourceTemporaryLinkWarnCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_TEMPORARY_LINK_WARN_COUNT ?? env.SMOKE_TEMPORARY_LINK_WARN_COUNT,
      DEFAULT_TEMPORARY_LINK_WARN_COUNT,
    ),
    sourceTemporaryLinkFailCount: readNonNegativeInteger(
      env.SMOKE_SOURCE_TEMPORARY_LINK_FAIL_COUNT ?? env.SMOKE_TEMPORARY_LINK_FAIL_COUNT,
      DEFAULT_TEMPORARY_LINK_FAIL_COUNT,
    ),
    rawSnapshotNormalRetentionDays: readPositiveInteger(
      env.SMOKE_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
      DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
    ),
    rawSnapshotAbnormalRetentionDays: readPositiveInteger(
      env.SMOKE_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
      DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
    ),
    rawSnapshotRetentionGraceDays: readNonNegativeInteger(
      env.SMOKE_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
      DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
    ),
    rawSnapshotWarnCount: readNonNegativeInteger(
      env.SMOKE_RAW_SNAPSHOT_WARN_COUNT,
      DEFAULT_RAW_SNAPSHOT_WARN_COUNT,
    ),
    rawSnapshotFailCount: readNonNegativeInteger(
      env.SMOKE_RAW_SNAPSHOT_FAIL_COUNT,
      DEFAULT_RAW_SNAPSHOT_FAIL_COUNT,
    ),
  };
}

async function collectLinkHealth(
  client: OpsStatusReadClient,
): Promise<OpsStatusSummary["linkHealth"]> {
  const [sourceOk, sourceBroken, sourceTemporaryError] = await Promise.all([
    countActiveProductLinks(client, "SOURCE", "OK"),
    countActiveProductLinks(client, "SOURCE", "BROKEN"),
    countActiveProductLinks(client, "SOURCE", "TEMPORARY_ERROR"),
  ]);

  return {
    source: {
      ok: sourceOk,
      broken: sourceBroken,
      temporaryError: sourceTemporaryError,
    },
  };
}

async function collectRawSnapshotRetention(
  client: OpsStatusReadClient,
  thresholds: OpsStatusThresholds,
  now: Date,
): Promise<OpsStatusSummary["rawSnapshotRetention"]> {
  const normalCutoff = new Date(
    now.getTime() -
      (thresholds.rawSnapshotNormalRetentionDays + thresholds.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const abnormalCutoff = new Date(
    now.getTime() -
      (thresholds.rawSnapshotAbnormalRetentionDays + thresholds.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const [expiredNormal, expiredAbnormal] = await Promise.all([
    client.rawSnapshot.count({
      where: {
        contentStatus: "VALID",
        createdAt: {
          lt: normalCutoff,
        },
      },
    }),
    client.rawSnapshot.count({
      where: {
        contentStatus: {
          in: ["SUSPECTED_BLOCK", "INVALID"],
        },
        createdAt: {
          lt: abnormalCutoff,
        },
      },
    }),
  ]);

  return {
    expired: expiredNormal + expiredAbnormal,
    expiredNormal,
    expiredAbnormal,
  };
}

async function collectDiscordBotStatus(
  client: OpsStatusReadClient,
  thresholds: OpsStatusThresholds,
  recentSince: Date,
  now: Date,
): Promise<OpsStatusDiscordBotSummary> {
  const [
    totalPriceReportSettings,
    enabledPriceReportSettings,
    duePriceReportSettings,
    activeTargetPriceWatches,
    notifiedTargetPriceWatches,
    claimedTargetPriceWatches,
    deliveryHealthRecords,
    latestDeliveries,
  ] = await Promise.all([
    client.discordPriceReportSetting.count({}),
    client.discordPriceReportSetting.count({
      where: {
        enabled: true,
      },
    }),
    client.discordPriceReportSetting.count({
      where: {
        enabled: true,
        nextSendAt: {
          lte: now,
        },
      },
    }),
    client.discordTargetPriceWatch.count({
      where: {
        enabled: true,
      },
    }),
    client.discordTargetPriceWatch.count({
      where: {
        enabled: true,
        lastNotifiedAt: {
          not: null,
        },
      },
    }),
    client.discordTargetPriceWatch.count({
      where: {
        enabled: true,
        notificationClaimedAt: {
          not: null,
        },
      },
    }),
    readDiscordDeliveryHealthRecords(client, recentSince),
    client.discordNotificationDelivery.findMany(OPS_RECENT_DISCORD_DELIVERY_QUERY),
  ]);
  const deliverySummaries = summarizeLatestDiscordDeliveryStatusesByKind(deliveryHealthRecords);

  return {
    priceReportSettings: {
      total: totalPriceReportSettings,
      enabled: enabledPriceReportSettings,
      dueNow: duePriceReportSettings,
    },
    targetPriceWatches: {
      active: activeTargetPriceWatches,
      notified: notifiedTargetPriceWatches,
      claimed: claimedTargetPriceWatches,
    },
    recentDeliveries: {
      windowHours: thresholds.recentWindowHours,
      priceReportNow: deliverySummaries.PRICE_REPORT_NOW,
      scheduledPriceReport: deliverySummaries.SCHEDULED_PRICE_REPORT,
      targetPrice: deliverySummaries.TARGET_PRICE,
    },
    latestDeliveries: latestDeliveries as OpsDiscordDeliveryRecord[],
  };
}

async function readDiscordDeliveryHealthRecords(
  client: OpsStatusReadClient,
  recentSince: Date,
): Promise<OpsDiscordDeliveryHealthRecord[]> {
  return client.discordNotificationDelivery.findMany({
    where: {
      createdAt: {
        gte: recentSince,
      },
    },
    select: OPS_DISCORD_DELIVERY_HEALTH_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: OPS_DISCORD_DELIVERY_HEALTH_SCAN_LIMIT,
  }) as Promise<OpsDiscordDeliveryHealthRecord[]>;
}

function summarizeLatestDiscordDeliveryStatusesByKind(
  records: OpsDiscordDeliveryHealthRecord[],
): Record<OpsDiscordDeliveryHealthRecord["kind"], OpsStatusDiscordDeliveryKindSummary> {
  const summaries = {
    PRICE_REPORT_NOW: createEmptyDiscordDeliverySummary(),
    SCHEDULED_PRICE_REPORT: createEmptyDiscordDeliverySummary(),
    TARGET_PRICE: createEmptyDiscordDeliverySummary(),
  };
  const latestByStream = new Map<string, OpsDiscordDeliveryHealthRecord>();

  for (const record of [...records].sort(compareDiscordDeliveryHealthRecordsDesc)) {
    const key = toDiscordDeliveryStreamKey(record);

    if (!latestByStream.has(key)) {
      latestByStream.set(key, record);
    }
  }

  for (const record of latestByStream.values()) {
    const summary = summaries[record.kind];

    if (record.status === "SENT") {
      summary.sent += 1;
    } else if (record.status === "SKIPPED") {
      summary.skipped += 1;
    } else if (record.status === "FAILED") {
      summary.failed += 1;
    } else {
      summary.rateLimited += 1;
    }
  }

  return summaries;
}

function createEmptyDiscordDeliverySummary(): OpsStatusDiscordDeliveryKindSummary {
  return {
    sent: 0,
    skipped: 0,
    failed: 0,
    rateLimited: 0,
  };
}

function compareDiscordDeliveryHealthRecordsDesc(
  left: OpsDiscordDeliveryHealthRecord,
  right: OpsDiscordDeliveryHealthRecord,
): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

function toDiscordDeliveryStreamKey(record: OpsDiscordDeliveryHealthRecord): string {
  if (record.kind === "TARGET_PRICE") {
    return `${record.kind}:${record.discordUserId}:${record.targetPriceWatchId ?? record.id}`;
  }

  return `${record.kind}:${record.discordUserId}`;
}

async function countActiveProductLinks(
  client: OpsStatusReadClient,
  linkKind: ProductLinkKindValue,
  status: ProductLinkHealthStatusValue,
): Promise<number> {
  return client.productLinkHealth.count({
    where: {
      linkKind,
      status,
      product: {
        isActive: true,
      },
    },
  });
}

async function countMissingImages(
  products: OpsDisplayReadyProductRecord[],
  productImageStorageDir: string,
  imageExists: (path: string) => Promise<boolean>,
): Promise<number> {
  const checks = await Promise.all(
    products.map((product) => imageExists(join(productImageStorageDir, `${product.id}.webp`))),
  );

  return checks.filter((exists) => !exists).length;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

function activeProductsCheck(
  displayReadyProductCount: number,
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  const level =
    displayReadyProductCount < thresholds.minActiveProducts ? ("fail" as const) : ("ok" as const);

  return {
    key: "active-products",
    label: "可顯示商品",
    level,
    message: `${displayReadyProductCount} display-ready active product(s)`,
  };
}

function sourceFreshnessCheck(
  sourceCategories: OpsSourceCategoryRecord[],
  thresholds: OpsStatusThresholds,
  now: Date,
): OpsStatusCheck {
  const oldestSuccessAt = oldestDate(sourceCategories.map((category) => category.lastSuccessAt));

  if (sourceCategories.length === 0) {
    return {
      key: "source-freshness",
      label: "來源同步",
      level: "fail",
      message: "no enabled source category",
    };
  }

  if (!oldestSuccessAt) {
    return {
      key: "source-freshness",
      label: "來源同步",
      level: "fail",
      message: "lastSuccessAt is null",
    };
  }

  const missingSuccessCount = sourceCategories.filter((category) => !category.lastSuccessAt).length;
  const ageMinutes = minutesBetween(oldestSuccessAt, now);
  let level = countAgeLevel(
    ageMinutes,
    thresholds.sourceWarnAfterMinutes,
    thresholds.sourceFailAfterMinutes,
  );

  if (missingSuccessCount > 0) {
    level = worseLevel(level, "warn");
  }

  return {
    key: "source-freshness",
    label: "來源同步",
    level,
    message: `oldestSuccess=${formatAgeMinutes(ageMinutes)} missingSuccess=${missingSuccessCount}`,
  };
}

function crawlerFreshnessCheck(
  latestScheduledRun: OpsLatestScheduledRunRecord | null,
  latestSuccessfulScheduledRun: OpsLatestSuccessfulScheduledRunRecord | null,
  thresholds: OpsStatusThresholds,
  now: Date,
): OpsStatusCheck {
  if (!latestSuccessfulScheduledRun?.finishedAt) {
    return {
      key: "crawler-freshness",
      label: "爬蟲排程",
      level: "fail",
      message: "no successful scheduled crawl run found",
    };
  }

  const ageMinutes = minutesBetween(latestSuccessfulScheduledRun.finishedAt, now);
  const level =
    latestScheduledRun?.status === "SUSPECTED_BLOCK"
      ? "fail"
      : countAgeLevel(
          ageMinutes,
          thresholds.crawlerWarnAfterMinutes,
          thresholds.crawlerFailAfterMinutes,
        );

  return {
    key: "crawler-freshness",
    label: "爬蟲排程",
    level,
    message: `latestSuccess=${formatAgeMinutes(ageMinutes)} latestStatus=${latestScheduledRun?.status ?? "none"}`,
  };
}

function suspectedBlocksCheck(count: number, thresholds: OpsStatusThresholds): OpsStatusCheck {
  return {
    key: "suspected-blocks",
    label: "疑似攔截",
    level: count > 0 ? "warn" : "ok",
    message: `${count} suspected block run(s) in ${thresholds.recentWindowHours}h`,
  };
}

function invalidImageUrlCheck(count: number, thresholds: OpsStatusThresholds): OpsStatusCheck {
  return {
    key: "invalid-image-urls",
    label: "來源圖片異常",
    level: count > thresholds.invalidImageUrlWarnCount ? "warn" : "ok",
    message: `${count} invalid image URL issue(s) in ${thresholds.recentWindowHours}h`,
  };
}

function linkHealthCheck(
  linkHealth: OpsStatusSummary["linkHealth"],
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  const level = [
    countLevel(
      linkHealth.source.broken,
      thresholds.sourceBrokenLinkWarnCount,
      thresholds.sourceBrokenLinkFailCount,
    ),
    countLevel(
      linkHealth.source.temporaryError,
      thresholds.sourceTemporaryLinkWarnCount,
      thresholds.sourceTemporaryLinkFailCount,
    ),
  ].reduce<OpsStatusLevel>((status, nextStatus) => worseLevel(status, nextStatus), "ok");

  return {
    key: "link-health",
    label: "商品連結健康",
    level,
    message: `source broken=${linkHealth.source.broken} temporary=${linkHealth.source.temporaryError}`,
  };
}

function rawSnapshotRetentionCheck(
  retention: OpsStatusSummary["rawSnapshotRetention"],
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  return thresholdCheck(
    "raw-snapshot-retention",
    "Raw snapshot 保留",
    retention.expired,
    thresholds.rawSnapshotWarnCount,
    thresholds.rawSnapshotFailCount,
    `expired=${retention.expired} normal=${retention.expiredNormal} abnormal=${retention.expiredAbnormal}`,
  );
}

function discordDeliveryCheck(
  discordBot: OpsStatusDiscordBotSummary,
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  const recent = discordBot.recentDeliveries;
  const failed =
    recent.priceReportNow.failed + recent.scheduledPriceReport.failed + recent.targetPrice.failed;
  const rateLimited =
    recent.priceReportNow.rateLimited +
    recent.scheduledPriceReport.rateLimited +
    recent.targetPrice.rateLimited;

  return {
    key: "discord-bot-delivery",
    label: "Discord Bot 發送",
    level: failed + rateLimited > 0 ? "warn" : "ok",
    message: `failed=${failed} rateLimited=${rateLimited} in ${thresholds.recentWindowHours}h`,
  };
}

function thresholdCheck(
  key: string,
  label: string,
  count: number,
  warnCount: number,
  failCount: number,
  message: string,
): OpsStatusCheck {
  return {
    key,
    label,
    level: countLevel(count, warnCount, failCount),
    message,
  };
}

function countLevel(count: number, warnCount: number, failCount: number): OpsStatusLevel {
  if (failCount > 0 && count >= failCount) {
    return "fail";
  }

  if (warnCount > 0 && count >= warnCount) {
    return "warn";
  }

  return "ok";
}

function countAgeLevel(
  ageMinutes: number,
  warnMinutes: number,
  failMinutes: number,
): OpsStatusLevel {
  if (ageMinutes >= failMinutes) {
    return "fail";
  }

  if (ageMinutes >= warnMinutes) {
    return "warn";
  }

  return "ok";
}

function worseLevel(left: OpsStatusLevel, right: OpsStatusLevel): OpsStatusLevel {
  if (left === "fail" || right === "fail") {
    return "fail";
  }

  if (left === "warn" || right === "warn") {
    return "warn";
  }

  return "ok";
}

function oldestDate(values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value !== null);

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function minutesBetween(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MILLISECONDS_PER_MINUTE));
}

function formatAgeMinutes(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;

  return `${hours}h${minutes.toString().padStart(2, "0")}m`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (seconds < 60 * 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  }

  if (seconds < 24 * 60 * 60) {
    const hours = Math.floor(seconds / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);

    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));

  return hours > 0 ? `${days}d${hours}h` : `${days}d`;
}

function formatDurationMs(milliseconds: number): string {
  return milliseconds % 1000 === 0 ? formatDuration(milliseconds / 1000) : `${milliseconds}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)}MiB`;
  }

  if (bytes >= 1024 && bytes % 1024 === 0) {
    return `${bytes / 1024}KiB`;
  }

  return `${bytes}B`;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = readInteger(value);

  return parsed && parsed > 0 ? parsed : fallback;
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = readInteger(value);

  return parsed !== null && parsed >= 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function readInteger(value: string | undefined): number | null {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) ? parsed : null;
}
