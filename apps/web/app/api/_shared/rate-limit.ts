import { LRUCache } from "lru-cache";

import { rateLimitedResponse } from "./responses";

export type RateLimitScope = "api:read" | "api:list" | "api:image";

export const RATE_LIMIT_DEFAULTS = {
  readMax: 120,
  listMax: 360,
  imageMax: 360,
  windowSeconds: 60,
  cacheSize: 5000,
} as const;

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

export interface RateLimitConfig {
  cacheSize: number;
  limits: Record<RateLimitScope, number>;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  config?: RateLimitConfig;
  nowMs?: () => number;
}

export interface RateLimiter {
  check(request: Request, scope: RateLimitScope): RateLimitDecision;
}

type RateLimitEnv = Partial<Record<string, string>>;

export function checkRateLimit(request: Request, scope: RateLimitScope): Response | null {
  const decision = getGlobalRateLimiter().check(request, scope);

  if (decision.allowed) {
    return null;
  }

  return rateLimitedResponse(decision);
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const config = options.config ?? resolveRateLimitConfig();
  const nowMs = options.nowMs ?? Date.now;
  const buckets = new LRUCache<string, RateLimitBucket>({ max: config.cacheSize });

  return {
    check(request, scope) {
      const now = nowMs();
      const limit = config.limits[scope];
      const key = `${scope}:${getClientIdentifier(request)}`;
      const existingBucket = buckets.get(key);
      const bucket =
        existingBucket && existingBucket.resetAtMs > now
          ? existingBucket
          : { count: 0, resetAtMs: now + config.windowMs };
      const resetEpochSeconds = Math.ceil(bucket.resetAtMs / 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));

      if (bucket.count >= limit) {
        buckets.set(key, bucket);

        return {
          allowed: false,
          limit,
          remaining: 0,
          resetEpochSeconds,
          retryAfterSeconds,
        };
      }

      bucket.count += 1;
      buckets.set(key, bucket);

      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetEpochSeconds,
        retryAfterSeconds,
      };
    },
  };
}

export function resolveRateLimitConfig(env: RateLimitEnv = process.env): RateLimitConfig {
  const readMax = readPositiveInteger(env.API_READ_RATE_LIMIT_MAX, RATE_LIMIT_DEFAULTS.readMax);
  const listMax = readPositiveInteger(env.API_LIST_RATE_LIMIT_MAX, RATE_LIMIT_DEFAULTS.listMax);
  const imageMax = readPositiveInteger(env.API_IMAGE_RATE_LIMIT_MAX, RATE_LIMIT_DEFAULTS.imageMax);
  const windowSeconds = readPositiveInteger(
    env.API_RATE_LIMIT_WINDOW_SECONDS,
    RATE_LIMIT_DEFAULTS.windowSeconds,
  );
  const cacheSize = readPositiveInteger(
    env.API_RATE_LIMIT_CACHE_SIZE,
    RATE_LIMIT_DEFAULTS.cacheSize,
  );

  return {
    cacheSize,
    limits: {
      "api:read": readMax,
      "api:list": listMax,
      "api:image": imageMax,
    },
    windowMs: windowSeconds * 1000,
  };
}

export function getClientIdentifier(request: Request): string {
  const cloudflareIp = firstHeaderValue(request.headers.get("CF-Connecting-IP"));

  if (cloudflareIp) {
    return cloudflareIp;
  }

  return firstHeaderValue(request.headers.get("X-Forwarded-For")) ?? "unknown";
}

let globalRateLimiter: RateLimiter | null = null;

function getGlobalRateLimiter(): RateLimiter {
  globalRateLimiter ??= createRateLimiter();

  return globalRateLimiter;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const trimmedValue = value?.trim();

  if (!trimmedValue || !/^\d+$/.test(trimmedValue)) {
    return fallback;
  }

  const parsedValue = Number.parseInt(trimmedValue, 10);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function firstHeaderValue(value: string | null): string | null {
  const firstValue = value?.split(",")[0]?.trim();

  return firstValue || null;
}
