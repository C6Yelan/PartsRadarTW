import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Prisma, PrismaClient } from "@partsradar/db";
import {
  processCoolpcCategorySnapshotWithPrisma,
  type PrismaCoolpcCategorySnapshotClient,
} from "../coolpc/category-snapshot";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunStatusValue,
} from "../coolpc/crawl-run";
import { createCoolpcCategoryUrl } from "../coolpc/parser";
import {
  createGetProductHandler,
  type ProductDetailReadClient,
} from "../../../web/app/api/products/[id]/handler";
import {
  createGetProductsHandler,
  type ProductsReadClient,
} from "../../../web/app/api/products/handler";
import { createProductImageApiUrl } from "../../../web/app/api/product-images/handler";

const DEFAULT_FIXTURE_PATH = "apps/crawler/src/coolpc/__fixtures__/cpu-category.invalid-image.html";
const DEFAULT_STORAGE_DIR = "temp/coolpc-image-flow-smoke/snapshots";
const DEFAULT_SOURCE_IGRP = 4;
const DEFAULT_SMOKE_IGRP = 900004;
const SMOKE_SOURCE_NAME = "處理器 CPU";
const SMOKE_DISPLAY_NAME = "CPU";
const VALID_PRODUCT_TOKEN = "CPU-TOKEN-001";
const VALID_PRODUCT_SEARCH = "AMD Ryzen 5 7500F";

interface SmokeOptions {
  workspaceRoot: string;
  fixturePath: string;
  storageDir: string;
  sourceIgrp: number;
  smokeIgrp: number;
  fetchedAt: Date;
}

interface ProductListSmokeBody {
  data: Array<{
    id: string;
    image: {
      url: string;
      alt: string;
      capturedAt: string;
    };
  }>;
}

interface ProductDetailSmokeBody {
  id: string;
  image: {
    url: string;
    alt: string;
    capturedAt: string;
  };
}

interface SmokeReport {
  crawlRunId: string;
  crawlStatus: CrawlRunStatusValue;
  categoryStatus: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string;
  productId: string;
  primaryImageUrl: string;
  invalidRawImageUrls: string[];
  productListImageUrl: string;
  productDetailImageUrl: string;
}

class SmokeRollback extends Error {
  constructor(readonly report: SmokeReport) {
    super("Rollback CoolPC image flow smoke transaction.");
    this.name = "SmokeRollback";
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;
    const report = await runSmokeWithRollback(client, options);

    console.log("CoolPC image flow smoke passed.");
    console.log(`- Crawl run: ${report.crawlRunId} (${report.crawlStatus})`);
    console.log(`- Category result: ${report.categoryStatus}`);
    console.log(`- Raw snapshot: ${report.rawSnapshotId}`);
    console.log(`- Product: ${report.productId}`);
    console.log(`- Product image: ${report.primaryImageUrl}`);
    console.log(`- INVALID_IMAGE_URL raw values: ${report.invalidRawImageUrls.join(", ")}`);
    console.log(`- API list image: ${report.productListImageUrl}`);
    console.log(`- API detail image: ${report.productDetailImageUrl}`);
    console.log("- DB writes were verified inside a transaction and rolled back.");
    console.log(
      `- Snapshot storage path: ${relative(options.workspaceRoot, options.storageDir)} (ignored)`,
    );
  } finally {
    await client?.$disconnect();
  }
}

