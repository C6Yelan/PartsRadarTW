// apps/crawler/src/scripts/ops/production-smoke/checks/public-http.ts
import {
  fetchJson,
  fetchText,
  fetchWithTimeout,
  isSmokeCategoriesResponse,
  isSmokePriceHistoryResponse,
  isSmokeProductDetailResponse,
  isSmokeProductsResponse,
  isPublicHttpsUrl,
  isSmokeSourceStatusResponse,
  readRateLimitHeaders,
} from "../http";
import { fail, ok, warn } from "../results";
import type {
  ProductionSmokeOptions,
  SmokeProductsResponse,
  SmokeCheckResult,
  SmokeSourceStatusResponse,
} from "../types";

export async function checkPublicEndpoints(options: ProductionSmokeOptions): Promise<{
  checks: SmokeCheckResult[];
  sourceStatus: SmokeSourceStatusResponse | null;
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
    sourceStatus.ok && isSmokeSourceStatusResponse(sourceStatus.body) ? sourceStatus.body : null;
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
  const productsBody = products.ok && isSmokeProductsResponse(products.body) ? products.body : null;
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
      isSmokeProductDetailResponse(productDetail.body) &&
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
    priceHistory.ok && isSmokePriceHistoryResponse(priceHistory.body)
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

  if (!isSmokeCategoriesResponse(categoriesResult.body)) {
    return fail("categories api", "response shape is invalid");
  }

  const categoryCount = categoriesResult.body.data.length;

  if (categoryCount === 0) {
    return fail("categories api", "response has no category");
  }

  return ok("categories api", `categories=${categoryCount}`);
}

async function checkProductImageEndpoints(
  products: SmokeProductsResponse["data"],
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
