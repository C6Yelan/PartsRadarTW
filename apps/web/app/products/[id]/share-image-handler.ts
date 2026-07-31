// apps/web/app/products/[id]/share-image-handler.ts
// 在分享圖 renderer 前限制 client、lookup、cache bytes 與並行工作量。

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Prisma } from "@partsradar/db";
import { LRUCache } from "lru-cache";
import { normalizeProductId } from "../../_shared/product-id";
import {
  type ProductImageFileMetadata,
  type ProductImageStorageOptions,
  readCachedProductImage,
  readCachedProductImageMetadata,
} from "../../_shared/product-image-storage";
import {
  checkRateLimit,
  type RateLimitCheck,
  type RateLimitRequest,
  withRateLimitHeaders,
} from "../../api/_shared/rate-limit";
import {
  observeProductShareImage,
  type ProductShareImageCacheStatus,
  type ProductShareImageObservation,
  type ProductShareImageOutcome,
} from "./share-image-observability";
import type { ProductShareImageData } from "./share-image";

export const PRODUCT_SHARE_IMAGE_CACHE_CONTROL = "public, max-age=300, s-maxage=300";
export const PRODUCT_SHARE_IMAGE_INVALID_CACHE_CONTROL = "public, max-age=300, s-maxage=3600";
export const PRODUCT_SHARE_IMAGE_MISSING_CACHE_CONTROL = "public, max-age=30, s-maxage=60";

// Bump when static layout or copy changes because this value is part of every positive cache key.
const PRODUCT_SHARE_IMAGE_RENDER_VERSION = "v1";
const PRODUCT_SHARE_IMAGE_CONTENT_TYPE = "image/png";
const PRODUCT_SHARE_IMAGE_NO_STORE = "private, no-store";
const PRODUCT_SHARE_IMAGE_RETRY_AFTER_SECONDS = 5;

export const PRODUCT_SHARE_IMAGE_WORK_DEFAULTS = {
  positiveMaxEntries: 128,
  positiveMaxBytes: 16 * 1024 * 1024,
  positiveTtlMs: 5 * 60_000,
  negativeMaxEntries: 1024,
  negativeTtlMs: 60_000,
  maxConcurrentLookups: 16,
  maxConcurrentRenders: 2,
  maxSourceImageBytes: 2 * 1024 * 1024,
  maxResponseBytes: 1024 * 1024,
} as const;

