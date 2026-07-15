// apps/crawler/src/scripts/manual/crawl-coolpc-once.ts
// 手動執行 CoolPC 單次爬蟲的 CLI 腳本。
// 用於本機驗證流程，先抓取後輸出結果摘要，不可作為排程入口使用。
import { relative } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import { CRAWL_TRIGGER_TYPES, type RunCoolpcCrawlOnceResult } from "../../coolpc/crawl-run";
import { assertSeededCategories, runCoolpcCategoryCrawl } from "../../coolpc/live-crawl";
import { tryAcquireExternalFetchLock } from "../ops/external-fetch-lock";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { type CrawlOptions, parseOptions } from "./crawl-coolpc-once/options";

const MANUAL_CRAWL_USER_AGENT =
  "PartsRadarTW manual crawler smoke (+https://github.com/C6Yelan/PartsRadarTW)";

// DB 計數用欄位（爬蟲前後比對用）。
interface DbCounts {
  products: number;
  activeProducts: number;
  productsWithImages: number;
  currentPrices: number;
  priceSnapshots: number;
  rawSnapshots: number;
}

// 手動流程主入口：解析參數、載入環境、執行爬蟲並輸出報表。
async function main() {
  const args = process.argv.slice(2);

  if (!args.includes("--help")) {
    await loadWorkspaceEnv(resolveWorkspaceRoot());
  }

  const options = parseOptions(args);
  let client: PrismaClient | null = null;

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    await assertSeededCategories(client);

    const beforeCounts = await collectDbCounts(client);
    const runResult = await runManualCrawl(client, options);
    const afterCounts = await collectDbCounts(client);

    printSummary({
      workspaceRoot: options.workspaceRoot,
      storageDir: options.storageDir,
      beforeCounts,
      afterCounts,
      runResult,
    });
  } finally {
    await client?.$disconnect();
  }
}

// 根據 options 呼叫一次性爬取流程，回傳 manual run 的執行結果。
export async function runManualCrawl(
  client: PrismaClient,
  options: CrawlOptions,
  dependencies: {
    acquireLock?: typeof tryAcquireExternalFetchLock;
    crawlCategories?: typeof runCoolpcCategoryCrawl;
  } = {},
): Promise<RunCoolpcCrawlOnceResult> {
  const acquireLock = dependencies.acquireLock ?? tryAcquireExternalFetchLock;
  const crawlCategories = dependencies.crawlCategories ?? runCoolpcCategoryCrawl;
  const externalFetchLock = await acquireLock({
    lockDir: options.externalFetchLockDir,
    owner: "manual-crawler",
    staleSeconds: options.externalFetchLockStaleSeconds,
  });

  if (!externalFetchLock) {
    throw new Error("Another live source fetch currently holds the shared external fetch lock.");
  }

  try {
    return await crawlCategories({
      client,
      workspaceRoot: options.workspaceRoot,
      storageDir: options.storageDir,
      delayMs: options.delayMs,
      triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
      fetchUserAgent: MANUAL_CRAWL_USER_AGENT,
      log: console.log,
    });
  } finally {
    await externalFetchLock.release();
  }
}

// 取得 DB 當前數據快照，用來計算單次爬取造成的變動。
async function collectDbCounts(client: PrismaClient): Promise<DbCounts> {
  const [
    products,
    activeProducts,
    productsWithImages,
    currentPrices,
    priceSnapshots,
    rawSnapshots,
  ] = await Promise.all([
    client.product.count(),
    client.product.count({ where: { isActive: true } }),
    client.product.count({ where: { primaryImageUrl: { not: null } } }),
    client.currentPrice.count(),
    client.priceSnapshot.count(),
    client.rawSnapshot.count(),
  ]);

  return {
    products,
    activeProducts,
    productsWithImages,
    currentPrices,
    priceSnapshots,
    rawSnapshots,
  };
}

// 印出本次爬取模式、分類結果與 DB 變動，作為人工快速判讀的輸出。
export function printSummary({
  workspaceRoot,
  storageDir,
  beforeCounts,
  afterCounts,
  runResult,
}: {
  workspaceRoot: string;
  storageDir: string;
  beforeCounts: DbCounts;
  afterCounts: DbCounts;
  runResult: RunCoolpcCrawlOnceResult;
}) {
  console.log("");
  console.log("CoolPC manual crawl finished.");
  console.log("- Mode: live fetch");
  console.log(`- Crawl run: ${runResult.crawlRunId}`);
  console.log(`- Status: ${runResult.status}`);
  console.log(`- Stopped by suspected block: ${runResult.stoppedBySuspectedBlock ? "yes" : "no"}`);
  console.log(`- Snapshot storage: ${relative(workspaceRoot, storageDir)}`);
  console.log("");
  console.log("Category results:");

  for (const result of runResult.categoryResults) {
    console.log(
      `- IGrp=${result.igrp}: ${result.status}${result.errorMessage ? ` (${toSafeCliErrorMessage(result.errorMessage)})` : ""}`,
    );
  }

  console.log("");
  console.log("DB changes:");
  printCountDelta("products", beforeCounts.products, afterCounts.products);
  printCountDelta("active products", beforeCounts.activeProducts, afterCounts.activeProducts);
  printCountDelta(
    "products with images",
    beforeCounts.productsWithImages,
    afterCounts.productsWithImages,
  );
  printCountDelta("current prices", beforeCounts.currentPrices, afterCounts.currentPrices);
  printCountDelta("price snapshots", beforeCounts.priceSnapshots, afterCounts.priceSnapshots);
  printCountDelta("raw snapshots", beforeCounts.rawSnapshots, afterCounts.rawSnapshots);
}

// 輸出單一指標的前後差異（含 +/- 標記）。
function printCountDelta(label: string, before: number, after: number): void {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";

  console.log(`- ${label}: ${after} (${sign}${delta})`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
