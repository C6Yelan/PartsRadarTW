// apps/crawler/src/scripts/ops/crawl-coolpc-daemon.ts
// 啟動 scheduled CoolPC crawler daemon，負責週期性抓取分類、寫入商品資料並補齊新增商品圖片。

import type { PrismaClient } from "@partsradar/db";
import { CRAWL_TRIGGER_TYPES, type RunCoolpcCrawlOnceResult } from "../../coolpc/crawl-run";
import { assertSeededCategories, runCoolpcCategoryCrawl } from "../../coolpc/live-crawl";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { printHelp } from "./crawl-coolpc-daemon/help";
import {
  handleNewProductImageBackfill,
  type NewProductImageBackfillHandler,
} from "./crawl-coolpc-daemon/new-product-images";
import { parseDaemonOptions, type CoolpcDaemonOptions } from "./crawl-coolpc-daemon/options";
import {
  printCycleSummary,
  resolveAllFetchFailedRetrySeconds,
  shouldBackoffAfter,
  summarizeProductWrites,
  type ProductWriteSummaryTotals,
} from "./crawl-coolpc-daemon/summary";
import { tryAcquireExternalFetchLock } from "./external-fetch-lock";
import { createOpsLogger } from "./shared/logger";

const SCHEDULED_CRAWL_USER_AGENT =
  "PartsRadarTW scheduled crawler (+https://github.com/C6Yelan/PartsRadarTW)";
const logger = createOpsLogger();

export { parseDaemonOptions } from "./crawl-coolpc-daemon/options";
export type {
  CoolpcDaemonOptions,
  NewProductImageBackfillOptions,
} from "./crawl-coolpc-daemon/options";

interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

// 單輪 scheduled crawl 結果，回傳下一輪是否進入 backoff 或使用較短 retry。
interface ScheduledCycleResult {
  shouldBackoff: boolean;
  retryAfterSeconds?: number;
}

// CLI 入口：載入 env、建立 Prisma client，並用 graceful shutdown 控制 daemon loop。
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseDaemonOptions(args);
  let client: PrismaClient | null = null;
  const shutdown = createShutdownController();

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    await assertSeededCategories(client);
    log(
      `CoolPC scheduled crawler started. interval=${options.intervalSeconds}s backoff=${options.backoffSeconds}s categoryDelay=${options.categoryDelayMs}ms newProductImageDelay=${options.newProductImageBackfill.minDelayMs}-${options.newProductImageBackfill.maxDelayMs}ms runOnce=${options.runOnce ? "yes" : "no"}`,
    );

    do {
      const result = await runScheduledCycle(client, options);

      if (options.runOnce || shutdown.requested) {
        break;
      }

      const waitSeconds =
        result.retryAfterSeconds ??
        (result.shouldBackoff ? options.backoffSeconds : options.intervalSeconds);
      const nextRunAt = new Date(Date.now() + waitSeconds * 1000).toISOString();
      log(
        `Next CoolPC scheduled crawl at ${nextRunAt} (${waitSeconds}s, ${result.shouldBackoff ? "backoff" : "normal interval"}).`,
      );
      await shutdown.sleep(waitSeconds * 1000);
    } while (!shutdown.requested);
  } finally {
    await client?.$disconnect();
    log("CoolPC scheduled crawler stopped.");
  }
}

// 執行單輪 scheduled crawl；先取得外部抓取 lock，再跑分類 crawl 與新增商品圖片補圖。
export async function runScheduledCycle(
  client: PrismaClient,
  options: CoolpcDaemonOptions,
  dependencies: {
    acquireLock?: typeof tryAcquireExternalFetchLock;
    crawlCategories?: typeof runCoolpcCategoryCrawl;
    backfillNewProductImages?: NewProductImageBackfillHandler;
  } = {},
): Promise<ScheduledCycleResult> {
  const acquireLock = dependencies.acquireLock ?? tryAcquireExternalFetchLock;
  const crawlCategories = dependencies.crawlCategories ?? runCoolpcCategoryCrawl;
  const backfillNewProductImages =
    dependencies.backfillNewProductImages ?? handleNewProductImageBackfill;
  const lock = await acquireLock({
    lockDir: options.lockDir,
    owner: "crawler-daemon",
    staleSeconds: options.lockStaleSeconds,
  });

  if (!lock) {
    log(
      `Skipping CoolPC scheduled crawl because another crawler process holds the external fetch lock. Retrying in ${options.lockRetrySeconds}s.`,
    );

    return {
      shouldBackoff: false,
      retryAfterSeconds: options.lockRetrySeconds,
    };
  }

  log("Starting CoolPC scheduled crawl cycle.");

  let result: RunCoolpcCrawlOnceResult;
  let productWriteSummary: ProductWriteSummaryTotals;
  let shouldBackoff: boolean;

  try {
    result = await crawlCategories({
      client,
      storageDir: options.storageDir,
      triggerType: CRAWL_TRIGGER_TYPES.SCHEDULED,
      delayMs: options.categoryDelayMs,
      baseUrl: options.baseUrl,
      fetchUserAgent: SCHEDULED_CRAWL_USER_AGENT,
      log,
    });

    productWriteSummary = summarizeProductWrites(result);
    shouldBackoff = shouldBackoffAfter(result);
    printCycleSummary(result, productWriteSummary, log);
  } catch (error) {
    log(`CoolPC scheduled crawl cycle failed: ${toSafeErrorMessage(error)}`);

    return {
      shouldBackoff: true,
    };
  } finally {
    await lock.release();
  }

  const retryAfterSeconds = resolveAllFetchFailedRetrySeconds(result, options);

  if (retryAfterSeconds !== undefined) {
    log(
      `All CoolPC categories failed during fetch. Retrying in ${retryAfterSeconds}s before using the regular ${options.backoffSeconds}s backoff.`,
    );
  }

  if (shouldBackoff) {
    if (productWriteSummary.createdProductIds.length > 0) {
      log(
        `New product image backfill skipped. reason=crawl_not_clean status=${result.status} stoppedBySuspectedBlock=${result.stoppedBySuspectedBlock ? "yes" : "no"} createdProducts=${productWriteSummary.createdProductIds.length}`,
      );
    }
  } else {
    await backfillNewProductImages({
      client,
      productIds: productWriteSummary.createdProductIds,
      options: options.newProductImageBackfill,
    });
  }

  return retryAfterSeconds === undefined
    ? {
        shouldBackoff,
      }
    : {
        shouldBackoff,
        retryAfterSeconds,
      };
}

// 註冊 SIGINT/SIGTERM，讓 crawler 在目前步驟結束後停止，並可喚醒等待中的下一輪 sleep。
function createShutdownController(): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      log(`Received ${signal}; stopping after the current crawler step.`);
    }

    stopRequested = true;
    wakeSleeper?.();
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  return {
    get requested() {
      return stopRequested;
    },
    sleep(ms: number) {
      if (stopRequested) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeout);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}

// 統一套用 CLI 錯誤遮蔽，避免 daemon log 直接輸出敏感 env 或連線字串。
function toSafeErrorMessage(error: unknown): string {
  return toSafeCliErrorMessage(error);
}

// 透過 ops logger 輸出 scheduled crawler 訊息，讓格式與其他 daemon 一致。
function log(message: string): void {
  logger.info(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeErrorMessage(error));
    process.exitCode = 1;
  });
}