const SHARE_PRODUCT_SELECT = {
  id: true,
  name: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
        },
      },
    },
  },
  sourceCategory: {
    select: {
      displayName: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

type ShareProduct = Prisma.ProductGetPayload<{ select: typeof SHARE_PRODUCT_SELECT }>;

export interface ProductShareImageClient {
  product: {
    findFirst(args: {
      where: {
        id: string;
        sourceCategory: { enabled: true };
        currentPrice: { isNot: null };
      };
      select: typeof SHARE_PRODUCT_SELECT;
    }): Promise<ShareProduct | null>;
  };
}

export interface ProductShareImageRequest {
  headers: RateLimitRequest["headers"];
  productId: unknown;
}

export interface ProductShareImageHandlerDependencies {
  cache?: ProductShareImageWorkCache;
  checkRateLimit?: (request: RateLimitRequest, scope: "metadata:image") => RateLimitCheck;
  imageOptions?: ProductImageStorageOptions;
  loadClient: () => Promise<ProductShareImageClient>;
  nowMs?: () => number;
  observe?: (observation: ProductShareImageObservation) => void;
  renderImage?: ProductShareImageRenderer;
}

export interface ProductShareImageWorkCacheConfig {
  maxConcurrentLookups: number;
  maxConcurrentRenders: number;
  maxResponseBytes: number;
  maxSourceImageBytes: number;
  negativeMaxEntries: number;
  negativeTtlMs: number;
  positiveMaxBytes: number;
  positiveMaxEntries: number;
  positiveTtlMs: number;
}

interface CachedProductShareImage {
  bytes: Uint8Array;
}

interface ProductShareImageResult {
  byteLength: number;
  cacheStatus: ProductShareImageCacheStatus;
  outcome: ProductShareImageOutcome;
  response: Response;
}

type ProductShareImageRenderer = (options: {
  imageBytes: Uint8Array | null;
  product: ProductShareImageData;
}) => Promise<Response>;

type CoordinatedWorkResult<T> = { status: "busy" } | { status: "coalesced" | "started"; value: T };

export class ProductShareImageWorkCache {
  readonly config: ProductShareImageWorkCacheConfig;
  readonly #positive: LRUCache<string, CachedProductShareImage>;
  readonly #negative: LRUCache<string, true>;
  readonly #lookups = new Map<string, Promise<ShareProduct | null>>();
  readonly #renders = new Map<string, Promise<CachedProductShareImage>>();

  constructor(config: ProductShareImageWorkCacheConfig = PRODUCT_SHARE_IMAGE_WORK_DEFAULTS) {
    this.config = config;
    this.#positive = new LRUCache({
      max: config.positiveMaxEntries,
      maxSize: config.positiveMaxBytes,
      sizeCalculation: (entry) => entry.bytes.byteLength,
      ttl: config.positiveTtlMs,
    });
    this.#negative = new LRUCache({
      max: config.negativeMaxEntries,
      ttl: config.negativeTtlMs,
    });
  }

  getPositive(key: string): CachedProductShareImage | null {
    return this.#positive.get(key) ?? null;
  }

  setPositive(key: string, value: CachedProductShareImage): void {
    this.#positive.set(key, {
      bytes: new Uint8Array(value.bytes),
    });
  }

  hasNegative(productId: string): boolean {
    return this.#negative.get(productId) === true;
  }

  setNegative(productId: string): void {
    this.#negative.set(productId, true);
  }

  async runLookup(
    productId: string,
    operation: () => Promise<ShareProduct | null>,
  ): Promise<CoordinatedWorkResult<ShareProduct | null>> {
    const existing = this.#lookups.get(productId);

    if (existing) {
      return {
        status: "coalesced",
        value: await existing,
      };
    }

    if (this.#lookups.size >= this.config.maxConcurrentLookups) {
      return { status: "busy" };
    }

    const work = operation();
    this.#lookups.set(productId, work);

    try {
      return {
        status: "started",
        value: await work,
      };
    } finally {
      if (this.#lookups.get(productId) === work) {
        this.#lookups.delete(productId);
      }
    }
  }

  async runRender(
    key: string,
    operation: () => Promise<CachedProductShareImage>,
  ): Promise<CoordinatedWorkResult<CachedProductShareImage>> {
    const existing = this.#renders.get(key);

    if (existing) {
      return {
        status: "coalesced",
        value: await existing,
      };
    }

    if (this.#renders.size >= this.config.maxConcurrentRenders) {
      return { status: "busy" };
    }

    const work = operation();
    this.#renders.set(key, work);

    try {
      return {
        status: "started",
        value: await work,
      };
    } finally {
      if (this.#renders.get(key) === work) {
        this.#renders.delete(key);
      }
    }
  }

  snapshot() {
    return {
      inflightLookups: this.#lookups.size,
      inflightRenders: this.#renders.size,
      negativeEntries: this.#negative.size,
      positiveBytes: this.#positive.calculatedSize,
      positiveEntries: this.#positive.size,
    };
  }
}

export function createProductShareImageHandler({
  cache = getGlobalProductShareImageWorkCache(),
  checkRateLimit: checkRequestRateLimit = checkRateLimit,
  imageOptions,
  loadClient,
  nowMs = performance.now.bind(performance),
  observe = observeProductShareImage,
  renderImage = renderProductShareImage,
}: ProductShareImageHandlerDependencies): (request: ProductShareImageRequest) => Promise<Response> {
  return async (request) => {
    const startedAtMs = nowMs();
    const rateLimitCheck = checkRequestRateLimit({ headers: request.headers }, "metadata:image");

    if (!rateLimitCheck.decision.allowed) {
      const result = createEmptyProductShareImageResult({
        status: 429,
        cacheControl: PRODUCT_SHARE_IMAGE_NO_STORE,
        cacheStatus: "bypass",
        outcome: "rate_denied",
        retryAfterSeconds: rateLimitCheck.decision.retryAfterSeconds,
      });
      const response = withRateLimitHeaders(result.response, rateLimitCheck.decision);
      observeResult(observe, result, startedAtMs, nowMs);

      return response;
    }

    let result: ProductShareImageResult;

    try {
      result = await resolveProductShareImage({
        cache,
        imageOptions,
        loadClient,
        productId: request.productId,
        renderImage,
      });
    } catch {
      result = createUnavailableProductShareImageResult();
    }

    const response = withRateLimitHeaders(result.response, rateLimitCheck.decision);
    observeResult(observe, result, startedAtMs, nowMs);

    return response;
  };
}

