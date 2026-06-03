// apps/crawler/src/scripts/ops/production-smoke.ts
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@partsradar/db";
import { CRAWL_RUN_STATUSES } from "../../coolpc/crawl-run";
import {
  getStringArg,
  loadWorkspaceEnv,
  resolveRelativeToWorkspace,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import { PRODUCT_LINK_HEALTH_STATUSES } from "./product-link-checker/processor";

const HELP_FLAG = "--help";
const PUBLIC_ONLY_FLAG = "--public-only";
const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "storage/product-images";
const DEFAULT_PRODUCT_IMAGE_SAMPLE_SIZE = 5;
const REQUIRED_V2_CATEGORY_IGRPS = [8, 11, 16] as const;
const DEFAULT_SOURCE_WARN_AFTER_MINUTES = 60;
const DEFAULT_SOURCE_FAIL_AFTER_MINUTES = 120;
const DEFAULT_CRAWLER_WARN_AFTER_MINUTES = 90;
const DEFAULT_CRAWLER_FAIL_AFTER_MINUTES = 180;
const DEFAULT_RECENT_WINDOW_HOURS = 24;
const DEFAULT_PARSE_ERROR_WARN_COUNT = 20;
const DEFAULT_PARSE_ERROR_FAIL_COUNT = 100;
const DEFAULT_INVALID_IMAGE_URL_WARN_COUNT = 2000;
const DEFAULT_MIN_ACTIVE_PRODUCTS = 1;
const DEFAULT_MISSING_IMAGE_WARN_COUNT = 200;
const DEFAULT_MISSING_IMAGE_FAIL_COUNT = 500;
const DEFAULT_BROKEN_LINK_WARN_COUNT = 1;
const DEFAULT_BROKEN_LINK_FAIL_COUNT = 50;
const DEFAULT_TEMPORARY_LINK_WARN_COUNT = 100;
const DEFAULT_TEMPORARY_LINK_FAIL_COUNT = 500;
const DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS = 30;
const DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS = 90;
const DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS = 2;
const DEFAULT_RAW_SNAPSHOT_WARN_COUNT = 1;
const DEFAULT_RAW_SNAPSHOT_FAIL_COUNT = 100;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

export type SmokeStatus = "OK" | "WARN" | "FAIL";

export interface ProductionSmokeOptions {
  workspaceRoot: string;
  baseUrl: string;
  publicOnly: boolean;
  timeoutMs: number;
  productImageStorageDir: string;
  productImageSampleSize: number;
  sourceWarnAfterMinutes: number;
  sourceFailAfterMinutes: number;
  crawlerWarnAfterMinutes: number;
  crawlerFailAfterMinutes: number;
  recentWindowHours: number;
  parseErrorWarnCount: number;
  parseErrorFailCount: number;
  invalidImageUrlWarnCount: number;
  minActiveProducts: number;
  missingImageWarnCount: number;
  missingImageFailCount: number;
  brokenLinkWarnCount: number;
  brokenLinkFailCount: number;
  temporaryLinkWarnCount: number;
  temporaryLinkFailCount: number;
  rawSnapshotNormalRetentionDays: number;
  rawSnapshotAbnormalRetentionDays: number;
  rawSnapshotRetentionGraceDays: number;
  rawSnapshotWarnCount: number;
  rawSnapshotFailCount: number;
}

export interface SmokeCheckResult {
  name: string;
  status: SmokeStatus;
  message: string;
}

export interface ProductionSmokeSummary {
  checkedAt: Date;
  status: SmokeStatus;
  checks: SmokeCheckResult[];
}

interface ProductsResponse {
  data: Array<{
    id: string;
    image?: {
      url?: string;
    };
    priceMovement?: {
      rangeDays?: number;
      deltaAmount?: number | null;
      deltaPercent?: number | null;
    };
  }>;
  pagination: {
    totalItems: number;
  };
}

interface CategoriesResponse {
  data: Array<{
    igrp: number;
  }>;
}

interface SourceStatusResponse {
  status: string;
  lastSuccessAt: string | null;
}

interface PriceHistoryResponse {
  points: unknown[];
}

interface ProductDetailResponse {
  id: string;
}

interface RateLimitHeaderSnapshot {
  clientSource: string;
  limit: number;
  remaining: number;
  reset: number;
}

type ProductionSmokeClient = Pick<
  PrismaClient,
  "crawlRun" | "parseError" | "product" | "productLinkHealth" | "rawSnapshot"
>;

export function parseProductionSmokeOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ProductionSmokeOptions {
  if (args.includes(HELP_FLAG)) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const baseUrl = normalizeBaseUrl(
    getStringArg(args, "--base-url") ?? env.SMOKE_PUBLIC_BASE_URL ?? DEFAULT_BASE_URL,
  );

  return {
    workspaceRoot,
    baseUrl,
    publicOnly: args.includes(PUBLIC_ONLY_FLAG),
    timeoutMs: parseIntegerOption({
      args,
      env,
      argName: "--timeout-ms",
      envName: "SMOKE_TIMEOUT_MS",
      fallback: DEFAULT_TIMEOUT_MS,
      min: 1000,
      max: 60000,
    }),
    productImageStorageDir: resolveRelativeToWorkspace(
      workspaceRoot,
      getStringArg(args, "--product-image-storage-dir") ??
        env.PRODUCT_IMAGE_STORAGE_DIR ??
        DEFAULT_PRODUCT_IMAGE_STORAGE_DIR,
    ),
    productImageSampleSize: parseIntegerOption({
      args,
      env,
      argName: "--product-image-sample-size",
      envName: "SMOKE_PRODUCT_IMAGE_SAMPLE_SIZE",
      fallback: DEFAULT_PRODUCT_IMAGE_SAMPLE_SIZE,
      min: 1,
      max: 50,
    }),
    sourceWarnAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--source-warn-after-minutes",
      envName: "SMOKE_SOURCE_WARN_AFTER_MINUTES",
      fallback: DEFAULT_SOURCE_WARN_AFTER_MINUTES,
      min: 1,
      max: 24 * 60,
    }),
    sourceFailAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--source-fail-after-minutes",
      envName: "SMOKE_SOURCE_FAIL_AFTER_MINUTES",
      fallback: DEFAULT_SOURCE_FAIL_AFTER_MINUTES,
      min: 1,
      max: 7 * 24 * 60,
    }),
    crawlerWarnAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--crawler-warn-after-minutes",
      envName: "SMOKE_CRAWLER_WARN_AFTER_MINUTES",
      fallback: DEFAULT_CRAWLER_WARN_AFTER_MINUTES,
      min: 1,
      max: 7 * 24 * 60,
    }),
    crawlerFailAfterMinutes: parseIntegerOption({
      args,
      env,
      argName: "--crawler-fail-after-minutes",
      envName: "SMOKE_CRAWLER_FAIL_AFTER_MINUTES",
      fallback: DEFAULT_CRAWLER_FAIL_AFTER_MINUTES,
      min: 1,
      max: 14 * 24 * 60,
    }),
    recentWindowHours: parseIntegerOption({
      args,
      env,
      argName: "--recent-window-hours",
      envName: "SMOKE_RECENT_WINDOW_HOURS",
      fallback: DEFAULT_RECENT_WINDOW_HOURS,
      min: 1,
      max: 30 * 24,
    }),
    parseErrorWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--parse-error-warn-count",
      envName: "SMOKE_PARSE_ERROR_WARN_COUNT",
      fallback: DEFAULT_PARSE_ERROR_WARN_COUNT,
      min: 0,
      max: 100000,
    }),
    parseErrorFailCount: parseIntegerOption({
      args,
      env,
      argName: "--parse-error-fail-count",
      envName: "SMOKE_PARSE_ERROR_FAIL_COUNT",
      fallback: DEFAULT_PARSE_ERROR_FAIL_COUNT,
      min: 0,
      max: 100000,
    }),
    invalidImageUrlWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--invalid-image-url-warn-count",
      envName: "SMOKE_INVALID_IMAGE_URL_WARN_COUNT",
      // Normal production baseline is roughly 624 invalid source image URLs
      // per 24h. Warn at a little over 3x that baseline so fixed third-party
      // source noise stays informational while spikes remain visible.
      fallback: DEFAULT_INVALID_IMAGE_URL_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    minActiveProducts: parseIntegerOption({
      args,
      env,
      argName: "--min-active-products",
      envName: "SMOKE_MIN_ACTIVE_PRODUCTS",
      fallback: DEFAULT_MIN_ACTIVE_PRODUCTS,
      min: 1,
      max: 1000000,
    }),
    missingImageWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--missing-image-warn-count",
      envName: "SMOKE_MISSING_IMAGE_WARN_COUNT",
      fallback: DEFAULT_MISSING_IMAGE_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    missingImageFailCount: parseIntegerOption({
      args,
      env,
      argName: "--missing-image-fail-count",
      envName: "SMOKE_MISSING_IMAGE_FAIL_COUNT",
      fallback: DEFAULT_MISSING_IMAGE_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
    brokenLinkWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--broken-link-warn-count",
      envName: "SMOKE_BROKEN_LINK_WARN_COUNT",
      fallback: DEFAULT_BROKEN_LINK_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    brokenLinkFailCount: parseIntegerOption({
      args,
      env,
      argName: "--broken-link-fail-count",
      envName: "SMOKE_BROKEN_LINK_FAIL_COUNT",
      fallback: DEFAULT_BROKEN_LINK_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
    temporaryLinkWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--temporary-link-warn-count",
      envName: "SMOKE_TEMPORARY_LINK_WARN_COUNT",
      fallback: DEFAULT_TEMPORARY_LINK_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    temporaryLinkFailCount: parseIntegerOption({
      args,
      env,
      argName: "--temporary-link-fail-count",
      envName: "SMOKE_TEMPORARY_LINK_FAIL_COUNT",
      fallback: DEFAULT_TEMPORARY_LINK_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
    rawSnapshotNormalRetentionDays: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-normal-retention-days",
      envName: "SMOKE_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_NORMAL_RETENTION_DAYS,
      min: 1,
      max: 365,
    }),
    rawSnapshotAbnormalRetentionDays: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-abnormal-retention-days",
      envName: "SMOKE_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_ABNORMAL_RETENTION_DAYS,
      min: 1,
      max: 365,
    }),
    rawSnapshotRetentionGraceDays: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-retention-grace-days",
      envName: "SMOKE_RAW_SNAPSHOT_RETENTION_GRACE_DAYS",
      fallback: DEFAULT_RAW_SNAPSHOT_RETENTION_GRACE_DAYS,
      min: 0,
      max: 30,
    }),
    rawSnapshotWarnCount: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-warn-count",
      envName: "SMOKE_RAW_SNAPSHOT_WARN_COUNT",
      fallback: DEFAULT_RAW_SNAPSHOT_WARN_COUNT,
      min: 0,
      max: 1000000,
    }),
    rawSnapshotFailCount: parseIntegerOption({
      args,
      env,
      argName: "--raw-snapshot-fail-count",
      envName: "SMOKE_RAW_SNAPSHOT_FAIL_COUNT",
      fallback: DEFAULT_RAW_SNAPSHOT_FAIL_COUNT,
      min: 0,
      max: 1000000,
    }),
  };
}

