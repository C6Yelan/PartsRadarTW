// apps/crawler/src/scripts/manual/crawl-coolpc-once.ts
// 手動執行 CoolPC 單次爬蟲的 CLI 腳本。
// 用於本機驗證流程，先抓取後輸出結果摘要，不可作為排程入口使用。
import { relative } from "node:path";
import type { Prisma, PrismaClient } from "@partsradar/db";
import { createPublicProductImagePath } from "@partsradar/shared";
import { assertSeededCategories, runCoolpcCategoryCrawl } from "../../coolpc/live-crawl";
import { CRAWL_TRIGGER_TYPES, type RunCoolpcCrawlOnceResult } from "../../coolpc/crawl-run";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { parseOptions, type CrawlOptions } from "./crawl-coolpc-once/options";

// 取樣輸出的商品筆數上限（僅供 smoke summary 顯示）。
const DEFAULT_PAGE_SIZE = 5;
const MANUAL_CRAWL_USER_AGENT =
  "PartsRadarTW manual crawler smoke (+https://github.com/C6Yelan/PartsRadarTW)";
// 公用商品查詢條件，盡量對齊前台曝光規則，不直接依賴 API handler。
const PUBLIC_PRODUCT_SMOKE_FILTER = {
  sourceCategory: {
    enabled: true,
  },
  primaryImageUrl: {
    not: null,
  },
  primaryImageCheckedAt: {
    not: null,
  },
  currentPrice: {
    isNot: null,
  },
} satisfies Prisma.ProductWhereInput;
const PUBLIC_PRODUCT_SMOKE_FIELDS = {
  id: true,
  name: true,
  isActive: true,
  sourceCategory: {
    select: {
      displayName: true,
    },
  },
  currentPrice: {
    select: {
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

// DB 計數用欄位（爬蟲前後比對用）。
interface DbCounts {
  products: number;
  activeProducts: number;
  productsWithImages: number;
  currentPrices: number;
  priceSnapshots: number;
  rawSnapshots: number;
}

// smoke 查詢結果的最小輸出摘要。
interface PublicProductSmokeSummary {
  data: Array<{
    id: string;
    name: string;
    category: {
      displayName: string;
    };
    image: {
      url: string;
    };
    price: {
      amount: number;
      currency: string;
    };
    status: {
      isActive: boolean;
    };
  }>;
  totalItems: number;
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
    const publicProductSmoke = await readPublicProductSmokeSummary(client);

    printSummary({
      workspaceRoot: options.workspaceRoot,
      storageDir: options.storageDir,
      fromRawDir: options.fromRawDir,
      beforeCounts,
      afterCounts,
      runResult,
      publicProductSmoke,
    });
  } finally {
    await client?.$disconnect();
  }
}

// 根據 options 呼叫一次性爬取流程，回傳 manual run 的執行結果。
async function runManualCrawl(
  client: PrismaClient,
  options: CrawlOptions,
): Promise<RunCoolpcCrawlOnceResult> {
  return runCoolpcCategoryCrawl({
    client,
    workspaceRoot: options.workspaceRoot,
    storageDir: options.storageDir,
    fromRawDir: options.fromRawDir,
    delayMs: options.delayMs,
    triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
    baseUrl: process.env.COOLPC_BASE_URL,
    fetchUserAgent: MANUAL_CRAWL_USER_AGENT,
    log: console.log,
  });
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

// 讀取可見性對齊前台的商品快照，供手動驗證輸出。
async function readPublicProductSmokeSummary(
  client: PrismaClient,
): Promise<PublicProductSmokeSummary> {
  const [products, totalItems] = await Promise.all([
    client.product.findMany({
      where: PUBLIC_PRODUCT_SMOKE_FILTER,
      orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
      take: DEFAULT_PAGE_SIZE,
      select: PUBLIC_PRODUCT_SMOKE_FIELDS,
    }),
    client.product.count({
      where: PUBLIC_PRODUCT_SMOKE_FILTER,
    }),
  ]);

  return {
    totalItems,
    data: products.map((product) => {
      if (!product.currentPrice) {
        throw new Error("Product read smoke selected a product without current price.");
      }

      return {
        id: product.id,
        name: product.name,
        category: {
          displayName: product.sourceCategory.displayName,
        },
        image: {
          url: createPublicProductImagePath(product.id),
        },
        price: {
          amount: product.currentPrice.priceSnapshot.price,
          currency: product.currentPrice.priceSnapshot.currency,
        },
        status: {
          isActive: product.isActive,
        },
      };
    }),
  };
}

// 印出本次爬取模式、分類結果與 DB 變動，作為人工快速判讀的輸出。
function printSummary({
  workspaceRoot,
  storageDir,
  fromRawDir,
  beforeCounts,
  afterCounts,
  runResult,
  publicProductSmoke,
}: {
  workspaceRoot: string;
  storageDir: string;
  fromRawDir: string | null;
  beforeCounts: DbCounts;
  afterCounts: DbCounts;
  runResult: RunCoolpcCrawlOnceResult;
  publicProductSmoke: PublicProductSmokeSummary;
}) {
  console.log("");
  console.log("CoolPC manual crawl finished.");
  console.log(`- Mode: ${fromRawDir ? `raw replay (${fromRawDir})` : "live fetch"}`);
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
  console.log("");
  console.log(
    `DB read smoke: selected ${publicProductSmoke.data.length}/${publicProductSmoke.totalItems} products.`,
  );

  for (const product of publicProductSmoke.data) {
    console.log(
      `- ${product.name} | ${product.category.displayName} | ${product.price.currency} ${product.price.amount} | ${product.status.isActive ? "active" : "inactive"} | ${product.image.url}`,
    );
  }
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
