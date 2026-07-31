// apps/web/tests/api/_shared/rate-limit.test.ts
// 驗證 public API rate limiter 的 client 來源判斷、scope 分桶、env 設定與公開 headers。

import { describe, expect, it } from "vitest";

import {
  checkRateLimit,
  createRateLimitDenialLogger,
  createRateLimiter,
  getClientIdentifier,
  getClientIdentifierInfo,
  RATE_LIMIT_DEFAULTS,
  RATE_LIMIT_LOG_DEFAULTS,
  type RateLimitConfig,
  type RateLimitDecision,
  type RateLimitLogEntry,
  resolveRateLimitConfig,
  withRateLimitHeaders,
} from "../../../app/api/_shared/rate-limit";

const BASE_CONFIG: RateLimitConfig = {
  cacheSize: 10,
  limits: {
    "api:read": 2,
    "api:list": 3,
    "api:list:movement": 1,
    "api:image": 4,
    "api:build-list": 2,
    "metadata:image": 1,
  },
  windowMs: 1000,
};

describe("API rate limiter", () => {
  it("uses one valid Cloudflare client IP in production and ignores forged XFF", () => {
    const request = new Request("https://partsradar.test/api/products", {
      headers: {
        "CF-Connecting-IP": "203.0.113.10",
        "X-Forwarded-For": "198.51.100.1",
      },
    });

    expect(getClientIdentifier(request, "production")).toBe("203.0.113.10");
    expect(getClientIdentifierInfo(request, "production")).toEqual({
      source: "cf",
      value: "203.0.113.10",
    });
  });

  it("does not trust XFF when the production Cloudflare header is missing", () => {
    const request = new Request("https://partsradar.test/api/products", {
      headers: {
        "X-Forwarded-For": "198.51.100.1",
      },
    });

    expect(getClientIdentifier(request, "production")).toBe("unknown");
    expect(getClientIdentifierInfo(request, "production")).toEqual({
      source: "unknown",
      value: "unknown",
    });
  });

  it("rejects malformed and multi-value Cloudflare client headers", () => {
    for (const value of [
      "not-an-ip",
      "203.0.113.10, 198.51.100.1",
      "203.0.113.10:443",
      "127.0.0.1 trailing",
    ]) {
      const request = new Request("https://partsradar.test/api/products", {
        headers: {
          "CF-Connecting-IP": value,
          "X-Forwarded-For": "198.51.100.1",
        },
      });

      expect(getClientIdentifierInfo(request, "production")).toEqual({
        source: "unknown",
        value: "unknown",
      });
    }
  });

  it("uses a single valid local or E2E XFF only outside production", () => {
    const localRequest = new Request("http://127.0.0.1:3000/api/products", {
      headers: { "X-Forwarded-For": "127.0.0.1" },
    });
    const e2eRequest = new Request("http://127.0.0.1:3100/api/products", {
      headers: { "X-Forwarded-For": "2001:db8::10" },
    });

    expect(getClientIdentifierInfo(localRequest, "development")).toEqual({
      source: "xff",
      value: "127.0.0.1",
    });
    expect(getClientIdentifierInfo(e2eRequest, "test")).toEqual({
      source: "xff",
      value: "2001:db8::10",
    });
    expect(
      getClientIdentifierInfo(
        new Request("http://127.0.0.1:3100/api/products", {
          headers: { "X-Forwarded-For": "127.0.0.1, 10.0.0.2" },
        }),
        "test",
      ),
    ).toEqual({ source: "unknown", value: "unknown" });
  });

  it("falls back to an anonymous bucket when no client address is available", () => {
    const request = new Request("https://partsradar.test/api/products");

    expect(getClientIdentifier(request)).toBe("unknown");
    expect(getClientIdentifierInfo(request)).toEqual({
      source: "unknown",
      value: "unknown",
    });
  });

  it("limits read requests per client within a fixed window", () => {
    let nowMs = 1_000_000;
    const limiter = createRateLimiter({
      config: BASE_CONFIG,
      nowMs: () => nowMs,
    });
    const request = requestFromIp("203.0.113.10");

    expect(limiter.check(request, "api:read")).toMatchObject({
      allowed: true,
      clientIdentifierSource: "cf",
      limit: 2,
      remaining: 1,
      scope: "api:read",
    });
    expect(limiter.check(request, "api:read")).toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 0,
    });
    expect(limiter.check(request, "api:read")).toMatchObject({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 1,
    });

    nowMs += 1000;

    expect(limiter.check(request, "api:read")).toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
    });
  });

  it("keeps list, image, read, and build-list scopes independent", () => {
    const limiter = createRateLimiter({ config: BASE_CONFIG, nowMs: () => 1_000_000 });
    const request = requestFromIp("203.0.113.20");

    expect(limiter.check(request, "api:read")).toMatchObject({ allowed: true });
    expect(limiter.check(request, "api:read")).toMatchObject({ allowed: true });
    expect(limiter.check(request, "api:read")).toMatchObject({ allowed: false });
    expect(limiter.check(request, "api:list")).toMatchObject({
      allowed: true,
      limit: 3,
      remaining: 2,
    });
    expect(limiter.check(request, "api:list:movement")).toMatchObject({
      allowed: true,
      limit: 1,
      remaining: 0,
    });
    expect(limiter.check(request, "api:list:movement")).toMatchObject({ allowed: false });
    expect(limiter.check(request, "api:image")).toMatchObject({
      allowed: true,
      limit: 4,
      remaining: 3,
    });
    expect(limiter.check(request, "api:build-list")).toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
    });
    expect(limiter.check(request, "metadata:image")).toMatchObject({
      allowed: true,
      limit: 1,
      remaining: 0,
    });
    expect(limiter.check(request, "metadata:image")).toMatchObject({
      allowed: false,
      limit: 1,
      remaining: 0,
    });
  });

  it("allows normal pageSize 50 browsing bursts with independent list and image budgets", () => {
    const limiter = createRateLimiter({
      config: resolveRateLimitConfig({}),
      nowMs: () => 1_000_000,
    });
    const request = requestFromIp("203.0.113.21");
    const listPageChanges = 20;
    const imagesPerPage = 50;

    expect(RATE_LIMIT_DEFAULTS.listMax).toBeGreaterThan(listPageChanges);
    expect(RATE_LIMIT_DEFAULTS.movementListMax).toBeLessThan(RATE_LIMIT_DEFAULTS.listMax);
    expect(RATE_LIMIT_DEFAULTS.imageMax).toBeGreaterThan(listPageChanges * imagesPerPage);
    expect(limiter.check(request, "api:list")).toMatchObject({
      allowed: true,
      limit: RATE_LIMIT_DEFAULTS.listMax,
    });
    expect(limiter.check(request, "api:image")).toMatchObject({
      allowed: true,
      limit: RATE_LIMIT_DEFAULTS.imageMax,
    });
  });

  it("does not share buckets across clients", () => {
    const limiter = createRateLimiter({ config: BASE_CONFIG, nowMs: () => 1_000_000 });

    expect(limiter.check(requestFromIp("203.0.113.30"), "api:read")).toMatchObject({
      allowed: true,
    });
    expect(limiter.check(requestFromIp("203.0.113.30"), "api:read")).toMatchObject({
      allowed: true,
    });
    expect(limiter.check(requestFromIp("203.0.113.31"), "api:read")).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });

  it("reads valid env limits and falls back for invalid values", () => {
    expect(
      resolveRateLimitConfig({
        API_READ_RATE_LIMIT_MAX: "250",
        API_LIST_RATE_LIMIT_MAX: "500",
        API_PRODUCT_MOVEMENT_RATE_LIMIT_MAX: "25",
        API_IMAGE_RATE_LIMIT_MAX: "900",
        SHARE_IMAGE_RATE_LIMIT_MAX: "45",
        API_RATE_LIMIT_WINDOW_SECONDS: "120",
        API_RATE_LIMIT_CACHE_SIZE: "7000",
      }),
    ).toEqual({
      cacheSize: 7000,
      limits: {
        "api:read": 250,
        "api:list": 500,
        "api:list:movement": 25,
        "api:image": 900,
        "api:build-list": 250,
        "metadata:image": 45,
      },
      windowMs: 120_000,
    });

    expect(
      resolveRateLimitConfig({
        API_READ_RATE_LIMIT_MAX: "0",
        API_LIST_RATE_LIMIT_MAX: "bad",
        API_IMAGE_RATE_LIMIT_MAX: "not-a-number",
        SHARE_IMAGE_RATE_LIMIT_MAX: "0",
        API_RATE_LIMIT_WINDOW_SECONDS: "-1",
        API_RATE_LIMIT_CACHE_SIZE: "",
      }),
    ).toEqual({
      cacheSize: RATE_LIMIT_DEFAULTS.cacheSize,
      limits: {
        "api:read": RATE_LIMIT_DEFAULTS.readMax,
        "api:list": RATE_LIMIT_DEFAULTS.listMax,
        "api:list:movement": RATE_LIMIT_DEFAULTS.movementListMax,
        "api:image": RATE_LIMIT_DEFAULTS.imageMax,
        "api:build-list": RATE_LIMIT_DEFAULTS.readMax,
        "metadata:image": RATE_LIMIT_DEFAULTS.metadataImageMax,
      },
      windowMs: RATE_LIMIT_DEFAULTS.windowSeconds * 1000,
    });
  });

  it("adds public rate limit headers to successful responses", () => {
    const limiter = createRateLimiter({ config: BASE_CONFIG, nowMs: () => 1_000_000 });
    const decision = limiter.check(requestFromIp("203.0.113.40"), "api:image");
    const response = withRateLimitHeaders(Response.json({ ok: true }), decision);

    expect(response.headers.get("X-RateLimit-Client-Source")).toBe("cf");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("4");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("3");
    expect(response.headers.get("X-RateLimit-Reset")).toBe("1001");
  });

  it("bounds repeated denial logs and summarizes the exact suppressed count on rollover", async () => {
    let nowMs = 1_000_000;
    const limiter = createRateLimiter({
      config: {
        ...BASE_CONFIG,
        limits: { ...BASE_CONFIG.limits, "api:read": 1 },
      },
      nowMs: () => nowMs,
    });
    const entries: RateLimitLogEntry[] = [];
    const logger = createRateLimitDenialLogger({
      nowMs: () => nowMs,
      write: (entry) => entries.push(entry),
    });
    const request = requestFromIp("203.0.113.50");

    expect(
      checkRateLimit(request, "api:read", { limiter, denialLogger: logger }).response,
    ).toBeNull();

    let deniedResponse: Response | null = null;

    for (let index = 0; index < 1000; index += 1) {
      deniedResponse = checkRateLimit(request, "api:read", {
        limiter,
        denialLogger: logger,
      }).response;
    }

    expect(entries).toHaveLength(RATE_LIMIT_LOG_DEFAULTS.individualDenialsPerWindow);
    expect(entries[0]).toMatchObject({
      event: "api_rate_limited",
      scope: "api:read",
      clientIdentifierSource: "cf",
    });
    expect(entries[0]).not.toHaveProperty("clientIdentifier");
    expect(JSON.stringify(entries[0])).not.toContain("203.0.113.50");
    expect(deniedResponse?.status).toBe(429);
    expect(deniedResponse?.headers.get("Retry-After")).toBe("1");
    expect(deniedResponse?.headers.get("X-RateLimit-Client-Source")).toBe("cf");
    expect(deniedResponse?.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(deniedResponse?.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(deniedResponse?.headers.get("X-RateLimit-Reset")).toBe("1001");
    await expect(deniedResponse?.json()).resolves.toEqual({
      error: {
        code: "rate_limited",
        message: "Too many requests. Please try again later.",
      },
    });

    nowMs += 1000;
    expect(
      checkRateLimit(request, "api:read", { limiter, denialLogger: logger }).response,
    ).toBeNull();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      event: "api_rate_limit_suppressed",
      scope: "api:read",
      suppressedCount: 999,
    });
    expect(logger.stateSize()).toBe(0);
  });

  it("keeps suppression state bounded under unique-key churn without refreshing evicted budgets", () => {
    let nowMs = 1_000_000;
    const entries: RateLimitLogEntry[] = [];
    const logger = createRateLimitDenialLogger({
      individualDenialsPerWindow: 0,
      nowMs: () => nowMs,
      stateCapacity: 3,
      write: (entry) => entries.push(entry),
    });

    for (let index = 0; index < 1000; index += 1) {
      const entryCountBefore = entries.length;
      logger.observe(deniedDecision(`hash-${index}`, 1001));
      expect(logger.stateSize()).toBeLessThanOrEqual(3);
      expect(entries.length - entryCountBefore).toBe(0);
    }

    expect(logger.stateSize()).toBe(1);
    expect(entries).toHaveLength(0);

    nowMs = 1_001_000;
    logger.observe(allowedDecision("after-saturation", 1002));

    expect(entries).toEqual([
      expect.objectContaining({
        event: "api_rate_limit_saturated",
        scope: "api:read",
        suppressedCount: 1000,
      }),
    ]);
    expect(logger.stateSize()).toBe(0);

    const saturationEntries: RateLimitLogEntry[] = [];
    const saturationLogger = createRateLimitDenialLogger({
      nowMs: () => nowMs,
      stateCapacity: 1,
      write: (entry) => saturationEntries.push(entry),
    });
    saturationLogger.observe(deniedDecision("first-hash", 1002));
    saturationLogger.observe(deniedDecision("first-hash", 1002));
    saturationLogger.observe(deniedDecision("second-hash", 1002));
    saturationLogger.observe(deniedDecision("first-hash", 1002));

    expect(saturationEntries).toHaveLength(1);
    expect(saturationLogger.stateSize()).toBe(1);

    nowMs = 1_002_000;
    const entryCountBeforeSaturationExit = saturationEntries.length;
    saturationLogger.observe(deniedDecision("next-window-hash", 1003));

    expect(saturationEntries.length - entryCountBeforeSaturationExit).toBe(2);
    expect(saturationEntries.slice(-2)).toEqual([
      expect.objectContaining({
        event: "api_rate_limit_saturated",
        suppressedCount: 3,
      }),
      expect.objectContaining({
        event: "api_rate_limited",
        clientIdentifierHash: "next-window-hash",
      }),
    ]);
    expect(saturationLogger.stateSize()).toBe(1);
  });

  it("starts a fresh fixed log budget after each limiter window", () => {
    const entries: RateLimitLogEntry[] = [];
    const logger = createRateLimitDenialLogger({ write: (entry) => entries.push(entry) });

    logger.observe(deniedDecision("same-hash", 1001));
    logger.observe(deniedDecision("same-hash", 1001));
    logger.observe(deniedDecision("same-hash", 1002));

    expect(entries).toEqual([
      expect.objectContaining({ event: "api_rate_limited", resetEpochSeconds: 1001 }),
      expect.objectContaining({
        event: "api_rate_limit_suppressed",
        resetEpochSeconds: 1001,
        suppressedCount: 1,
      }),
      expect.objectContaining({ event: "api_rate_limited", resetEpochSeconds: 1002 }),
    ]);
    expect(logger.stateSize()).toBe(1);
  });

  it("preserves the 429 contract when every log write fails", async () => {
    const limiter = createRateLimiter({
      config: {
        ...BASE_CONFIG,
        limits: { ...BASE_CONFIG.limits, "api:read": 1 },
      },
      nowMs: () => 1_000_000,
    });
    const logger = createRateLimitDenialLogger({
      write: () => {
        throw new Error("logger unavailable");
      },
    });
    const request = requestFromIp("203.0.113.60");

    expect(() => logger.observe(deniedDecision("sink-failure", 1001))).not.toThrow();

    expect(
      checkRateLimit(request, "api:read", { limiter, denialLogger: logger }).response,
    ).toBeNull();
    const response = checkRateLimit(request, "api:read", {
      limiter,
      denialLogger: logger,
    }).response;

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("1");
    expect(response?.headers.get("X-RateLimit-Client-Source")).toBe("cf");
    expect(response?.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(response?.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response?.headers.get("X-RateLimit-Reset")).toBe("1001");
    await expect(response?.json()).resolves.toEqual({
      error: {
        code: "rate_limited",
        message: "Too many requests. Please try again later.",
      },
    });

    const throwingLogger = {
      observe() {
        throw new Error("logger state unavailable");
      },
      stateSize() {
        return 0;
      },
    };
    const limiterWithThrowingLogger = createRateLimiter({
      config: {
        ...BASE_CONFIG,
        limits: { ...BASE_CONFIG.limits, "api:read": 1 },
      },
      nowMs: () => 1_000_000,
    });
    const throwingLoggerRequest = requestFromIp("203.0.113.61");

    expect(
      checkRateLimit(throwingLoggerRequest, "api:read", {
        limiter: limiterWithThrowingLogger,
        denialLogger: throwingLogger,
      }).response,
    ).toBeNull();
    expect(
      checkRateLimit(throwingLoggerRequest, "api:read", {
        limiter: limiterWithThrowingLogger,
        denialLogger: throwingLogger,
      }).response?.status,
    ).toBe(429);
  });
});

function requestFromIp(ip: string): Request {
  return new Request("https://partsradar.test/api/products", {
    headers: {
      "CF-Connecting-IP": ip,
    },
  });
}

function deniedDecision(
  clientIdentifierHash: string,
  resetEpochSeconds: number,
): RateLimitDecision {
  return {
    allowed: false,
    clientIdentifierHash,
    clientIdentifierSource: "cf",
    limit: 1,
    remaining: 0,
    resetEpochSeconds,
    retryAfterSeconds: 1,
    scope: "api:read",
  };
}

function allowedDecision(
  clientIdentifierHash: string,
  resetEpochSeconds: number,
): RateLimitDecision {
  return {
    ...deniedDecision(clientIdentifierHash, resetEpochSeconds),
    allowed: true,
    remaining: 1,
  };
}