export async function runProductionSmoke(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now = new Date(),
): Promise<ProductionSmokeSummary> {
  const checks: SmokeCheckResult[] = [];
  const productsResult = await checkPublicEndpoints(options);
  checks.push(...productsResult.checks);
  checks.push(await checkSourceFreshness(productsResult.sourceStatus, options, now));
  checks.push(await checkCrawlerFreshness(client, options, now));
  checks.push(await checkRecentSuspectedBlocks(client, options, now));
  checks.push(await checkRecentParseErrors(client, options, now));
  checks.push(await checkSourceImageAnomalies(client, options, now));
  checks.push(await checkActiveProductCount(client, options));
  checks.push(await checkMissingProductImages(client, options));
  checks.push(await checkLinkHealth(client, options));
  checks.push(await checkRawSnapshotRetention(client, options, now));

  return {
    checkedAt: now,
    status: resolveSummaryStatus(checks),
    checks,
  };
}

export async function runProductionPublicSmoke(
  options: ProductionSmokeOptions,
  now = new Date(),
): Promise<ProductionSmokeSummary> {
  const checks: SmokeCheckResult[] = [];
  const productsResult = await checkPublicEndpoints(options);
  checks.push(...productsResult.checks);
  checks.push(await checkSourceFreshness(productsResult.sourceStatus, options, now));

  return {
    checkedAt: now,
    status: resolveSummaryStatus(checks),
    checks,
  };
}