async function resolveProductShareImage({
  cache,
  imageOptions,
  loadClient,
  productId,
  renderImage,
}: {
  cache: ProductShareImageWorkCache;
  imageOptions: ProductImageStorageOptions | undefined;
  loadClient: () => Promise<ProductShareImageClient>;
  productId: unknown;
  renderImage: ProductShareImageRenderer;
}): Promise<ProductShareImageResult> {
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return createEmptyProductShareImageResult({
      status: 404,
      cacheControl: PRODUCT_SHARE_IMAGE_INVALID_CACHE_CONTROL,
      cacheStatus: "bypass",
      outcome: "invalid",
    });
  }

  if (cache.hasNegative(normalizedProductId)) {
    return createEmptyProductShareImageResult({
      status: 404,
      cacheControl: PRODUCT_SHARE_IMAGE_MISSING_CACHE_CONTROL,
      cacheStatus: "hit",
      outcome: "missing",
    });
  }

  let lookup: CoordinatedWorkResult<ShareProduct | null>;

  try {
    lookup = await cache.runLookup(normalizedProductId, async () => {
      const client = await loadClient();

      return client.product.findFirst({
        where: {
          id: normalizedProductId,
          sourceCategory: { enabled: true },
          currentPrice: { isNot: null },
        },
        select: SHARE_PRODUCT_SELECT,
      });
    });
  } catch {
    return createUnavailableProductShareImageResult();
  }

  if (lookup.status === "busy") {
    return createUnavailableProductShareImageResult();
  }

  const product = normalizeShareProduct(lookup.value);

  if (!product) {
    cache.setNegative(normalizedProductId);

    return createEmptyProductShareImageResult({
      status: 404,
      cacheControl: PRODUCT_SHARE_IMAGE_MISSING_CACHE_CONTROL,
      cacheStatus: lookup.status === "coalesced" ? "coalesced" : "miss",
      outcome: "missing",
    });
  }

  const imageMetadata = await readProductImageMetadataSafely(normalizedProductId, imageOptions);
  const cacheKey = createProductShareImageCacheKey(product, imageMetadata);
  const cached = cache.getPositive(cacheKey);

  if (cached) {
    return createValidProductShareImageResult(cached.bytes, "hit");
  }

  let rendered: CoordinatedWorkResult<CachedProductShareImage>;

  try {
    rendered = await cache.runRender(cacheKey, async () => {
      const sourceImageBytes = await readBoundedProductImage({
        imageMetadata,
        imageOptions,
        maxBytes: cache.config.maxSourceImageBytes,
        productId: normalizedProductId,
      });
      const response = await renderImage({
        product,
        imageBytes: sourceImageBytes,
      });

      if (response.status !== 200) {
        throw new Error("Product share image renderer returned an invalid status.");
      }

      const bytes = new Uint8Array(await response.arrayBuffer());

      if (bytes.byteLength === 0 || bytes.byteLength > cache.config.maxResponseBytes) {
        throw new Error("Product share image output exceeded its response bound.");
      }

      const entry = { bytes };
      cache.setPositive(cacheKey, entry);

      return entry;
    });
  } catch {
    return createUnavailableProductShareImageResult();
  }

  if (rendered.status === "busy") {
    return createUnavailableProductShareImageResult();
  }

  return createValidProductShareImageResult(
    rendered.value.bytes,
    rendered.status === "coalesced" ? "coalesced" : "miss",
  );
}

async function readProductImageMetadataSafely(
  productId: string,
  imageOptions: ProductImageStorageOptions | undefined,
): Promise<ProductImageFileMetadata | null> {
  try {
    return await readCachedProductImageMetadata(productId, imageOptions);
  } catch {
    return null;
  }
}

async function readBoundedProductImage({
  imageMetadata,
  imageOptions,
  maxBytes,
  productId,
}: {
  imageMetadata: ProductImageFileMetadata | null;
  imageOptions: ProductImageStorageOptions | undefined;
  maxBytes: number;
  productId: string;
}): Promise<Uint8Array | null> {
  if (!imageMetadata || imageMetadata.byteLength > maxBytes) {
    return null;
  }

  try {
    const bytes = await readCachedProductImage(productId, imageOptions);

    return bytes && bytes.byteLength <= maxBytes ? bytes : null;
  } catch {
    return null;
  }
}

