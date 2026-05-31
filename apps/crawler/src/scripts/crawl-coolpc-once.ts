// This script is a manual smoke tool for local validation.
// It intentionally calls the web API handler to verify DB-to-API compatibility.
// Do not use this as the production scheduled crawler entrypoint.
import { relative } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import {
  DEFAULT_COOLPC_CATEGORY_DELAY_MS,
  assertSeededCategories,
  runCoolpcCategoryCrawl,
} from "../coolpc/live-crawl";
import { CRAWL_TRIGGER_TYPES, type RunCoolpcCrawlOnceResult } from "../coolpc/crawl-run";
import {
  createGetProductsHandler,
  type ProductsReadClient,
} from "../../../web/app/api/products/handler";
import { SOURCE_STATUS_CATEGORY_QUERY } from "../../../web/app/api/source-status/handler";
import {
  getNumberArg,
  getStringArg,
  loadWorkspaceEnv,
  resolveRelativeToWorkspace,
  resolveWorkspaceRoot,
} from "./script-utils";

const CONFIRM_LIVE_FETCH_FLAG = "--confirm-live-fetch";
const DEFAULT_STORAGE_DIR = "temp/coolpc-manual-crawl/snapshots";
const DEFAULT_PAGE_SIZE = 5;
const MANUAL_CRAWL_USER_AGENT =
  "PartsRadarTW manual crawler smoke (+https://github.com/C6Yelan/PartsRadarTW)";

interface CrawlOptions {
  workspaceRoot: string;
  fromRawDir: string | null;
  storageDir: string;
  delayMs: number;
}

interface DbCounts {
  products: number;
  activeProducts: number;
  productsWithImages: number;
  currentPrices: number;
  priceSnapshots: number;
  rawSnapshots: number;
}

interface ProductsApiSmokeBody {
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
  pagination: {
    totalItems: number;
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;

    await assertSeededCategories(client);

    const beforeCounts = await collectDbCounts(client);
    const runResult = await runManualCrawl(client, options);
    const afterCounts = await collectDbCounts(client);
    const apiSmoke = await readProductsApiSmoke(client);

    printSummary({
      workspaceRoot: options.workspaceRoot,
      storageDir: options.storageDir,
      fromRawDir: options.fromRawDir,
      beforeCounts,
      afterCounts,
      runResult,
      apiSmoke,
    });
  } finally {
    await client?.$disconnect();
  }
}

async function runManualCrawl(
  client: PrismaClient,
  options: CrawlOptions,
): Promise<RunCoolpcCrawlOnceResult> {
  return runCoolpcCategoryCrawl({
    client,
    storageDir: options.storageDir,
    fromRawDir: options.fromRawDir,
    delayMs: options.delayMs,
    triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
    baseUrl: process.env.COOLPC_BASE_URL,
    fetchUserAgent: MANUAL_CRAWL_USER_AGENT,
    log: console.log,
  });
}

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

async function readProductsApiSmoke(client: PrismaClient): Promise<ProductsApiSmokeBody> {
  const readClient: ProductsReadClient = {
    product: {
      findProducts: (args) => client.product.findMany(args),
      findVendorOptions: (args) => client.product.findMany(args),
      count: (args) => client.product.count(args),
    },
    sourceCategory: {
      findMany: () => client.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
    },
  };

  return readJsonResponse<ProductsApiSmokeBody>(
    await createGetProductsHandler(readClient)(
      new Request(`http://localhost/api/products?pageSize=${DEFAULT_PAGE_SIZE}`),
    ),
    "GET /api/products",
  );
}

function printSummary({
  workspaceRoot,
  storageDir,
  fromRawDir,
  beforeCounts,
  afterCounts,
  runResult,
  apiSmoke,
}: {
  workspaceRoot: string;
  storageDir: string;
  fromRawDir: string | null;
  beforeCounts: DbCounts;
  afterCounts: DbCounts;
  runResult: RunCoolpcCrawlOnceResult;
  apiSmoke: ProductsApiSmokeBody;
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
      `- IGrp=${result.igrp}: ${result.status}${result.errorMessage ? ` (${result.errorMessage})` : ""}`,
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
  console.log(`API smoke: GET /api/products returned ${apiSmoke.pagination.totalItems} products.`);

  for (const product of apiSmoke.data) {
    console.log(
      `- ${product.name} | ${product.category.displayName} | ${product.price.currency} ${product.price.amount} | ${product.status.isActive ? "active" : "inactive"} | ${product.image.url}`,
    );
  }
}

function printCountDelta(label: string, before: number, after: number): void {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";

  console.log(`- ${label}: ${after} (${sign}${delta})`);
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}: ${text}`);
  }

  return JSON.parse(text) as T;
}

function parseOptions(args: string[]): CrawlOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const fromRawDirArg = getStringArg(args, "--from-raw-dir");
  const fromRawDir = fromRawDirArg
    ? resolveRelativeToWorkspace(workspaceRoot, fromRawDirArg)
    : null;

  if (!fromRawDir && !args.includes(CONFIRM_LIVE_FETCH_FLAG)) {
    throw new Error(
      `Refusing live CoolPC fetch. Re-run with ${CONFIRM_LIVE_FETCH_FLAG} because this command contacts the source site and must stay manual-only.`,
    );
  }

  return {
    workspaceRoot,
    fromRawDir,
    storageDir: resolveRelativeToWorkspace(
      workspaceRoot,
      getStringArg(args, "--storage-dir") ??
        process.env.SNAPSHOT_STORAGE_DIR ??
        DEFAULT_STORAGE_DIR,
    ),
    delayMs: getNumberArg(args, "--delay-ms", DEFAULT_COOLPC_CATEGORY_DELAY_MS),
  };
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler crawl:coolpc-once -- --from-raw-dir <path>
  pnpm --filter @partsradar/crawler crawl:coolpc-once -- --confirm-live-fetch [options]

Options:
  --from-raw-dir <path>      Replay saved raw HTML from the workspace root.
                             Expected files: igrp-4.html, igrp-5.html, ...
  --confirm-live-fetch       Required for live CoolPC requests.
  --delay-ms <ms>            Delay between live category requests.
                             Default: ${DEFAULT_COOLPC_CATEGORY_DELAY_MS}
  --storage-dir <path>       Snapshot storage directory from the workspace root.
                             Default: ${DEFAULT_STORAGE_DIR}
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
