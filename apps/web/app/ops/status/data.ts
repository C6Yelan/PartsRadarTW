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
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

const SUCCESSFUL_SCHEDULED_STATUSES: CrawlRunStatus[] = [
  "SUCCESS_CHANGED",
  "SUCCESS_UNCHANGED",
];
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
  thresholds: OpsStatusThresholds;
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
    thresholds,
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

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = readInteger(value);

  return parsed && parsed > 0 ? parsed : fallback;
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = readInteger(value);

  return parsed !== null && parsed >= 0 ? parsed : fallback;
}

function readInteger(value: string | undefined): number | null {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) ? parsed : null;
}
