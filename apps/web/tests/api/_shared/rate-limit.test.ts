// apps/web/tests/api/_shared/rate-limit.test.ts
import { describe, expect, it } from "vitest";

import {
  createRateLimiter,
  getClientIdentifier,
  getClientIdentifierInfo,
  RATE_LIMIT_DEFAULTS,
  resolveRateLimitConfig,
  type RateLimitConfig,
  withRateLimitHeaders,
} from "../../../app/api/_shared/rate-limit";

const BASE_CONFIG: RateLimitConfig = {
  cacheSize: 10,
  limits: {
    "api:read": 2,
    "api:list": 3,
    "api:image": 4,
  },
  windowMs: 1000,
};

describe("API rate limiter", () => {
  it("prefers Cloudflare client IP over x-forwarded-for", () => {
    const request = new Request("https://partsradar.test/api/products", {
      headers: {
        "CF-Connecting-IP": "203.0.113.10",
        "X-Forwarded-For": "198.51.100.1, 198.51.100.2",
      },
    });

    expect(getClientIdentifier(request)).toBe("203.0.113.10");
    expect(getClientIdentifierInfo(request)).toEqual({
      source: "cf",
      value: "203.0.113.10",
    });
  });

  it("uses the first x-forwarded-for value when Cloudflare IP is unavailable", () => {
    const request = new Request("https://partsradar.test/api/products", {
      headers: {
        "X-Forwarded-For": "198.51.100.1, 198.51.100.2",
      },
    });

    expect(getClientIdentifier(request)).toBe("198.51.100.1");
    expect(getClientIdentifierInfo(request)).toEqual({
      source: "xff",
      value: "198.51.100.1",
    });
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

  it("keeps list, image, and read scopes independent", () => {
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
    expect(limiter.check(request, "api:image")).toMatchObject({
      allowed: true,
      limit: 4,
      remaining: 3,
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

    for (let page = 0; page < listPageChanges; page += 1) {
      expect(limiter.check(request, "api:list")).toMatchObject({
        allowed: true,
        limit: RATE_LIMIT_DEFAULTS.listMax,
      });

      for (let image = 0; image < imagesPerPage; image += 1) {
        expect(limiter.check(request, "api:image")).toMatchObject({
          allowed: true,
          limit: RATE_LIMIT_DEFAULTS.imageMax,
        });
      }
    }

    expect(limiter.check(request, "api:list")).toMatchObject({
      allowed: true,
      remaining: RATE_LIMIT_DEFAULTS.listMax - listPageChanges - 1,
    });
    expect(limiter.check(request, "api:image")).toMatchObject({
      allowed: true,
      remaining: RATE_LIMIT_DEFAULTS.imageMax - listPageChanges * imagesPerPage - 1,
    });
    expect(limiter.check(request, "api:read")).toMatchObject({
      allowed: true,
      remaining: RATE_LIMIT_DEFAULTS.readMax - 1,
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
        API_IMAGE_RATE_LIMIT_MAX: "900",
        API_RATE_LIMIT_WINDOW_SECONDS: "120",
        API_RATE_LIMIT_CACHE_SIZE: "7000",
      }),
    ).toEqual({
      cacheSize: 7000,
      limits: {
        "api:read": 250,
        "api:list": 500,
        "api:image": 900,
      },
      windowMs: 120_000,
    });

    expect(
      resolveRateLimitConfig({
        API_READ_RATE_LIMIT_MAX: "0",
        API_LIST_RATE_LIMIT_MAX: "bad",
        API_IMAGE_RATE_LIMIT_MAX: "not-a-number",
        API_RATE_LIMIT_WINDOW_SECONDS: "-1",
        API_RATE_LIMIT_CACHE_SIZE: "",
      }),
    ).toEqual({
      cacheSize: RATE_LIMIT_DEFAULTS.cacheSize,
      limits: {
        "api:read": RATE_LIMIT_DEFAULTS.readMax,
        "api:list": RATE_LIMIT_DEFAULTS.listMax,
        "api:image": RATE_LIMIT_DEFAULTS.imageMax,
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
});

function requestFromIp(ip: string): Request {
  return new Request("https://partsradar.test/api/products", {
    headers: {
      "CF-Connecting-IP": ip,
    },
  });
}
