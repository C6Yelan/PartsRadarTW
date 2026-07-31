// apps/web/tests/products/share-image-handler.test.ts
// 驗證分享圖 invalid、missing、valid 與 adversarial unique-key 工作量皆有固定上限。

import { describe, expect, it, vi } from "vitest";
import type { RateLimitCheck, RateLimitDecision } from "../../app/api/_shared/rate-limit";
import type { ProductShareImageData } from "../../app/products/[id]/share-image";
import {
  createProductShareImageHandler,
  PRODUCT_SHARE_IMAGE_CACHE_CONTROL,
  PRODUCT_SHARE_IMAGE_INVALID_CACHE_CONTROL,
  PRODUCT_SHARE_IMAGE_MISSING_CACHE_CONTROL,
  type ProductShareImageClient,
  ProductShareImageWorkCache,
  type ProductShareImageWorkCacheConfig,
} from "../../app/products/[id]/share-image-handler";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const REQUEST_HEADERS = new Headers({
  "CF-Connecting-IP": "203.0.113.10",
});
const RESPONSE_BYTES = Uint8Array.of(137, 80, 78, 71);

describe("product share image handler", () => {
  it.each([
    ["an empty id", ""],
    ["a short id", "short"],
    ["a path-like id", "../source-product"],
    ["an encoded separator", `${PRODUCT_ID}%2fimage`],
    ["an overlong id", "a".repeat(10_000)],
  ])("rejects %s before Prisma, storage, and rendering", async (_label, productId) => {
    const loadClient = vi.fn(async () => fakeClient(product()).client);
    const readImageMetadata = vi.fn();
    const readImageFile = vi.fn();
    const renderImage = vi.fn(async () => imageResponse());
    const handler = createProductShareImageHandler({
      cache: createWorkCache(),
      checkRateLimit: allowRateLimit,
      imageOptions: {
        storageDir: "/cached-products",
        readImageFile,
        readImageMetadata,
      },
      loadClient,
      observe: vi.fn(),
      renderImage,
    });

    const response = await handler({ headers: REQUEST_HEADERS, productId });

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PRODUCT_SHARE_IMAGE_INVALID_CACHE_CONTROL);
    expect(response.headers.get("Content-Length")).toBe("0");
    expect(response.headers.get("X-Share-Image-Outcome")).toBe("invalid");
    expect(loadClient).not.toHaveBeenCalled();
    expect(readImageMetadata).not.toHaveBeenCalled();
    expect(readImageFile).not.toHaveBeenCalled();
    expect(renderImage).not.toHaveBeenCalled();
  });

  it("negative-caches a missing UUID without rendering a fallback", async () => {
    const { client, findFirst } = fakeClient(null);
    const loadClient = vi.fn(async () => client);
    const readImageMetadata = vi.fn();
    const renderImage = vi.fn(async () => imageResponse());
    const handler = createProductShareImageHandler({
      cache: createWorkCache(),
      checkRateLimit: allowRateLimit,
      imageOptions: {
        storageDir: "/cached-products",
        readImageMetadata,
      },
      loadClient,
      observe: vi.fn(),
      renderImage,
    });

    const first = await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID });
    const second = await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID });

    expect(first.status).toBe(404);
    expect(first.headers.get("Cache-Control")).toBe(PRODUCT_SHARE_IMAGE_MISSING_CACHE_CONTROL);
    expect(first.headers.get("X-Share-Image-Cache")).toBe("miss");
    expect(second.status).toBe(404);
    expect(second.headers.get("X-Share-Image-Cache")).toBe("hit");
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: PRODUCT_ID,
        sourceCategory: { enabled: true },
        currentPrice: { isNot: null },
      },
      select: expect.not.objectContaining({
        ibuyToken: true,
        primaryImageUrl: true,
        sourceUrl: true,
      }),
    });
    expect(readImageMetadata).not.toHaveBeenCalled();
    expect(renderImage).not.toHaveBeenCalled();
  });

  it("keeps negative-cache entries fixed under unique UUID churn", async () => {
    const { client, findFirst } = fakeClient(null);
    const cache = createWorkCache({ negativeMaxEntries: 3 });
    const handler = createProductShareImageHandler({
      cache,
      checkRateLimit: allowRateLimit,
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage: vi.fn(async () => imageResponse()),
    });

    for (let index = 1; index <= 20; index += 1) {
      const response = await handler({
        headers: REQUEST_HEADERS,
        productId: productIdFromIndex(index),
      });

      expect(response.status).toBe(404);
    }

    expect(findFirst).toHaveBeenCalledTimes(20);
    expect(cache.snapshot()).toMatchObject({
      negativeEntries: 3,
      positiveEntries: 0,
      inflightLookups: 0,
      inflightRenders: 0,
    });
  });

  it("coalesces concurrent lookup, file read, and render work for one valid key", async () => {
    const lookup = deferred<ProductShareImageData | null>();
    const render = deferred<Response>();
    const { client, findFirst } = fakeClient(() => lookup.promise);
    const loadClient = vi.fn(async () => client);
    const readImageMetadata = vi.fn(async () => ({
      byteLength: 4,
      version: "inode:4:mtime-v1",
    }));
    const readImageFile = vi.fn(async () => Uint8Array.of(1, 2, 3, 4));
    const renderImage = vi.fn(async () => render.promise);
    const cache = createWorkCache();
    const handler = createProductShareImageHandler({
      cache,
      checkRateLimit: allowRateLimit,
      imageOptions: {
        storageDir: "/cached-products",
        readImageFile,
        readImageMetadata,
      },
      loadClient,
      observe: vi.fn(),
      renderImage,
    });

    const firstPromise = handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID });
    const secondPromise = handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID });

    await vi.waitFor(() => expect(findFirst).toHaveBeenCalledTimes(1));
    lookup.resolve(product());
    await vi.waitFor(() => expect(renderImage).toHaveBeenCalledTimes(1));
    render.resolve(imageResponse());

    const responses = await Promise.all([firstPromise, secondPromise]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.map((response) => response.headers.get("X-Share-Image-Cache")).sort()).toEqual(
      ["coalesced", "miss"],
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(readImageFile).toHaveBeenCalledTimes(1);
    expect(renderImage).toHaveBeenCalledTimes(1);
    expect(cache.snapshot()).toMatchObject({
      positiveEntries: 1,
      positiveBytes: RESPONSE_BYTES.byteLength,
      inflightLookups: 0,
      inflightRenders: 0,
    });

    const cached = await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID });

    expect(cached.status).toBe(200);
    expect(cached.headers.get("Cache-Control")).toBe(PRODUCT_SHARE_IMAGE_CACHE_CONTROL);
    expect(cached.headers.get("X-Share-Image-Cache")).toBe("hit");
    expect(cached.headers.get("Content-Length")).toBe(String(RESPONSE_BYTES.byteLength));
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(readImageMetadata).toHaveBeenCalledTimes(3);
    expect(readImageFile).toHaveBeenCalledTimes(1);
    expect(renderImage).toHaveBeenCalledTimes(1);
  });

  it("changes the cache key when public price or image version changes", async () => {
    let currentProduct = product();
    let imageVersion = "inode:4:mtime-v1";
    const { client } = fakeClient(() => currentProduct);
    const renderImage = vi.fn(async () => imageResponse());
    const handler = createProductShareImageHandler({
      cache: createWorkCache(),
      checkRateLimit: allowRateLimit,
      imageOptions: {
        storageDir: "/cached-products",
        readImageFile: async () => Uint8Array.of(1, 2, 3, 4),
        readImageMetadata: async () => ({
          byteLength: 4,
          version: imageVersion,
        }),
      },
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage,
    });

    expect(
      (
        await handler({
          headers: REQUEST_HEADERS,
          productId: PRODUCT_ID,
        })
      ).headers.get("X-Share-Image-Cache"),
    ).toBe("miss");
    expect(
      (
        await handler({
          headers: REQUEST_HEADERS,
          productId: PRODUCT_ID,
        })
      ).headers.get("X-Share-Image-Cache"),
    ).toBe("hit");

    currentProduct = product({
      currentPrice: {
        lastSeenAt: new Date("2026-05-28T12:05:00.000Z"),
        priceSnapshot: { price: 6790 },
      },
    });
    expect(
      (
        await handler({
          headers: REQUEST_HEADERS,
          productId: PRODUCT_ID,
        })
      ).headers.get("X-Share-Image-Cache"),
    ).toBe("miss");

    imageVersion = "inode:4:mtime-v2";
    expect(
      (
        await handler({
          headers: REQUEST_HEADERS,
          productId: PRODUCT_ID,
        })
      ).headers.get("X-Share-Image-Cache"),
    ).toBe("miss");
    expect(renderImage).toHaveBeenCalledTimes(3);
  });

  it("rebuilds a valid image after the positive-cache TTL", async () => {
    const { client } = fakeClient(product());
    const renderImage = vi.fn(async () => imageResponse());
    const handler = createProductShareImageHandler({
      cache: createWorkCache({ positiveTtlMs: 5 }),
      checkRateLimit: allowRateLimit,
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage,
    });

    expect(
      (
        await handler({
          headers: REQUEST_HEADERS,
          productId: PRODUCT_ID,
        })
      ).headers.get("X-Share-Image-Cache"),
    ).toBe("miss");
    expect(
      (
        await handler({
          headers: REQUEST_HEADERS,
          productId: PRODUCT_ID,
        })
      ).headers.get("X-Share-Image-Cache"),
    ).toBe("hit");

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(
      (
        await handler({
          headers: REQUEST_HEADERS,
          productId: PRODUCT_ID,
        })
      ).headers.get("X-Share-Image-Cache"),
    ).toBe("miss");
    expect(renderImage).toHaveBeenCalledTimes(2);
  });

  it("does not serve a cached image after the product is no longer public", async () => {
    let currentProduct: ProductShareImageData | null = product();
    const { client } = fakeClient(() => currentProduct);
    const renderImage = vi.fn(async () => imageResponse());
    const handler = createProductShareImageHandler({
      cache: createWorkCache(),
      checkRateLimit: allowRateLimit,
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage,
    });

    expect((await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID })).status).toBe(200);

    currentProduct = null;
    const missing = await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID });

    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Share-Image-Outcome")).toBe("missing");
    expect(renderImage).toHaveBeenCalledTimes(1);
  });

  it("bounds positive-cache entries and total bytes", async () => {
    const { client } = fakeClient((productId) => product({ id: productId }));
    const cache = createWorkCache({
      positiveMaxBytes: 8,
      positiveMaxEntries: 2,
    });
    const handler = createProductShareImageHandler({
      cache,
      checkRateLimit: allowRateLimit,
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage: async () => imageResponse(),
    });

    for (let index = 1; index <= 3; index += 1) {
      const response = await handler({
        headers: REQUEST_HEADERS,
        productId: productIdFromIndex(index),
      });

      expect(response.status).toBe(200);
    }

    expect(cache.snapshot()).toMatchObject({
      positiveBytes: 8,
      positiveEntries: 2,
    });
  });

  it("fails fast instead of queueing unique renders beyond the concurrency bound", async () => {
    const render = deferred<Response>();
    const { client } = fakeClient((productId) => product({ id: productId }));
    const renderImage = vi.fn(async () => render.promise);
    const cache = createWorkCache({ maxConcurrentRenders: 1 });
    const handler = createProductShareImageHandler({
      cache,
      checkRateLimit: allowRateLimit,
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage,
    });

    const firstPromise = handler({
      headers: REQUEST_HEADERS,
      productId: productIdFromIndex(1),
    });
    await vi.waitFor(() => expect(renderImage).toHaveBeenCalledTimes(1));

    const second = await handler({
      headers: REQUEST_HEADERS,
      productId: productIdFromIndex(2),
    });

    expect(second.status).toBe(503);
    expect(second.headers.get("Cache-Control")).toBe("private, no-store");
    expect(second.headers.get("Retry-After")).toBe("5");
    expect(renderImage).toHaveBeenCalledTimes(1);
    expect(cache.snapshot().inflightRenders).toBe(1);

    render.resolve(imageResponse());
    expect((await firstPromise).status).toBe(200);
    expect(cache.snapshot().inflightRenders).toBe(0);
  });

  it("fails fast instead of queueing unique database lookups beyond the concurrency bound", async () => {
    const lookup = deferred<ProductShareImageData | null>();
    const { client, findFirst } = fakeClient(() => lookup.promise);
    const cache = createWorkCache({ maxConcurrentLookups: 1 });
    const handler = createProductShareImageHandler({
      cache,
      checkRateLimit: allowRateLimit,
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage: async () => imageResponse(),
    });

    const firstPromise = handler({
      headers: REQUEST_HEADERS,
      productId: productIdFromIndex(1),
    });
    await vi.waitFor(() => expect(findFirst).toHaveBeenCalledTimes(1));

    const second = await handler({
      headers: REQUEST_HEADERS,
      productId: productIdFromIndex(2),
    });

    expect(second.status).toBe(503);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(cache.snapshot().inflightLookups).toBe(1);

    lookup.resolve(null);
    expect((await firstPromise).status).toBe(404);
    expect(cache.snapshot().inflightLookups).toBe(0);
  });

  it("does not read an oversized cached WebP", async () => {
    const { client } = fakeClient(product());
    const readImageFile = vi.fn(async () => Uint8Array.of(1));
    const renderImage = vi.fn(async ({ imageBytes }) => {
      expect(imageBytes).toBeNull();

      return imageResponse();
    });
    const cache = createWorkCache({ maxSourceImageBytes: 4 });
    const handler = createProductShareImageHandler({
      cache,
      checkRateLimit: allowRateLimit,
      imageOptions: {
        storageDir: "/cached-products",
        readImageFile,
        readImageMetadata: async () => ({
          byteLength: 5,
          version: "inode:5:mtime-v1",
        }),
      },
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage,
    });

    expect((await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID })).status).toBe(200);
    expect(readImageFile).not.toHaveBeenCalled();
    expect(renderImage).toHaveBeenCalledTimes(1);
  });

  it("does not cache oversized or failed render results", async () => {
    const { client } = fakeClient(product());
    const renderImage = vi
      .fn()
      .mockResolvedValueOnce(imageResponse(Uint8Array.of(1, 2, 3, 4, 5)))
      .mockRejectedValueOnce(new Error("synthetic renderer failure"))
      .mockResolvedValueOnce(imageResponse());
    const cache = createWorkCache({ maxResponseBytes: 4 });
    const handler = createProductShareImageHandler({
      cache,
      checkRateLimit: allowRateLimit,
      loadClient: async () => client,
      observe: vi.fn(),
      renderImage,
    });

    expect((await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID })).status).toBe(503);
    expect(cache.snapshot().positiveEntries).toBe(0);
    expect((await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID })).status).toBe(503);
    expect(cache.snapshot().positiveEntries).toBe(0);
    expect((await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID })).status).toBe(200);
    expect(cache.snapshot().positiveEntries).toBe(1);
  });

  it("rate-limits the metadata-image scope before loading Prisma", async () => {
    const loadClient = vi.fn(async () => fakeClient(product()).client);
    const observe = vi.fn();
    const handler = createProductShareImageHandler({
      cache: createWorkCache(),
      checkRateLimit: denyRateLimit,
      loadClient,
      observe,
      renderImage: vi.fn(async () => imageResponse()),
    });

    const response = await handler({ headers: REQUEST_HEADERS, productId: PRODUCT_ID });

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("X-RateLimit-Client-Source")).toBe("cf");
    expect(response.headers.get("X-Share-Image-Outcome")).toBe("rate_denied");
    expect(loadClient).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        byteLength: 0,
        cacheStatus: "bypass",
        outcome: "rate_denied",
      }),
    );
  });

  it("does not let observability failures change the response", async () => {
    const handler = createProductShareImageHandler({
      cache: createWorkCache(),
      checkRateLimit: allowRateLimit,
      loadClient: vi.fn(async () => fakeClient(product()).client),
      observe: () => {
        throw new Error("synthetic log sink failure");
      },
      renderImage: vi.fn(async () => imageResponse()),
    });

    const response = await handler({
      headers: REQUEST_HEADERS,
      productId: "invalid",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Share-Image-Outcome")).toBe("invalid");
  });
});

