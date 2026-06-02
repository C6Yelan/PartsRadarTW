import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";

import { internalErrorResponse, rateLimitedResponse } from "./responses";

export type RateLimitScope = "api:read" | "api:list" | "api:image";
export type ClientIdentifierSource = "cf" | "xff" | "unknown";

export const RATE_LIMIT_DEFAULTS = {
  readMax: 120,
  listMax: 360,
  imageMax: 1200,
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
  clientIdentifierHash: string;
  clientIdentifierSource: ClientIdentifierSource;
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
  retryAfterSeconds: number;
  scope: RateLimitScope;
}

export interface RateLimiterOptions {
  config?: RateLimitConfig;
  nowMs?: () => number;
}

export interface RateLimiter {
  check(request: Request, scope: RateLimitScope): RateLimitDecision;
}

export interface RateLimitCheck {
  decision: RateLimitDecision;
  response: Response | null;
}

type RateLimitEnv = Partial<Record<string, string>>;

export async function withRateLimit(
  request: Request,
  scope: RateLimitScope,
  next: () => Promise<Response>,
): Promise<Response> {
  const check = checkRateLimit(request, scope);

  if (check.response) {
    return check.response;
  }

  try {
    return withRateLimitHeaders(await next(), check.decision);
  } catch {
    return withRateLimitHeaders(internalErrorResponse(), check.decision);
  }
}

export function checkRateLimit(request: Request, scope: RateLimitScope): RateLimitCheck {
  const decision = getGlobalRateLimiter().check(request, scope);

  if (decision.allowed) {
    return {
      decision,
      response: null,
    };
  }

  logRateLimitedDecision(decision);

  return {
    decision,
    response: withRateLimitHeaders(rateLimitedResponse(decision), decision),
  };
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const config = options.config ?? resolveRateLimitConfig();
  const nowMs = options.nowMs ?? Date.now;
  const buckets = new LRUCache<string, RateLimitBucket>({ max: config.cacheSize });

  return {
    check(request, scope) {
      const now = nowMs();
      const limit = config.limits[scope];
      const clientIdentifier = getClientIdentifierInfo(request);
      const clientIdentifierHash = hashClientIdentifier(clientIdentifier.value);
      const key = `${scope}:${clientIdentifier.value}`;
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
          clientIdentifierHash,
          clientIdentifierSource: clientIdentifier.source,
          limit,
          remaining: 0,
          resetEpochSeconds,
          retryAfterSeconds,
          scope,
        };
      }

      bucket.count += 1;
      buckets.set(key, bucket);

      return {
        allowed: true,
        clientIdentifierHash,
        clientIdentifierSource: clientIdentifier.source,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetEpochSeconds,
        retryAfterSeconds,
        scope,
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
  return getClientIdentifierInfo(request).value;
}

export function getClientIdentifierInfo(request: Request): {
  source: ClientIdentifierSource;
  value: string;
} {
  const cloudflareIp = firstHeaderValue(request.headers.get("CF-Connecting-IP"));

  if (cloudflareIp) {
    return {
      source: "cf",
      value: cloudflareIp,
    };
  }

  const forwardedForIp = firstHeaderValue(request.headers.get("X-Forwarded-For"));

  if (forwardedForIp) {
    return {
      source: "xff",
      value: forwardedForIp,
    };
  }

  return {
    source: "unknown",
    value: "unknown",
  };
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "X-RateLimit-Client-Source": decision.clientIdentifierSource,
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(decision.resetEpochSeconds),
  };
}

export function withRateLimitHeaders(response: Response, decision: RateLimitDecision): Response {
  for (const [name, value] of Object.entries(rateLimitHeaders(decision))) {
    response.headers.set(name, value);
  }

  return response;
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

function hashClientIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function logRateLimitedDecision(decision: RateLimitDecision): void {
  process.stderr.write(
    `${JSON.stringify({
      event: "api_rate_limited",
      scope: decision.scope,
      limit: decision.limit,
      remaining: decision.remaining,
      resetEpochSeconds: decision.resetEpochSeconds,
      retryAfterSeconds: decision.retryAfterSeconds,
      clientIdentifierSource: decision.clientIdentifierSource,
      clientIdentifierHash: decision.clientIdentifierHash,
    })}\n`,
  );
}
