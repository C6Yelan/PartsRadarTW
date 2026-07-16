// apps/crawler/src/scripts/ops/crawl-coolpc-daemon.ts
// 啟動 scheduled CoolPC crawler daemon，負責週期性抓取分類並寫入商品與價格資料。

import type { PrismaClient } from "@partsradar/db";
import { CRAWL_TRIGGER_TYPES, type RunCoolpcCrawlOnceResult } from "../../coolpc/crawl-run";
import { refreshCoolpcFilterSync } from "../../coolpc/filter-sync";
import { assertSeededCategories, runCoolpcCategoryCrawl } from "../../coolpc/live-crawl";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { printHelp } from "./crawl-coolpc-daemon/help";
import { type CoolpcDaemonOptions, parseDaemonOptions } from "./crawl-coolpc-daemon/options";
import {
  type ProductWriteSummaryTotals,
  printCycleSummary,
  resolveAllFetchFailedRetrySeconds,
  shouldBackoffAfter,
  summarizeProductWrites,
} from "./crawl-coolpc-daemon/summary";
import { tryAcquireExternalFetchLock } from "./external-fetch-lock";
import { createOpsLogger } from "./shared/logger";
import { createInterruptibleShutdownController } from "./shared/shutdown";

const SCHEDULED_CRAWL_USER_AGENT =
  "PartsRadarTW scheduled crawler (+https://github.com/C6Yelan/PartsRadarTW)";
const logger = createOpsLogger();

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
  const shutdown = createInterruptibleShutdownController({
    onSignal: (signal) => {
      log(`Received ${signal}; stopping after the current crawler step.`);
    },
  });

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    await assertSeededCategories(client);
    log(
      `CoolPC scheduled crawler started. interval=${options.intervalSeconds}s backoff=${options.backoffSeconds}s categoryDelay=${options.categoryDelayMs}ms filterSyncInterval=${options.filterSyncIntervalSeconds}s runOnce=${options.runOnce ? "yes" : "no"}`,
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

// 執行單輪 scheduled crawl；以 external fetch lock 保護篩選條件同步與分類抓取。
export async function runScheduledCycle(
  client: PrismaClient,
  options: CoolpcDaemonOptions,
  dependencies: {
    acquireLock?: typeof tryAcquireExternalFetchLock;
    crawlCategories?: typeof runCoolpcCategoryCrawl;
    refreshFilterSync?: typeof refreshCoolpcFilterSync;
  } = {},
): Promise<ScheduledCycleResult> {
  const acquireLock = dependencies.acquireLock ?? tryAcquireExternalFetchLock;
  const crawlCategories = dependencies.crawlCategories ?? runCoolpcCategoryCrawl;
  const refreshFilterSync = dependencies.refreshFilterSync ?? refreshCoolpcFilterSync;
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
  let sourceFilterTagsByIgrp = {};

  try {
    try {
      const filterSync = await refreshFilterSync({
        stateFilePath: options.filterSyncStateFilePath,
        intervalSeconds: options.filterSyncIntervalSeconds,
        timeoutMs: 30_000,
        userAgent: SCHEDULED_CRAWL_USER_AGENT,
      });
      sourceFilterTagsByIgrp = filterSync.state?.tagsByIgrp ?? {};
      if (filterSync.outcome === "published") {
        log(
          `CoolPC filter sync published. conditions=${filterSync.state?.conditionCount ?? 0} products=${filterSync.state?.productCount ?? 0} tagged=${filterSync.state?.taggedProductCount ?? 0} ambiguous=${filterSync.state?.ambiguousProductCount ?? 0}`,
        );
      } else if (filterSync.outcome === "failed") {
        log(
          `CoolPC filter sync failed; using last known good state. error=${toSafeCliErrorMessage(filterSync.state?.lastError ?? "unknown")}`,
        );
      }
    } catch (error) {
      log(
        `CoolPC filter sync failed before state was available; continuing with built-in rules. error=${toSafeCliErrorMessage(error)}`,
      );
    }

    result = await crawlCategories({
      client,
      workspaceRoot: options.workspaceRoot,
      storageDir: options.storageDir,
      triggerType: CRAWL_TRIGGER_TYPES.SCHEDULED,
      delayMs: options.categoryDelayMs,
      fetchUserAgent: SCHEDULED_CRAWL_USER_AGENT,
      log,
      sourceFilterTagsByIgrp,
    });

    productWriteSummary = summarizeProductWrites(result);
    shouldBackoff = shouldBackoffAfter(result);
    printCycleSummary(result, productWriteSummary, log);
  } catch (error) {
    log(`CoolPC scheduled crawl cycle failed: ${toSafeCliErrorMessage(error)}`);

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

  return retryAfterSeconds === undefined
    ? {
        shouldBackoff,
      }
    : {
        shouldBackoff,
        retryAfterSeconds,
      };
}

// 透過 ops logger 輸出 scheduled crawler 訊息，讓格式與其他 daemon 一致。
function log(message: string): void {
  logger.info(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