function createWorkCache(
  overrides: Partial<ProductShareImageWorkCacheConfig> = {},
): ProductShareImageWorkCache {
  return new ProductShareImageWorkCache({
    maxConcurrentLookups: 4,
    maxConcurrentRenders: 2,
    maxResponseBytes: 1024,
    maxSourceImageBytes: 1024,
    negativeMaxEntries: 8,
    negativeTtlMs: 60_000,
    positiveMaxBytes: 1024,
    positiveMaxEntries: 8,
    positiveTtlMs: 300_000,
    ...overrides,
  });
}

function fakeClient(
  result:
    | ProductShareImageData
    | null
    | ((productId: string) => ProductShareImageData | null | Promise<ProductShareImageData | null>),
) {
  const findFirst = vi.fn(
    async (args: Parameters<ProductShareImageClient["product"]["findFirst"]>[0]) =>
      typeof result === "function" ? result(args.where.id) : result,
  );

  return {
    client: {
      product: {
        findFirst,
      },
    } as ProductShareImageClient,
    findFirst,
  };
}

function product(overrides: Partial<ProductShareImageData> = {}): ProductShareImageData {
  return {
    id: PRODUCT_ID,
    name: "GPU RTX 4070",
    currentPrice: {
      lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
      priceSnapshot: {
        price: 6990,
      },
    },
    sourceCategory: {
      displayName: "顯示卡",
    },
    ...overrides,
  };
}

function productIdFromIndex(index: number): string {
  return `00000000-0000-0000-0000-${index.toString(16).padStart(12, "0")}`;
}

function imageResponse(bytes: Uint8Array<ArrayBuffer> = RESPONSE_BYTES): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
    },
  });
}

function allowRateLimit(): RateLimitCheck {
  return {
    decision: rateLimitDecision(true),
    response: null,
  };
}

function denyRateLimit(): RateLimitCheck {
  const decision = rateLimitDecision(false);

  return {
    decision,
    response: new Response(null, { status: 429 }),
  };
}

function rateLimitDecision(allowed: boolean): RateLimitDecision {
  return {
    allowed,
    clientIdentifierHash: "sanitized-hash",
    clientIdentifierSource: "cf",
    limit: 60,
    remaining: allowed ? 59 : 0,
    resetEpochSeconds: 60,
    retryAfterSeconds: 60,
    scope: "metadata:image",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}