export function printProductionSmokeSummary(summary: ProductionSmokeSummary): void {
  console.log("");
  console.log("PartsRadarTW production smoke");
  console.log(`Checked at: ${summary.checkedAt.toISOString()}`);
  console.log("");

  for (const check of summary.checks) {
    console.log(`[${check.status}] ${check.name}: ${check.message}`);
  }

  console.log("");
  console.log(`Result: ${summary.status}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseProductionSmokeOptions(args);
  let client: PrismaClient | null = null;

  try {
    if (options.publicOnly) {
      const summary = await runProductionPublicSmoke(options);
      printProductionSmokeSummary(summary);

      if (summary.status === "FAIL") {
        process.exitCode = 1;
      }

      return;
    }

    const db = await import("@partsradar/db");
    client = db.prisma;
    const summary = await runProductionSmoke(client, options);
    printProductionSmokeSummary(summary);

    if (summary.status === "FAIL") {
      process.exitCode = 1;
    }
  } finally {
    await client?.$disconnect();
  }
}

async function checkPublicEndpoints(options: ProductionSmokeOptions): Promise<{
  checks: SmokeCheckResult[];
  sourceStatus: SourceStatusResponse | null;
}> {
  const checks: SmokeCheckResult[] = [];
  const homepage = await fetchText("/", options);
  checks.push(
    homepage.ok
      ? ok("homepage", `HTTP ${homepage.status}`)
      : fail("homepage", homepage.message),
  );

  const buildListPage = await fetchText("/build-list", options);
  checks.push(
    buildListPage.ok
      ? ok("build-list page", `HTTP ${buildListPage.status}`)
      : fail("build-list page", buildListPage.message),
  );

  const sourceStatus = await fetchJson("/api/source-status", options);
  const sourceStatusBody =
    sourceStatus.ok && isSourceStatusResponse(sourceStatus.body) ? sourceStatus.body : null;
  checks.push(
    sourceStatus.ok && sourceStatusBody
      ? ok("source-status api", `status=${sourceStatusBody.status}`)
      : fail(
          "source-status api",
          sourceStatus.ok ? "response shape is invalid" : sourceStatus.message,
        ),
  );

  const categories = await fetchJson("/api/categories", options);
  checks.push(checkV2Categories(categories));

  const products = await fetchJson(`/api/products?pageSize=${options.productImageSampleSize}`, options);
  const productsBody = products.ok && isProductsResponse(products.body) ? products.body : null;
  const firstProduct = productsBody?.data[0] ?? null;
  const productId = firstProduct?.id ?? null;
  checks.push(
    products.ok && productsBody && productId
      ? ok("product list api", `totalItems=${productsBody.pagination.totalItems}`)
      : fail("product list api", products.ok ? "response has no product" : products.message),
  );
  checks.push(checkRateLimitHeaders(products, options));
  checks.push(await checkPriceMovementSort("price_drop_desc", options));
  checks.push(await checkPriceMovementSort("price_rise_desc", options));

  if (!productId) {
    checks.push(fail("product detail api", "skipped because product list returned no product"));
    checks.push(fail("product image api", "skipped because product list returned no product"));
    checks.push(fail("price-history api", "skipped because product list returned no product"));

    return {
      checks,
      sourceStatus: sourceStatusBody,
    };
  }

  const productDetail = await fetchJson(`/api/products/${productId}`, options);
  checks.push(
    productDetail.ok &&
      isProductDetailResponse(productDetail.body) &&
      productDetail.body.id === productId
      ? ok("product detail api", productId)
      : fail("product detail api", productDetail.ok ? "response shape is invalid" : productDetail.message),
  );

  checks.push(await checkProductImageEndpoints(productsBody?.data ?? [], options));

  const priceHistory = await fetchJson(`/api/products/${productId}/price-history?range=90d`, options);
  checks.push(
    priceHistory.ok && isPriceHistoryResponse(priceHistory.body)
      ? ok("price-history api", `points=${priceHistory.body.points.length}`)
      : fail("price-history api", priceHistory.ok ? "response shape is invalid" : priceHistory.message),
  );

  return {
    checks,
    sourceStatus: sourceStatusBody,
  };
}

function checkV2Categories(
  categoriesResult: Awaited<ReturnType<typeof fetchJson>>,
): SmokeCheckResult {
  if (!categoriesResult.ok) {
    return fail("v2 categories api", categoriesResult.message);
  }

  if (!isCategoriesResponse(categoriesResult.body)) {
    return fail("v2 categories api", "response shape is invalid");
  }

  const igrps = new Set(categoriesResult.body.data.map((category) => category.igrp));
  const missingIgrps = REQUIRED_V2_CATEGORY_IGRPS.filter((igrp) => !igrps.has(igrp));

  if (missingIgrps.length > 0) {
    return fail("v2 categories api", `missing IGrp=${missingIgrps.join(",")}`);
  }

  return ok("v2 categories api", `required IGrp=${REQUIRED_V2_CATEGORY_IGRPS.join(",")}`);
}

async function checkPriceMovementSort(
  sort: "price_drop_desc" | "price_rise_desc",
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const result = await fetchJson(`/api/products?sort=${sort}&pageSize=1`, options);

  if (!result.ok) {
    return fail(`price movement sort ${sort}`, result.message);
  }

  if (!isProductsResponse(result.body)) {
    return fail(`price movement sort ${sort}`, "response shape is invalid");
  }

  const firstProduct = result.body.data[0] ?? null;

  if (!firstProduct) {
    return fail(`price movement sort ${sort}`, "response has no product");
  }

  if (!isV2PriceMovement(firstProduct.priceMovement)) {
    return fail(`price movement sort ${sort}`, "missing 30-day priceMovement data");
  }

  return ok(`price movement sort ${sort}`, `rangeDays=${firstProduct.priceMovement.rangeDays}`);
}

async function checkProductImageEndpoints(
  products: ProductsResponse["data"],
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const failures: string[] = [];

  for (const product of products.slice(0, options.productImageSampleSize)) {
    const imagePath = typeof product.image?.url === "string" ? product.image.url : null;

    if (!imagePath?.startsWith("/api/product-images/")) {
      failures.push(`${product.id}: missing public product image path`);
      continue;
    }

    const result = await fetchWithTimeout(imagePath, options);

    if (!result.ok) {
      failures.push(`${product.id}: ${result.message}`);
      continue;
    }

    const contentType = result.response.headers.get("content-type") ?? "unknown";

    if (!contentType.toLowerCase().startsWith("image/")) {
      failures.push(`${product.id}: unexpected contentType=${contentType}`);
    }
  }

  if (failures.length > 0) {
    return fail(
      "product image api",
      `checked=${products.length} failed=${failures.length} firstFailure=${failures[0]}`,
    );
  }

  return ok("product image api", `checked=${products.length}`);
}

async function checkSourceFreshness(
  sourceStatus: SourceStatusResponse | null,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  if (!sourceStatus) {
    return fail("source freshness", "source-status response was unavailable");
  }

  if (!sourceStatus.lastSuccessAt) {
    return fail("source freshness", "lastSuccessAt is null");
  }

  const lastSuccessAt = parseIsoDate(sourceStatus.lastSuccessAt);

  if (!lastSuccessAt) {
    return fail("source freshness", "lastSuccessAt is invalid");
  }

  const ageMinutes = minutesBetween(lastSuccessAt, now);
  const message = `lastSuccessAt=${formatAgeMinutes(ageMinutes)} status=${sourceStatus.status}`;

  if (ageMinutes >= options.sourceFailAfterMinutes || sourceStatus.status === "unavailable") {
    return fail("source freshness", message);
  }

  if (ageMinutes >= options.sourceWarnAfterMinutes || sourceStatus.status !== "ok") {
    return warn("source freshness", message);
  }

  return ok("source freshness", message);
}

async function checkCrawlerFreshness(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const latestScheduledRun = await client.crawlRun.findFirst({
    where: {
      triggerType: "SCHEDULED",
    },
    orderBy: {
      startedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  const latestSuccess = await client.crawlRun.findFirst({
    where: {
      triggerType: "SCHEDULED",
      status: {
        in: [CRAWL_RUN_STATUSES.SUCCESS_CHANGED, CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED],
      },
      finishedAt: {
        not: null,
      },
    },
    orderBy: {
      finishedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      finishedAt: true,
    },
  });

  if (!latestSuccess?.finishedAt) {
    return fail("crawler freshness", "no successful scheduled crawl run found");
  }

  const ageMinutes = minutesBetween(latestSuccess.finishedAt, now);
  const latestStatus = latestScheduledRun?.status ?? "none";
  const message = `latestSuccess=${formatAgeMinutes(ageMinutes)} latestStatus=${latestStatus}`;

  if (latestScheduledRun?.status === CRAWL_RUN_STATUSES.SUSPECTED_BLOCK) {
    return fail("crawler freshness", message);
  }

  if (ageMinutes >= options.crawlerFailAfterMinutes) {
    return fail("crawler freshness", message);
  }

  if (ageMinutes >= options.crawlerWarnAfterMinutes) {
    return warn("crawler freshness", message);
  }

  return ok("crawler freshness", message);
}

async function checkRecentSuspectedBlocks(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const count = await client.crawlRun.count({
    where: {
      triggerType: "SCHEDULED",
      status: CRAWL_RUN_STATUSES.SUSPECTED_BLOCK,
      startedAt: {
        gte: since,
      },
    },
  });
  const message = `${count} suspected block run(s) in ${options.recentWindowHours}h`;

  return count > 0 ? warn("recent suspected blocks", message) : ok("recent suspected blocks", message);
}

async function checkRecentParseErrors(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const count = await client.parseError.count({
    where: {
      errorType: {
        not: "INVALID_IMAGE_URL",
      },
      createdAt: {
        gte: since,
      },
    },
  });
  const message = `${count} parse error(s) in ${options.recentWindowHours}h`;

  return thresholdCheck(
    "recent parse errors",
    count,
    options.parseErrorWarnCount,
    options.parseErrorFailCount,
    message,
  );
}

async function checkSourceImageAnomalies(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const count = await client.parseError.count({
    where: {
      errorType: "INVALID_IMAGE_URL",
      createdAt: {
        gte: since,
      },
    },
  });
  const message = `${count} invalid image URL issue(s) in ${options.recentWindowHours}h, warnAfter=${options.invalidImageUrlWarnCount}`;

  return count > options.invalidImageUrlWarnCount
    ? warn("source image anomalies", message)
    : ok("source image anomalies", message);
}

async function checkActiveProductCount(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const count = await client.product.count({
    where: displayReadyProductWhere(),
  });
  const message = `${count} display-ready active product(s)`;

  return count < options.minActiveProducts
    ? fail("active products", message)
    : ok("active products", message);
}

async function checkMissingProductImages(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const products = await client.product.findMany({
    where: displayReadyProductWhere(),
    select: {
      id: true,
    },
  });
  let missingCount = 0;

  for (const product of products) {
    if (!(await pathExists(join(options.productImageStorageDir, `${product.id}.webp`)))) {
      missingCount += 1;
    }
  }

  const message = `${missingCount}/${products.length} display-ready product image(s) missing`;

  return thresholdCheck(
    "missing product images",
    missingCount,
    options.missingImageWarnCount,
    options.missingImageFailCount,
    message,
  );
}

async function checkLinkHealth(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const brokenCount = await client.productLinkHealth.count({
    where: {
      status: PRODUCT_LINK_HEALTH_STATUSES.BROKEN,
      product: {
        isActive: true,
      },
    },
  });
  const temporaryCount = await client.productLinkHealth.count({
    where: {
      status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
      product: {
        isActive: true,
      },
    },
  });
  const status = worseStatus(
    countStatus(brokenCount, options.brokenLinkWarnCount, options.brokenLinkFailCount),
    countStatus(temporaryCount, options.temporaryLinkWarnCount, options.temporaryLinkFailCount),
  );

  return {
    name: "link health",
    status,
    message: `broken=${brokenCount} temporary=${temporaryCount}`,
  };
}

function checkRateLimitHeaders(
  productsResult: Awaited<ReturnType<typeof fetchJson>>,
  options: ProductionSmokeOptions,
): SmokeCheckResult {
  if (!productsResult.ok) {
    return fail("rate limit headers", "skipped because product list API was unavailable");
  }

  const snapshot = readRateLimitHeaders(productsResult.headers);

  if (!snapshot) {
    return fail("rate limit headers", "missing or invalid X-RateLimit headers");
  }

  const message = `clientSource=${snapshot.clientSource} limit=${snapshot.limit} remaining=${snapshot.remaining}`;

  if (snapshot.clientSource === "unknown" && isPublicHttpsUrl(options.baseUrl)) {
    return warn("rate limit headers", `${message}; public HTTPS smoke should expose client identity`);
  }

  return ok("rate limit headers", message);
}

async function checkRawSnapshotRetention(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const normalCutoff = new Date(
    now.getTime() -
      (options.rawSnapshotNormalRetentionDays + options.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const abnormalCutoff = new Date(
    now.getTime() -
      (options.rawSnapshotAbnormalRetentionDays + options.rawSnapshotRetentionGraceDays) *
        MILLISECONDS_PER_DAY,
  );
  const expiredNormalCount = await client.rawSnapshot.count({
    where: {
      contentStatus: "VALID",
      createdAt: {
        lt: normalCutoff,
      },
    },
  });
  const expiredAbnormalCount = await client.rawSnapshot.count({
    where: {
      contentStatus: {
        in: ["SUSPECTED_BLOCK", "INVALID"],
      },
      createdAt: {
        lt: abnormalCutoff,
      },
    },
  });
  const expiredCount = expiredNormalCount + expiredAbnormalCount;
  const message = `expired=${expiredCount} normal=${expiredNormalCount} abnormal=${expiredAbnormalCount}`;

  return thresholdCheck(
    "raw snapshot retention",
    expiredCount,
    options.rawSnapshotWarnCount,
    options.rawSnapshotFailCount,
    message,
  );
}

function displayReadyProductWhere() {
  return {
    isActive: true,
    primaryImageUrl: {
      not: null,
    },
    primaryImageCheckedAt: {
      not: null,
    },
    currentPrice: {
      isNot: null,
    },
  } as const;
}

async function fetchText(
  path: string,
  options: ProductionSmokeOptions,
): Promise<
  | {
      ok: true;
      status: number;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const response = await fetchWithTimeout(path, options);

  if (!response.ok) {
    return response;
  }

  return {
    ok: true,
    status: response.response.status,
  };
}

async function fetchJson(
  path: string,
  options: ProductionSmokeOptions,
): Promise<
  | {
      ok: true;
      body: unknown;
      headers: Headers;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const response = await fetchWithTimeout(path, options);

  if (!response.ok) {
    return response;
  }

  try {
    return {
      ok: true,
      body: await response.response.json(),
      headers: response.response.headers,
    };
  } catch (error) {
    return {
      ok: false,
      message: `JSON parse failed: ${toSafeCliErrorMessage(error)}`,
    };
  }
}

function readRateLimitHeaders(headers: Headers): RateLimitHeaderSnapshot | null {
  const clientSource = headers.get("X-RateLimit-Client-Source");
  const limit = parseNonNegativeHeaderInteger(headers.get("X-RateLimit-Limit"));
  const remaining = parseNonNegativeHeaderInteger(headers.get("X-RateLimit-Remaining"));
  const reset = parseNonNegativeHeaderInteger(headers.get("X-RateLimit-Reset"));

  if (
    !clientSource ||
    !["cf", "xff", "unknown"].includes(clientSource) ||
    limit === null ||
    limit <= 0 ||
    remaining === null ||
    reset === null ||
    reset <= 0
  ) {
    return null;
  }

  return {
    clientSource,
    limit,
    remaining,
    reset,
  };
}

function parseNonNegativeHeaderInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function isPublicHttpsUrl(value: string): boolean {
  const url = new URL(value);

  return (
    url.protocol === "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "::1"
  );
}

async function fetchWithTimeout(
  path: string,
  options: ProductionSmokeOptions,
): Promise<
  | {
      ok: true;
      response: Response;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const url = new URL(path, options.baseUrl);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "PartsRadarTW production smoke (+https://github.com/C6Yelan/PartsRadarTW)",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      response,
    };
  } catch (error) {
    return {
      ok: false,
      message: toSafeCliErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return url.toString();
  } catch {
    throw new Error("--base-url/SMOKE_PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }
}

function thresholdCheck(
  name: string,
  count: number,
  warnCount: number,
  failCount: number,
  message: string,
): SmokeCheckResult {
  return {
    name,
    status: countStatus(count, warnCount, failCount),
    message,
  };
}

function countStatus(count: number, warnCount: number, failCount: number): SmokeStatus {
  if (failCount > 0 && count >= failCount) {
    return "FAIL";
  }

  if (warnCount > 0 && count >= warnCount) {
    return "WARN";
  }

  return "OK";
}

function resolveSummaryStatus(checks: SmokeCheckResult[]): SmokeStatus {
  return checks.reduce<SmokeStatus>((status, check) => worseStatus(status, check.status), "OK");
}

function worseStatus(left: SmokeStatus, right: SmokeStatus): SmokeStatus {
  if (left === "FAIL" || right === "FAIL") {
    return "FAIL";
  }

  if (left === "WARN" || right === "WARN") {
    return "WARN";
  }

  return "OK";
}

function ok(name: string, message: string): SmokeCheckResult {
  return {
    name,
    status: "OK",
    message,
  };
}

function warn(name: string, message: string): SmokeCheckResult {
  return {
    name,
    status: "WARN",
    message,
  };
}

function fail(name: string, message: string): SmokeCheckResult {
  return {
    name,
    status: "FAIL",
    message,
  };
}

function minutesBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MILLISECONDS_PER_MINUTE));
}

function formatAgeMinutes(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m ago`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;

  return `${hours}h${minutes}m ago`;
}

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const message = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}

