// apps/crawler/src/scripts/ops/production-smoke/checks.ts

import { access } from "node:fs/promises";
import { join } from "node:path";
import { CRAWL_RUN_STATUSES } from "../../../coolpc/crawl-run";
import {
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_KINDS,
} from "../product-link-checker/processor";
import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR } from "./constants";
import {
  fetchJson,
  fetchText,
  fetchWithTimeout,
  isCategoriesResponse,
  isPriceHistoryResponse,
  isProductDetailResponse,
  isProductsResponse,
  isPublicHttpsUrl,
  isSourceStatusResponse,
  readRateLimitHeaders,
} from "./http";
import {
  countStatus,
  fail,
  formatAgeMinutes,
  minutesBetween,
  ok,
  parseIsoDate,
  resolveSummaryStatus,
  thresholdCheck,
  warn,
  worseStatus,
} from "./results";
import type {
  ProductionSmokeClient,
  ProductionSmokeOptions,
  ProductionSmokeSummary,
  ProductsResponse,
  SmokeCheckResult,
  SmokeStatus,
  SourceImageAnomalyRecord,
  SourceStatusResponse,
} from "./types";

const DISCORD_DELIVERY_HEALTH_SCAN_LIMIT = 500;

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
  checks.push(await checkDiscordBotDeliveries(client, options, now));

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

async function checkPublicEndpoints(options: ProductionSmokeOptions): Promise<{
  checks: SmokeCheckResult[];
  sourceStatus: SourceStatusResponse | null;
}> {
  const checks: SmokeCheckResult[] = [];
  const homepage = await fetchText("/", options);
  checks.push(
    homepage.ok ? ok("homepage", `HTTP ${homepage.status}`) : fail("homepage", homepage.message),
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
  checks.push(checkCategoriesApi(categories));

  const products = await fetchJson(
    `/api/products?pageSize=${options.productImageSampleSize}`,
    options,
  );
  const productsBody = products.ok && isProductsResponse(products.body) ? products.body : null;
  const firstProduct = productsBody?.data[0] ?? null;
  const productId = firstProduct?.id ?? null;
  checks.push(
    products.ok && productsBody && productId
      ? ok("product list api", `totalItems=${productsBody.pagination.totalItems}`)
      : fail("product list api", products.ok ? "response has no product" : products.message),
  );
  checks.push(checkRateLimitHeaders(products, options));

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
      : fail(
          "product detail api",
          productDetail.ok ? "response shape is invalid" : productDetail.message,
        ),
  );

  checks.push(await checkProductImageEndpoints(productsBody?.data ?? [], options));

  const priceHistory = await fetchJson(
    `/api/products/${productId}/price-history?range=90d`,
    options,
  );
  checks.push(
    priceHistory.ok && isPriceHistoryResponse(priceHistory.body)
      ? ok("price-history api", `points=${priceHistory.body.points.length}`)
      : fail(
          "price-history api",
          priceHistory.ok ? "response shape is invalid" : priceHistory.message,
        ),
  );

  return {
    checks,
    sourceStatus: sourceStatusBody,
  };
}

function checkCategoriesApi(
  categoriesResult: Awaited<ReturnType<typeof fetchJson>>,
): SmokeCheckResult {
  if (!categoriesResult.ok) {
    return fail("categories api", categoriesResult.message);
  }

  if (!isCategoriesResponse(categoriesResult.body)) {
    return fail("categories api", "response shape is invalid");
  }

  const categoryCount = categoriesResult.body.data.length;

  if (categoryCount === 0) {
    return fail("categories api", "response has no category");
  }

  return ok("categories api", `categories=${categoryCount}`);
}

async function checkProductImageEndpoints(
  products: ProductsResponse["data"],
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const failures: string[] = [];
  let checkedCount = 0;
  let skippedMissingImageCount = 0;

  for (const product of products.slice(0, options.productImageSampleSize)) {
    const imagePath = typeof product.image?.url === "string" ? product.image.url : null;

    if (!imagePath) {
      skippedMissingImageCount += 1;
      continue;
    }

    if (!imagePath.startsWith("/api/product-images/")) {
      failures.push(`${product.id}: invalid public product image path`);
      continue;
    }

    checkedCount += 1;
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
      `checked=${checkedCount} skippedMissingImage=${skippedMissingImageCount} failed=${failures.length} firstFailure=${failures[0]}`,
    );
  }

  return ok(
    "product image api",
    `checked=${checkedCount} skippedMissingImage=${skippedMissingImageCount}`,
  );
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

  return count > 0
    ? warn("recent suspected blocks", message)
    : ok("recent suspected blocks", message);
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
  const records = await client.parseError.findMany({
    where: {
      errorType: "INVALID_IMAGE_URL",
      createdAt: {
        gte: since,
      },
    },
    select: {
      rawToken: true,
      rawName: true,
      rawImageUrl: true,
    },
  });
  const summary = summarizeSourceImageAnomalies(records);
  const message = `${summary.rows} rows / ${summary.distinctProducts} distinct products / ${summary.distinctRawImageUrls} distinct raw image urls in ${options.recentWindowHours}h, warnAfter=${options.invalidImageUrlWarnCount}`;

  return summary.rows > options.invalidImageUrlWarnCount
    ? warn("source image anomalies", message)
    : ok("source image anomalies", message);
}

