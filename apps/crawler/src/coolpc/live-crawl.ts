// apps/crawler/src/coolpc/live-crawl.ts
// Live crawl 進入點：驗證基礎設定、逐分類抓取頁面（可重播 raw），並將結果交由 crawl-run 與 snapshot 寫入流程。
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import { COOLPC_OFFICIAL_BASE_URL, isOfficialCoolpcBaseUrl } from "@partsradar/shared";
import {
  processCoolpcCategorySnapshotWithPrisma,
  type CoolpcCategorySnapshotInput,
} from "./category-snapshot";
import {
  CRAWL_TRIGGER_TYPES,
  runCoolpcCrawlOnceWithPrisma,
  type CrawlTriggerTypeValue,
  type RunCoolpcCrawlOnceResult,
} from "./crawl-run";
import { fetchLiveCategorySnapshot } from "./live-crawl/fetch";
import { createCoolpcCategoryUrl } from "./parser";

export const DEFAULT_COOLPC_BASE_URL = COOLPC_OFFICIAL_BASE_URL;
export const DEFAULT_COOLPC_CATEGORY_DELAY_MS = 8000;
export const DEFAULT_COOLPC_FETCH_TIMEOUT_MS = 30000;
const MIN_COOLPC_CATEGORY_DELAY_MS = 1000;
const MAX_COOLPC_CATEGORY_DELAY_MS = 60000;
const MIN_COOLPC_FETCH_TIMEOUT_MS = 5000;
const MAX_COOLPC_FETCH_TIMEOUT_MS = 60000;

export interface RunCoolpcCategoryCrawlOptions {
  client: PrismaClient;
  storageDir: string;
  triggerType?: CrawlTriggerTypeValue;
  fromRawDir?: string | null;
  delayMs?: number;
  fetchTimeoutMs?: number;
  baseUrl?: string;
  allowUnsafeBaseUrlForTesting?: boolean;
  fetchUserAgent: string;
  log?: (message: string) => void;
}

interface ValidateCoolpcBaseUrlOptions {
  allowUnsafeBaseUrlForTesting?: boolean;
  nodeEnv?: string;
}

interface ValidateRawReplayOptions {
  fromRawDir: string | null;
  triggerType: CrawlTriggerTypeValue;
  nodeEnv?: string;
}

interface CrawlTimingOptions {
  delayMs: number;
  fetchTimeoutMs: number;
}

export {
  fetchLiveCategorySnapshot,
  formatCoolpcFetchError,
  MAX_COOLPC_RESPONSE_BODY_BYTES,
  readResponseBodyWithLimit,
} from "./live-crawl/fetch";

/**
 * 執行單次 CoolPC 類別抓取流程：先驗證參數與環境，再逐分類抓取並交給 crawl-run 進行後續分類處理與狀態彙總。
 */
export async function runCoolpcCategoryCrawl({
  client,
  storageDir,
  triggerType = CRAWL_TRIGGER_TYPES.MANUAL,
  fromRawDir = null,
  delayMs = DEFAULT_COOLPC_CATEGORY_DELAY_MS,
  fetchTimeoutMs = DEFAULT_COOLPC_FETCH_TIMEOUT_MS,
  baseUrl,
  allowUnsafeBaseUrlForTesting = false,
  fetchUserAgent,
  log,
}: RunCoolpcCategoryCrawlOptions): Promise<RunCoolpcCrawlOnceResult> {
  let processedCategoryCount = 0;
  const timingOptions = validateCrawlTimingOptions({ delayMs, fetchTimeoutMs });
  const resolvedBaseUrl = validateCoolpcBaseUrl(baseUrl, {
    allowUnsafeBaseUrlForTesting,
  });

  validateRawReplayOptions({
    fromRawDir,
    triggerType,
  });

  return runCoolpcCrawlOnceWithPrisma({
    client,
    triggerType,
    processCategory: async ({ crawlRunId, category }) => {
      if (!fromRawDir && processedCategoryCount > 0) {
        await delay(timingOptions.delayMs);
      }

      processedCategoryCount += 1;

      const fetchedAt = new Date();
      const url = createCoolpcCategoryUrl(category.igrp, resolvedBaseUrl);
      const snapshot = fromRawDir
        ? await readRawCategorySnapshot(fromRawDir, category.igrp, fetchedAt, url, log)
        : await fetchLiveCategorySnapshot(
            category.igrp,
            fetchedAt,
            url,
            fetchUserAgent,
            timingOptions.fetchTimeoutMs,
            log,
          );

      return processCoolpcCategorySnapshotWithPrisma({
        client,
        storageDir,
        crawlRunId,
        category,
        snapshot,
      });
    },
  });
}