function isSourceStatusResponse(value: unknown): value is SourceStatusResponse {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    (typeof value.lastSuccessAt === "string" || value.lastSuccessAt === null)
  );
}

function isProductsResponse(value: unknown): value is ProductsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    isRecord(value.pagination) &&
    typeof value.pagination.totalItems === "number"
  );
}

function isCategoriesResponse(value: unknown): value is CategoriesResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every((category) => isRecord(category) && typeof category.igrp === "number")
  );
}

function isProductDetailResponse(value: unknown): value is ProductDetailResponse {
  return isRecord(value) && typeof value.id === "string";
}

function isPriceHistoryResponse(value: unknown): value is PriceHistoryResponse {
  return isRecord(value) && Array.isArray(value.points);
}

function isV2PriceMovement(value: unknown): value is {
  rangeDays: 30;
  deltaAmount: number | null;
  deltaPercent: number | null;
} {
  return (
    isRecord(value) &&
    value.rangeDays === 30 &&
    (typeof value.deltaAmount === "number" || value.deltaAmount === null) &&
    (typeof value.deltaPercent === "number" || value.deltaPercent === null)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:production-smoke -- [options]

Options:
  --base-url <url>                         Website base URL to check.
                                           Default: SMOKE_PUBLIC_BASE_URL, then ${DEFAULT_BASE_URL}
  --public-only                            Check public HTTP routes/APIs only; does not require DB access.
  --timeout-ms <ms>                        HTTP request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --product-image-storage-dir <path>       Product image cache directory.
                                           Default: PRODUCT_IMAGE_STORAGE_DIR, then ${DEFAULT_PRODUCT_IMAGE_STORAGE_DIR}
  --source-warn-after-minutes <minutes>    Warn when source success is older than this.
  --source-fail-after-minutes <minutes>    Fail when source success is older than this.
  --crawler-warn-after-minutes <minutes>   Warn when latest successful crawler run is older than this.
  --crawler-fail-after-minutes <minutes>   Fail when latest successful crawler run is older than this.
  --recent-window-hours <hours>            Window for suspected block and parse error checks.
  --invalid-image-url-warn-count <count>   Warn only when source image URL anomalies exceed this.
                                           Default: ${DEFAULT_INVALID_IMAGE_URL_WARN_COUNT}
  --help                                   Show this help message.
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