function normalizeShareProduct(product: ShareProduct | null): ProductShareImageData | null {
  if (!product?.currentPrice) {
    return null;
  }

  return {
    id: product.id,
    name: product.name,
    currentPrice: product.currentPrice,
    sourceCategory: product.sourceCategory,
  };
}

function createProductShareImageCacheKey(
  product: ProductShareImageData,
  imageMetadata: ProductImageFileMetadata | null,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        PRODUCT_SHARE_IMAGE_RENDER_VERSION,
        product.id,
        product.name,
        product.currentPrice.priceSnapshot.price,
        product.currentPrice.lastSeenAt.getTime(),
        product.sourceCategory.displayName,
        imageMetadata?.version ?? null,
        imageMetadata?.byteLength ?? null,
      ]),
    )
    .digest("hex");
}

function createValidProductShareImageResult(
  bytes: Uint8Array,
  cacheStatus: ProductShareImageCacheStatus,
): ProductShareImageResult {
  const responseBytes = new Uint8Array(bytes);

  return {
    byteLength: responseBytes.byteLength,
    cacheStatus,
    outcome: "valid",
    response: new Response(responseBytes, {
      status: 200,
      headers: createProductShareImageHeaders({
        byteLength: responseBytes.byteLength,
        cacheControl: PRODUCT_SHARE_IMAGE_CACHE_CONTROL,
        cacheStatus,
        outcome: "valid",
      }),
    }),
  };
}

function createUnavailableProductShareImageResult(): ProductShareImageResult {
  return createEmptyProductShareImageResult({
    status: 503,
    cacheControl: PRODUCT_SHARE_IMAGE_NO_STORE,
    cacheStatus: "bypass",
    outcome: "unavailable",
    retryAfterSeconds: PRODUCT_SHARE_IMAGE_RETRY_AFTER_SECONDS,
  });
}

function createEmptyProductShareImageResult({
  cacheControl,
  cacheStatus,
  outcome,
  retryAfterSeconds,
  status,
}: {
  cacheControl: string;
  cacheStatus: ProductShareImageCacheStatus;
  outcome: ProductShareImageOutcome;
  retryAfterSeconds?: number;
  status: 404 | 429 | 503;
}): ProductShareImageResult {
  return {
    byteLength: 0,
    cacheStatus,
    outcome,
    response: new Response(null, {
      status,
      headers: createProductShareImageHeaders({
        byteLength: 0,
        cacheControl,
        cacheStatus,
        outcome,
        retryAfterSeconds,
      }),
    }),
  };
}

function createProductShareImageHeaders({
  byteLength,
  cacheControl,
  cacheStatus,
  outcome,
  retryAfterSeconds,
}: {
  byteLength: number;
  cacheControl: string;
  cacheStatus: ProductShareImageCacheStatus;
  outcome: ProductShareImageOutcome;
  retryAfterSeconds?: number;
}): HeadersInit {
  return {
    "Cache-Control": cacheControl,
    "Content-Length": String(byteLength),
    "Content-Type": PRODUCT_SHARE_IMAGE_CONTENT_TYPE,
    "X-Content-Type-Options": "nosniff",
    "X-Share-Image-Cache": cacheStatus,
    "X-Share-Image-Outcome": outcome,
    ...(retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) }),
  };
}

function observeResult(
  observe: (observation: ProductShareImageObservation) => void,
  result: ProductShareImageResult,
  startedAtMs: number,
  nowMs: () => number,
): void {
  try {
    observe({
      byteLength: result.byteLength,
      cacheStatus: result.cacheStatus,
      durationMs: Math.max(0, nowMs() - startedAtMs),
      outcome: result.outcome,
    });
  } catch {
    // Observability must not change the public response contract.
  }
}

async function renderProductShareImage(
  options: Parameters<ProductShareImageRenderer>[0],
): Promise<Response> {
  const { renderProductShareImageResponse } = await import("./share-image");

  return renderProductShareImageResponse(options);
}

interface ProductShareImageGlobalState {
  __partsradarProductShareImageWorkCacheV1?: ProductShareImageWorkCache;
}

function getGlobalProductShareImageWorkCache(): ProductShareImageWorkCache {
  const state = globalThis as typeof globalThis & ProductShareImageGlobalState;

  state.__partsradarProductShareImageWorkCacheV1 ??= new ProductShareImageWorkCache();

  return state.__partsradarProductShareImageWorkCacheV1;
}
