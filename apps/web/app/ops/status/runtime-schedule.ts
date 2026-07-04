// apps/web/app/ops/status/runtime-schedule.ts
import {
  DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
  DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
  readNonNegativeInteger,
  readOpsStatusThresholds,
  readPositiveInteger,
} from "./thresholds";
import type { OpsStatusEnv, OpsStatusRuntimeSchedule, OpsStatusThresholds } from "./types";

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