function summarizeSourceImageAnomalies(records: SourceImageAnomalyRecord[]) {
  const productKeys = new Set<string>();
  const rawImageUrls = new Set<string>();

  for (const record of records) {
    const productKey = toSourceImageAnomalyProductKey(record);
    const rawImageUrl = normalizeNullableText(record.rawImageUrl);

    if (productKey) {
      productKeys.add(productKey);
    }

    if (rawImageUrl) {
      rawImageUrls.add(rawImageUrl);
    }
  }

  return {
    rows: records.length,
    distinctProducts: productKeys.size,
    distinctRawImageUrls: rawImageUrls.size,
  };
}

function toSourceImageAnomalyProductKey(record: SourceImageAnomalyRecord): string | null {
  const rawToken = normalizeNullableText(record.rawToken);

  if (rawToken) {
    return `token:${rawToken}`;
  }

  const rawName = normalizeNullableText(record.rawName);

  return rawName ? `name:${rawName}` : null;
}

function normalizeNullableText(value: string | null): string | null {
  const trimmed = value?.trim();

  return trimmed || null;
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
  const [sourceBrokenCount, sourceTemporaryCount] = await Promise.all([
    countActiveProductLinks(client, PRODUCT_LINK_KINDS.SOURCE, PRODUCT_LINK_HEALTH_STATUSES.BROKEN),
    countActiveProductLinks(
      client,
      PRODUCT_LINK_KINDS.SOURCE,
      PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
    ),
  ]);
  const status = [
    countStatus(
      sourceBrokenCount,
      options.sourceBrokenLinkWarnCount,
      options.sourceBrokenLinkFailCount,
    ),
    countStatus(
      sourceTemporaryCount,
      options.sourceTemporaryLinkWarnCount,
      options.sourceTemporaryLinkFailCount,
    ),
  ].reduce<SmokeStatus>(
    (currentStatus, nextStatus) => worseStatus(currentStatus, nextStatus),
    "OK",
  );

  return {
    name: "link health",
    status,
    message: `source broken=${sourceBrokenCount} temporary=${sourceTemporaryCount}`,
  };
}

async function countActiveProductLinks(
  client: ProductionSmokeClient,
  linkKind: (typeof PRODUCT_LINK_KINDS)[keyof typeof PRODUCT_LINK_KINDS],
  status: (typeof PRODUCT_LINK_HEALTH_STATUSES)[keyof typeof PRODUCT_LINK_HEALTH_STATUSES],
): Promise<number> {
  return client.productLinkHealth.count({
    where: {
      linkKind,
      status,
      product: {
        isActive: true,
      },
    },
  });
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
    return warn(
      "rate limit headers",
      `${message}; public HTTPS smoke should expose client identity`,
    );
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

async function checkDiscordBotDeliveries(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const { failed: failedCount, rateLimited: rateLimitedCount } =
    summarizeLatestDiscordDeliveryStatuses(
      await client.discordNotificationDelivery.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          id: true,
          discordUserId: true,
          kind: true,
          status: true,
          targetPriceWatchId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: DISCORD_DELIVERY_HEALTH_SCAN_LIMIT,
      }),
    );
  const message = `failed=${failedCount} rateLimited=${rateLimitedCount} in ${options.recentWindowHours}h`;

  return failedCount + rateLimitedCount > 0
    ? warn("discord bot deliveries", message)
    : ok("discord bot deliveries", message);
}

interface DiscordDeliveryHealthRecord {
  id: string;
  discordUserId: string;
  kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE";
  status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
  targetPriceWatchId: string | null;
  createdAt: Date;
}

function summarizeLatestDiscordDeliveryStatuses(records: DiscordDeliveryHealthRecord[]): {
  failed: number;
  rateLimited: number;
} {
  const latestByStream = new Map<string, DiscordDeliveryHealthRecord>();

  for (const record of [...records].sort(compareDiscordDeliveryHealthRecordsDesc)) {
    const key = toDiscordDeliveryStreamKey(record);

    if (!latestByStream.has(key)) {
      latestByStream.set(key, record);
    }
  }

  let failed = 0;
  let rateLimited = 0;

  for (const record of latestByStream.values()) {
    if (record.status === "FAILED") {
      failed += 1;
    } else if (record.status === "RATE_LIMITED") {
      rateLimited += 1;
    }
  }

  return { failed, rateLimited };
}

function compareDiscordDeliveryHealthRecordsDesc(
  left: DiscordDeliveryHealthRecord,
  right: DiscordDeliveryHealthRecord,
): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

function toDiscordDeliveryStreamKey(record: DiscordDeliveryHealthRecord): string {
  if (record.kind === "TARGET_PRICE") {
    return `${record.kind}:${record.discordUserId}:${record.targetPriceWatchId ?? record.id}`;
  }

  return `${record.kind}:${record.discordUserId}`;
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
