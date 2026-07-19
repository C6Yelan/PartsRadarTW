// apps/crawler/src/coolpc/live-crawl.ts
// Live crawl 進入點：驗證基礎設定、逐分類抓取官方來源頁面，並將結果交由 crawl-run 與 snapshot 寫入流程。
import type { PrismaClient } from "@partsradar/db";
import { COOLPC_OFFICIAL_BASE_URL, createCoolpcCategoryUrl } from "@partsradar/shared";
import { processCoolpcCategorySnapshot } from "./category-snapshot";
import {
  CRAWL_TRIGGER_TYPES,
  type CrawlTriggerTypeValue,
  type RunCoolpcCrawlOnceResult,
  reconcileInterruptedCrawlRuns,
  runCoolpcCrawlOnce,
} from "./crawl-run";
import { fetchLiveCategorySnapshot } from "./live-crawl/fetch";
import {
  type RawSnapshotMutationLockHandle,
  RawSnapshotStorageBusyError,
  resolveAllowlistedRawSnapshotStorage,
  tryAcquireRawSnapshotMutationLock,
} from "./raw-snapshot-storage";

export const DEFAULT_COOLPC_CATEGORY_DELAY_MS = 8000;
const DEFAULT_COOLPC_FETCH_TIMEOUT_MS = 30000;
const MIN_COOLPC_CATEGORY_DELAY_MS = 1000;
const MAX_COOLPC_CATEGORY_DELAY_MS = 60000;
const MIN_COOLPC_FETCH_TIMEOUT_MS = 5000;
const MAX_COOLPC_FETCH_TIMEOUT_MS = 60000;

export interface RunCoolpcCategoryCrawlOptions {
  client: PrismaClient;
  workspaceRoot: string;
  storageDir: string;
  configuredStorageDir?: string | null;
  additionalAllowedStorageRootsForTesting?: string[];
  triggerType?: CrawlTriggerTypeValue;
  delayMs?: number;
  fetchTimeoutMs?: number;
  fetchUserAgent: string;
  log?: (message: string) => void;
  sourceFilterTagsByIgrp?: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
}

interface CrawlTimingOptions {
  delayMs: number;
  fetchTimeoutMs: number;
}

interface RunCoolpcCategoryCrawlDependencies {
  acquireMutationLock?: typeof tryAcquireRawSnapshotMutationLock;
  preAcquiredMutationLock?: RawSnapshotMutationLockHandle;
  reconcileRuns?: typeof reconcileInterruptedCrawlRuns;
  runCrawl?: typeof runCoolpcCrawlOnce;
}

/**
 * 執行單次 CoolPC 類別抓取流程：先驗證參數與環境，再逐分類抓取並交給 crawl-run 進行後續分類處理與狀態彙總。
 */
export async function runCoolpcCategoryCrawl(
  {
    client,
    workspaceRoot,
    storageDir,
    configuredStorageDir = process.env.SNAPSHOT_STORAGE_DIR,
    additionalAllowedStorageRootsForTesting = [],
    triggerType = CRAWL_TRIGGER_TYPES.MANUAL,
    delayMs = DEFAULT_COOLPC_CATEGORY_DELAY_MS,
    fetchTimeoutMs = DEFAULT_COOLPC_FETCH_TIMEOUT_MS,
    fetchUserAgent,
    log,
    sourceFilterTagsByIgrp = {},
  }: RunCoolpcCategoryCrawlOptions,
  dependencies: RunCoolpcCategoryCrawlDependencies = {},
): Promise<RunCoolpcCrawlOnceResult> {
  let processedCategoryCount = 0;
  const timingOptions = validateCrawlTimingOptions({ delayMs, fetchTimeoutMs });
  const storageLocation = resolveAllowlistedRawSnapshotStorage({
    workspaceRoot,
    requestedDir: storageDir,
    configuredDir: configuredStorageDir,
    additionalAllowedRootsForTesting: additionalAllowedStorageRootsForTesting,
  });

  const acquireMutationLock = dependencies.acquireMutationLock ?? tryAcquireRawSnapshotMutationLock;
  const preAcquiredMutationLock = dependencies.preAcquiredMutationLock;
  const reconcileRuns = dependencies.reconcileRuns ?? reconcileInterruptedCrawlRuns;
  const runCrawl = dependencies.runCrawl ?? runCoolpcCrawlOnce;
  const mutationLock =
    preAcquiredMutationLock ??
    (await acquireMutationLock({
      mutationRoot: storageLocation.mutationRoot,
      owner: triggerType === CRAWL_TRIGGER_TYPES.SCHEDULED ? "scheduled-crawler" : "manual-crawler",
    }));

  if (!mutationLock) {
    throw new RawSnapshotStorageBusyError();
  }

  try {
    const reconciledRunCount = await reconcileRuns({ client });
    if (reconciledRunCount > 0) {
      log?.(`Reconciled interrupted CoolPC crawl runs. count=${reconciledRunCount}`);
    }

    return await runCrawl({
      client,
      triggerType,
      processCategory: async ({ crawlRunId, category }) => {
        if (processedCategoryCount > 0) {
          await delay(timingOptions.delayMs);
        }

        processedCategoryCount += 1;

        const fetchedAt = new Date();
        const url = createCoolpcCategoryUrl(category.igrp, COOLPC_OFFICIAL_BASE_URL);
        const snapshot = await fetchLiveCategorySnapshot(
          category.igrp,
          fetchedAt,
          url,
          fetchUserAgent,
          timingOptions.fetchTimeoutMs,
          log,
        );

        return processCoolpcCategorySnapshot({
          client,
          storageDir: storageLocation.mutationRoot,
          storagePathPrefix: storageLocation.storagePathPrefix,
          crawlRunId,
          category,
          snapshot,
          sourceFilterTagsByProductName: sourceFilterTagsByIgrp[String(category.igrp)],
        });
      },
    });
  } finally {
    if (!preAcquiredMutationLock) {
      await mutationLock.release();
    }
  }
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
