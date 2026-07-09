// apps/web/app/ops/status/data.ts
// 彙整內部 /ops/status 頁面需要的 DB 狀態、檔案快取狀態、門檻與排程摘要。

import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  buildOpsStatusChecks,
  getOverallOpsStatusLevel,
  type OpsStatusCheck,
} from "./checks";
import {
  OPS_DISPLAY_READY_PRODUCT_ID_QUERY,
  OPS_DISPLAY_READY_PRODUCT_WHERE,
  OPS_RECENT_CRAWL_RUN_QUERY,
  OPS_SOURCE_CATEGORY_QUERY,
  type OpsDisplayReadyProductRecord,
  type OpsLatestScheduledRunRecord,
  type OpsLatestSuccessfulScheduledRunRecord,
  type OpsRecentCrawlRunRecord,
  type OpsSourceCategoryRecord,
} from "./queries";
import { readOpsRuntimeSchedule } from "./runtime-schedule";
import { readOpsStatusThresholds } from "./thresholds";
import {
  collectLinkHealth,
  type OpsStatusLinkHealthSummary,
} from "./data/link-health";
import {
  collectRawSnapshotRetention,
  type OpsStatusRawSnapshotRetentionSummary,
} from "./data/raw-snapshot-retention";
import {
  collectDiscordBotStatus,
  type OpsStatusDiscordBotSummary,
} from "./data/discord-health";
import type {
  OpsStatusEnv,
  OpsStatusLevel,
  OpsStatusRuntimeSchedule,
  OpsStatusThresholds,
} from "./types";
import type { OpsStatusReadClient } from "./client";

const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "storage/product-images";
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

// /ops/status 的 public module boundary，供頁面與測試使用資料收集、查詢契約與型別。
export { readOpsRuntimeSchedule } from "./runtime-schedule";
export { readOpsStatusThresholds } from "./thresholds";
export { createPrismaOpsStatusClient } from "./client";
export { buildOpsStatusChecks, getOverallOpsStatusLevel } from "./checks";
export type {
  OpsStatusLinkHealthSummary,
  OpsStatusLinkKindSummary,
} from "./data/link-health";
export type { OpsStatusRawSnapshotRetentionSummary } from "./data/raw-snapshot-retention";
export type {
  OpsStatusDiscordBotSummary,
  OpsStatusDiscordDeliveryKindSummary,
} from "./data/discord-health";
export {
  OPS_DISPLAY_READY_PRODUCT_ID_QUERY,
  OPS_DISPLAY_READY_PRODUCT_WHERE,
  OPS_LATEST_SCHEDULED_RUN_QUERY,
  OPS_LATEST_SUCCESSFUL_SCHEDULED_RUN_QUERY,
  OPS_RECENT_CRAWL_RUN_QUERY,
  OPS_RECENT_DISCORD_DELIVERY_QUERY,
  OPS_SOURCE_CATEGORY_QUERY,
} from "./queries";
export type {
  OpsStatusEnv,
  OpsStatusLevel,
  OpsStatusRuntimePolicy,
  OpsStatusRuntimeSchedule,
  OpsStatusScheduleJob,
  OpsStatusThresholds,
} from "./types";
export type { OpsStatusReadClient } from "./client";
export type { OpsStatusCheck } from "./checks";

// /ops/status 頁面一次渲染所需的完整狀態摘要。
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
  rawSnapshotRetention: OpsStatusRawSnapshotRetentionSummary;
  linkHealth: OpsStatusLinkHealthSummary;
  sourceCategories: OpsSourceCategoryRecord[];
  latestScheduledRun: OpsLatestScheduledRunRecord | null;
  latestSuccessfulScheduledRun: OpsLatestSuccessfulScheduledRunRecord | null;
  recentCrawlRuns: OpsRecentCrawlRunRecord[];
  discordBot: OpsStatusDiscordBotSummary;
  thresholds: OpsStatusThresholds;
  runtimeSchedule: OpsStatusRuntimeSchedule;
}

// 收集 ops status 時可注入的時間、env、門檻與檔案存在性檢查，主要供測試使用。
export interface CollectOpsStatusOptions {
  now?: () => Date;
  env?: OpsStatusEnv;
  thresholds?: OpsStatusThresholds;
  productImageStorageDir?: string;
  productImageExists?: (path: string) => Promise<boolean>;
}

// 從 DB 與本機圖片快取收集內部維運狀態，並組裝頁面摘要。
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
  const checks = buildOpsStatusChecks({
    displayReadyProductCount,
    displayReadyProductTotal: displayReadyProducts.length,
    missingImageCount,
    sourceCategories,
    latestScheduledRun,
    latestSuccessfulScheduledRun,
    suspectedBlockCount,
    parseErrorCount,
    invalidImageUrlCount,
    linkHealth,
    rawSnapshotRetention,
    discordBot,
    thresholds,
    now,
  });

  return {
    generatedAt: now,
    overallLevel: getOverallOpsStatusLevel(checks),
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