export async function assertSeededCategories(
  client: Pick<PrismaClient, "sourceCategory">,
): Promise<void> {
  const enabledCategoryCount = await client.sourceCategory.count({
    where: { enabled: true },
  });

  if (enabledCategoryCount === 0) {
    throw new Error("No enabled source categories found. Run `pnpm db:seed` before crawling.");
  }
}

/**
 * 驗證 CoolPC base URL：正式環境只允許官方 base，測試環境可選擇允許安全的非官方替代來源。
 */
export function validateCoolpcBaseUrl(
  baseUrl = DEFAULT_COOLPC_BASE_URL,
  options: ValidateCoolpcBaseUrlOptions = {},
): string {
  let url: URL;
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("CoolPC base URL must be a valid URL.");
  }

  if (isOfficialCoolpcBaseUrl(url)) {
    return DEFAULT_COOLPC_BASE_URL;
  }

  if (options.allowUnsafeBaseUrlForTesting && nodeEnv !== "production") {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Test-only CoolPC base URL override must use HTTP or HTTPS.");
    }

    return url.origin;
  }

  throw new Error(`CoolPC base URL must be ${COOLPC_OFFICIAL_BASE_URL}.`);
}

export function validateRawReplayOptions({
  fromRawDir,
  triggerType,
  nodeEnv = process.env.NODE_ENV,
}: ValidateRawReplayOptions): void {
  if (!fromRawDir) {
    return;
  }

  if (triggerType === CRAWL_TRIGGER_TYPES.SCHEDULED) {
    throw new Error("Scheduled CoolPC crawler cannot use raw HTML replay.");
  }

  if (nodeEnv === "production") {
    throw new Error("Raw HTML replay is disabled in production crawler runtime.");
  }
}

/**
 * 驗證 delay / timeout 範圍：避免超出系統設計邊界造成過快封鎖或抓取超時失控。
 */
export function validateCrawlTimingOptions({
  delayMs,
  fetchTimeoutMs,
}: CrawlTimingOptions): CrawlTimingOptions {
  return {
    delayMs: validateIntegerRange(
      "delayMs",
      delayMs,
      MIN_COOLPC_CATEGORY_DELAY_MS,
      MAX_COOLPC_CATEGORY_DELAY_MS,
    ),
    fetchTimeoutMs: validateIntegerRange(
      "fetchTimeoutMs",
      fetchTimeoutMs,
      MIN_COOLPC_FETCH_TIMEOUT_MS,
      MAX_COOLPC_FETCH_TIMEOUT_MS,
    ),
  };
}

async function readRawCategorySnapshot(
  rawDir: string,
  igrp: number,
  fetchedAt: Date,
  url: string,
  log: ((message: string) => void) | undefined,
): Promise<CoolpcCategorySnapshotInput> {
  const rawPath = join(rawDir, `igrp-${igrp}.html`);
  log?.(`Reading IGrp=${igrp} from ${rawPath}`);

  return {
    url,
    fetchedAt,
    httpStatus: 200,
    rawHtml: await readFile(rawPath, "utf8"),
  };
}

/**
 * 以 Promise 包裝 setTimeout，作為分類間人工節流的阻塞點，避免短時間大量請求壓力。
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 檢查輸入是否為整數並在 min/max 內，提供 fail-fast 的設定驗證。
 */
function validateIntegerRange(label: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return value;
}