async function runSmokeWithRollback(
  client: PrismaClient,
  options: SmokeOptions,
): Promise<SmokeReport> {
  try {
    await client.$transaction(
      async (transaction) => {
        const report = await runSmokeInTransaction(transaction, options);
        throw new SmokeRollback(report);
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof SmokeRollback) {
      return error.report;
    }

    throw error;
  }

  throw new Error("Smoke transaction finished without rollback.");
}

async function runSmokeInTransaction(
  transaction: Prisma.TransactionClient,
  options: SmokeOptions,
): Promise<SmokeReport> {
  const rawHtml = await readFile(options.fixturePath, "utf8");
  const smokeHtml = createSmokeHtml(rawHtml, options.sourceIgrp, options.smokeIgrp);
  const category = await transaction.sourceCategory.upsert({
    where: {
      igrp: options.smokeIgrp,
    },
    update: {
      sourceName: SMOKE_SOURCE_NAME,
      displayName: SMOKE_DISPLAY_NAME,
      enabled: true,
    },
    create: {
      igrp: options.smokeIgrp,
      sourceName: SMOKE_SOURCE_NAME,
      displayName: SMOKE_DISPLAY_NAME,
      enabled: true,
    },
    select: {
      id: true,
      igrp: true,
      sourceName: true,
      displayName: true,
      enabled: true,
    },
  });
  const crawlRun = await transaction.crawlRun.create({
    data: {
      status: CRAWL_RUN_STATUSES.RUNNING,
      startedAt: options.fetchedAt,
      triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
    },
    select: {
      id: true,
    },
  });
  const categoryResult = await processCoolpcCategorySnapshotWithPrisma({
    client: createTransactionalSnapshotClient(transaction),
    storageDir: options.storageDir,
    crawlRunId: crawlRun.id,
    category,
    snapshot: {
      url: createCoolpcCategoryUrl(options.smokeIgrp),
      fetchedAt: options.fetchedAt,
      httpStatus: 200,
      rawHtml: smokeHtml,
    },
  });
  const crawlStatus = toSingleCategoryCrawlRunStatus(categoryResult.status);

  await transaction.crawlRunCategoryResult.create({
    data: {
      crawlRunId: crawlRun.id,
      sourceCategoryId: category.id,
      status: categoryResult.status,
      rawSnapshotId: categoryResult.rawSnapshotId,
      errorMessage: categoryResult.errorMessage ?? null,
    },
  });
  await transaction.sourceCategory.update({
    where: {
      id: category.id,
    },
    data: {
      lastCheckedAt: options.fetchedAt,
      ...(isSuccessCategoryStatus(categoryResult.status)
        ? { lastSuccessAt: options.fetchedAt }
        : {}),
    },
  });
  await transaction.crawlRun.update({
    where: {
      id: crawlRun.id,
    },
    data: {
      status: crawlStatus,
      finishedAt: options.fetchedAt,
    },
  });

  assert(
    categoryResult.rawSnapshotId,
    `Expected a raw snapshot id, got ${String(categoryResult.rawSnapshotId)}.`,
  );
  assert(
    isSuccessCategoryStatus(categoryResult.status),
    `Expected successful category result, got ${categoryResult.status}.`,
  );

  const product = await transaction.product.findUnique({
    where: {
      sourceCategoryId_ibuyToken: {
        sourceCategoryId: category.id,
        ibuyToken: VALID_PRODUCT_TOKEN,
      },
    },
    select: {
      id: true,
      name: true,
      primaryImageUrl: true,
      primaryImageCheckedAt: true,
    },
  });
  assert(product, `Expected smoke product ${VALID_PRODUCT_TOKEN} to be written.`);
  assert(product.primaryImageUrl, "Expected smoke product to have primaryImageUrl.");
  assert(product.primaryImageCheckedAt, "Expected smoke product to have primaryImageCheckedAt.");
  assert(
    product.primaryImageUrl ===
      `https://www.coolpc.com.tw/eval/${options.smokeIgrp}/amd7500f.jpg`,
    `Unexpected product image URL: ${product.primaryImageUrl}.`,
  );

  const invalidImageErrors = await transaction.parseError.findMany({
    where: {
      crawlRunId: crawlRun.id,
      errorType: "INVALID_IMAGE_URL",
    },
    orderBy: {
      rawToken: "asc",
    },
    select: {
      rawImageUrl: true,
    },
  });
  const invalidRawImageUrls = invalidImageErrors.map((issue) => issue.rawImageUrl);
  assert(
    invalidRawImageUrls.includes(`/eval/${options.smokeIgrp}/`),
    `Expected invalid image path to be recorded, got ${invalidRawImageUrls.join(", ")}.`,
  );
  assert(
    invalidRawImageUrls.includes("https://example.com/product.jpg"),
    `Expected external invalid image URL to be recorded, got ${invalidRawImageUrls.join(", ")}.`,
  );

  const apiClient = transaction as unknown as ProductsReadClient & ProductDetailReadClient;
  const listUrl = new URL("http://localhost/api/products");
  listUrl.searchParams.set("igrp", String(options.smokeIgrp));
  listUrl.searchParams.set("q", VALID_PRODUCT_SEARCH);
  listUrl.searchParams.set("pageSize", "10");
  const listBody = await readJsonResponse<ProductListSmokeBody>(
    await createGetProductsHandler(apiClient, { now: () => options.fetchedAt })(
      new Request(listUrl),
    ),
    "GET /api/products",
  );
  const listItem = listBody.data.find((item) => item.id === product.id);
  assert(listItem, "Expected product list API response to include smoke product.");
  const expectedProductImageApiUrl = createProductImageApiUrl(product.id);
  assert(
    listItem.image.url === expectedProductImageApiUrl,
    `Expected product list image ${expectedProductImageApiUrl}, got ${listItem.image.url}.`,
  );
  assert(
    !JSON.stringify(listBody).includes("rawImageUrl"),
    "Product list API response must not expose rawImageUrl.",
  );

  const detailBody = await readJsonResponse<ProductDetailSmokeBody>(
    await createGetProductHandler(apiClient)(product.id),
    "GET /api/products/[id]",
  );
  assert(detailBody.id === product.id, "Expected product detail API response to use product id.");
  assert(
    detailBody.image.url === expectedProductImageApiUrl,
    `Expected product detail image ${expectedProductImageApiUrl}, got ${detailBody.image.url}.`,
  );
  assert(
    !JSON.stringify(detailBody).includes("rawImageUrl"),
    "Product detail API response must not expose rawImageUrl.",
  );

  return {
    crawlRunId: crawlRun.id,
    crawlStatus,
    categoryStatus: categoryResult.status,
    rawSnapshotId: categoryResult.rawSnapshotId,
    productId: product.id,
    primaryImageUrl: product.primaryImageUrl,
    invalidRawImageUrls: invalidRawImageUrls.filter((value): value is string => value !== null),
    productListImageUrl: listItem.image.url,
    productDetailImageUrl: detailBody.image.url,
  };
}

function createTransactionalSnapshotClient(
  transaction: Prisma.TransactionClient,
): PrismaCoolpcCategorySnapshotClient {
  return {
    rawSnapshot: transaction.rawSnapshot,
    parseError: transaction.parseError,
    product: transaction.product,
    priceSnapshot: transaction.priceSnapshot,
    currentPrice: transaction.currentPrice,
    $transaction: async <T>(operation: (client: Prisma.TransactionClient) => Promise<T>) =>
      operation(transaction),
  } as unknown as PrismaCoolpcCategorySnapshotClient;
}

function toSingleCategoryCrawlRunStatus(
  status: CrawlRunCategoryResultStatusValue,
): CrawlRunStatusValue {
  switch (status) {
    case CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED:
      return CRAWL_RUN_STATUSES.SUCCESS_CHANGED;
    case CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED:
      return CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED;
    case CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED:
      return CRAWL_RUN_STATUSES.FETCH_FAILED;
    case CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK:
      return CRAWL_RUN_STATUSES.SUSPECTED_BLOCK;
    case CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED:
      return CRAWL_RUN_STATUSES.PARSE_FAILED;
  }
}

function isSuccessCategoryStatus(status: CrawlRunCategoryResultStatusValue): boolean {
  return (
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED ||
    status === CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
  );
}

function createSmokeHtml(rawHtml: string, sourceIgrp: number, smokeIgrp: number): string {
  return rawHtml
    .replaceAll(`IGrp=${sourceIgrp}`, `IGrp=${smokeIgrp}`)
    .replaceAll(`/eval/${sourceIgrp}/`, `/eval/${smokeIgrp}/`);
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}: ${text}`);
  }

  return JSON.parse(text) as T;
}

function parseOptions(args: string[]): SmokeOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = resolve(process.cwd(), "..", "..");
  const fixturePath = resolveRelativeToWorkspace(
    workspaceRoot,
    getStringArg(args, "--fixture") ?? DEFAULT_FIXTURE_PATH,
  );
  const storageDir = resolveRelativeToWorkspace(
    workspaceRoot,
    getStringArg(args, "--storage-dir") ?? DEFAULT_STORAGE_DIR,
  );
  const sourceIgrp = getNumberArg(args, "--source-igrp", DEFAULT_SOURCE_IGRP);
  const smokeIgrp = getNumberArg(args, "--smoke-igrp", DEFAULT_SMOKE_IGRP);
  const fetchedAtArg = getStringArg(args, "--fetched-at");
  const fetchedAt = fetchedAtArg ? new Date(fetchedAtArg) : new Date();

  if (Number.isNaN(fetchedAt.getTime())) {
    throw new Error(`Invalid --fetched-at value: ${String(fetchedAtArg)}`);
  }

  return {
    workspaceRoot,
    fixturePath,
    storageDir,
    sourceIgrp,
    smokeIgrp,
    fetchedAt,
  };
}

async function loadWorkspaceEnv(workspaceRoot: string): Promise<void> {
  await loadEnvFile(join(workspaceRoot, ".env"), false);
  await loadEnvFile(join(workspaceRoot, ".env.local"), true);
}

async function loadEnvFile(path: string, override: boolean): Promise<void> {
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function getStringArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function getNumberArg(args: string[], name: string, defaultValue: number): number {
  const value = getStringArg(args, name);

  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function resolveRelativeToWorkspace(workspaceRoot: string, path: string): string {
  return resolve(workspaceRoot, path);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler smoke:coolpc-image-flow [options]

Options:
  --fixture <path>       Raw HTML fixture path from the workspace root.
                         Default: ${DEFAULT_FIXTURE_PATH}
  --storage-dir <path>   Snapshot storage directory from the workspace root.
                         Default: ${DEFAULT_STORAGE_DIR}
  --source-igrp <id>     IGrp value used inside the fixture before rewriting.
                         Default: ${DEFAULT_SOURCE_IGRP}
  --smoke-igrp <id>      Temporary IGrp used inside the rollback transaction.
                         Default: ${DEFAULT_SMOKE_IGRP}
  --fetched-at <iso>     Fixed fetch timestamp. Defaults to current time.
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
