// apps/web/app/api/_shared/rate-limit.ts
// 提供 public web API 共用的 in-memory rate limit，依 API scope 與 client identifier 控制請求量。

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { LRUCache } from "lru-cache";

import { internalErrorResponse, rateLimitedResponse } from "./responses";

export type RateLimitScope =
  | "api:read"
  | "api:list"
  | "api:list:movement"
  | "api:image"
  | "api:build-list"
  | "metadata:image";
export type ClientIdentifierSource = "cf" | "xff" | "unknown";

export const RATE_LIMIT_DEFAULTS = {
  readMax: 120,
  listMax: 360,
  movementListMax: 30,
  imageMax: 1200,
  metadataImageMax: 60,
  windowSeconds: 60,
  cacheSize: 5000,
} as const;

export const RATE_LIMIT_LOG_DEFAULTS = {
  individualDenialsPerWindow: 1,
  saturationSummaryIntervalMs: 60_000,
  stateCapacity: 256,
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

export interface RateLimitDenialLoggerOptions {
  individualDenialsPerWindow?: number;
  nowMs?: () => number;
  stateCapacity?: number;
  write?: (entry: RateLimitLogEntry) => void;
}

export interface RateLimitDenialLogger {
  observe(decision: RateLimitDecision): void;
  stateSize(): number;
}

export interface RateLimitLogEntry {
  clientIdentifierHash?: string;
  clientIdentifierSource?: ClientIdentifierSource;
  event: "api_rate_limited" | "api_rate_limit_suppressed" | "api_rate_limit_saturated";
  limit?: number;
  remaining?: number;
  resetEpochSeconds?: number;
  retryAfterSeconds?: number;
  scope: RateLimitScope;
  suppressedCount?: number;
}

export interface RateLimitRequest {
  headers: Pick<Headers, "get">;
}

export interface RateLimiter {
  check(request: RateLimitRequest, scope: RateLimitScope): RateLimitDecision;
}

export interface RateLimitCheck {
  decision: RateLimitDecision;
  response: Response | null;
}

interface RateLimitCheckDependencies {
  denialLogger?: RateLimitDenialLogger;
  limiter?: RateLimiter;
}

interface RateLimitDenialLogState {
  decision: RateLimitDecision;
  individualLogs: number;
  suppressedCount: number;
}

interface RateLimitLogSaturationState {
  nextSummaryAtMs: number;
  suppressedByScope: Record<RateLimitScope, number>;
  untilMs: number;
}

type RateLimitEnv = Partial<Record<string, string>>;

// 包裝 API handler，負責在執行前檢查 rate limit，並為成功或錯誤回應補上公開限流 headers。
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

// 執行單次 rate limit 判斷；被擋時直接產生 429 response 並記錄 sanitized log。
export function checkRateLimit(
  request: RateLimitRequest,
  scope: RateLimitScope,
  dependencies: RateLimitCheckDependencies = {},
): RateLimitCheck {
  const decision = (dependencies.limiter ?? getGlobalRateLimiter()).check(request, scope);

  try {
    (dependencies.denialLogger ?? getGlobalRateLimitDenialLogger()).observe(decision);
  } catch {
    // The limiter response contract must not depend on observability state or sink health.
  }

  if (decision.allowed) {
    return {
      decision,
      response: null,
    };
  }

  return {
    decision,
    response: withRateLimitHeaders(rateLimitedResponse(decision), decision),
  };
}

// 每個 client/scope/window 只輸出固定數量的個別 denial，其餘在 state rollover 時彙整成
// 一筆 exact count；unique-key churn 達容量後切到固定週期的全域 aggregation，並持續到
// 所有已觀察 window 結束，避免 LRU eviction 重新取得個別 log budget。
export function createRateLimitDenialLogger(
  options: RateLimitDenialLoggerOptions = {},
): RateLimitDenialLogger {
  const individualDenialsPerWindow = readBoundedNonNegativeInteger(
    options.individualDenialsPerWindow,
    RATE_LIMIT_LOG_DEFAULTS.individualDenialsPerWindow,
    RATE_LIMIT_LOG_DEFAULTS.individualDenialsPerWindow,
  );
  const stateCapacity = readBoundedPositiveInteger(
    options.stateCapacity,
    RATE_LIMIT_LOG_DEFAULTS.stateCapacity,
    RATE_LIMIT_LOG_DEFAULTS.stateCapacity,
  );
  const nowMs = options.nowMs ?? Date.now;
  const write = options.write ?? writeRateLimitLogEntry;
  const states = new LRUCache<string, RateLimitDenialLogState>({ max: stateCapacity });
  let saturation: RateLimitLogSaturationState | null = null;

  function safeWrite(entry: RateLimitLogEntry): void {
    try {
      write(entry);
    } catch {
      // Observability failures must never change the public API response.
    }
  }

  function flushSuppressed(state: RateLimitDenialLogState): void {
    if (state.suppressedCount === 0) {
      return;
    }

    safeWrite({
      ...rateLimitLogEntry(state.decision),
      event: "api_rate_limit_suppressed",
      suppressedCount: state.suppressedCount,
    });
  }

  function incrementSuppressedCount(
    suppressedByScope: Record<RateLimitScope, number>,
    scope: RateLimitScope,
    increment = 1,
  ): void {
    suppressedByScope[scope] = Math.min(
      Number.MAX_SAFE_INTEGER,
      suppressedByScope[scope] + increment,
    );
  }

  function flushSaturation(state: RateLimitLogSaturationState): void {
    for (const scope of RATE_LIMIT_SCOPES) {
      const suppressedCount = state.suppressedByScope[scope];

      if (suppressedCount > 0) {
        safeWrite({
          event: "api_rate_limit_saturated",
          scope,
          suppressedCount,
        });
      }
    }

    state.suppressedByScope = emptySuppressedCounts();
  }

  function enterSaturation(decision: RateLimitDecision, now: number): void {
    const suppressedByScope = emptySuppressedCounts();
    let untilMs = decision.resetEpochSeconds * 1000;

    for (const state of states.values()) {
      incrementSuppressedCount(suppressedByScope, state.decision.scope, state.suppressedCount);
      untilMs = Math.max(untilMs, state.decision.resetEpochSeconds * 1000);
    }

    incrementSuppressedCount(suppressedByScope, decision.scope);
    states.clear();
    saturation = {
      nextSummaryAtMs: now + RATE_LIMIT_LOG_DEFAULTS.saturationSummaryIntervalMs,
      suppressedByScope,
      untilMs,
    };
  }

  return {
    observe(decision) {
      const now = nowMs();

      if (saturation && now >= saturation.untilMs) {
        flushSaturation(saturation);
        saturation = null;
      } else if (saturation && now >= saturation.nextSummaryAtMs) {
        flushSaturation(saturation);
        saturation.nextSummaryAtMs = now + RATE_LIMIT_LOG_DEFAULTS.saturationSummaryIntervalMs;
      }

      if (saturation) {
        if (!decision.allowed) {
          incrementSuppressedCount(saturation.suppressedByScope, decision.scope);
          saturation.untilMs = Math.max(saturation.untilMs, decision.resetEpochSeconds * 1000);
        }

        return;
      }

      const key = `${decision.scope}:${decision.clientIdentifierHash}`;
      const existing = states.get(key);

      if (existing && existing.decision.resetEpochSeconds !== decision.resetEpochSeconds) {
        flushSuppressed(existing);
        states.delete(key);
      }

      if (decision.allowed) {
        return;
      }

      let state = states.get(key);

      if (!state) {
        if (states.size >= stateCapacity) {
          enterSaturation(decision, now);
          return;
        }

        state = {
          decision,
          individualLogs: 0,
          suppressedCount: 0,
        };
        states.set(key, state);
      }

      if (state.individualLogs < individualDenialsPerWindow) {
        safeWrite({
          ...rateLimitLogEntry(decision),
          event: "api_rate_limited",
        });
        state.individualLogs += 1;
      } else {
        state.suppressedCount = Math.min(Number.MAX_SAFE_INTEGER, state.suppressedCount + 1);
      }
    },
    stateSize() {
      return states.size + (saturation ? 1 : 0);
    },
  };
}

// 建立固定時間窗口的 rate limiter，並以 LRU bucket 限制記憶體用量。
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

// 解析 rate limit env；無效值回退到保守預設，避免錯誤設定讓 API 失去限流。
export function resolveRateLimitConfig(env: RateLimitEnv = process.env): RateLimitConfig {
  const readMax = readPositiveInteger(env.API_READ_RATE_LIMIT_MAX, RATE_LIMIT_DEFAULTS.readMax);
  const listMax = readPositiveInteger(env.API_LIST_RATE_LIMIT_MAX, RATE_LIMIT_DEFAULTS.listMax);
  const movementListMax = readPositiveInteger(
    env.API_PRODUCT_MOVEMENT_RATE_LIMIT_MAX,
    RATE_LIMIT_DEFAULTS.movementListMax,
  );
  const imageMax = readPositiveInteger(env.API_IMAGE_RATE_LIMIT_MAX, RATE_LIMIT_DEFAULTS.imageMax);
  const metadataImageMax = readPositiveInteger(
    env.SHARE_IMAGE_RATE_LIMIT_MAX,
    RATE_LIMIT_DEFAULTS.metadataImageMax,
  );
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
      "api:list:movement": movementListMax,
      "api:image": imageMax,
      "api:build-list": readMax,
      "metadata:image": metadataImageMax,
    },
    windowMs: windowSeconds * 1000,
  };
}

// 解析目前 request 的 client identifier，供 rate limit 與 smoke 觀察來源判斷。
export function getClientIdentifier(
  request: RateLimitRequest,
  nodeEnv = process.env.NODE_ENV,
): string {
  return getClientIdentifierInfo(request, nodeEnv).value;
}

// Production 只信任 Cloudflare client header；本機開發與測試才接受單一合法 XFF。
export function getClientIdentifierInfo(
  request: RateLimitRequest,
  nodeEnv = process.env.NODE_ENV,
): {
  source: ClientIdentifierSource;
  value: string;
} {
  const cloudflareIp = readSingleIpHeader(request.headers.get("CF-Connecting-IP"));

  if (cloudflareIp) {
    return {
      source: "cf",
      value: cloudflareIp,
    };
  }

  const forwardedForIp =
    nodeEnv === "production" ? null : readSingleIpHeader(request.headers.get("X-Forwarded-For"));

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

// 建立公開 rate limit headers，讓前端、smoke test 與維運檢查能觀察目前限流狀態。
function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "X-RateLimit-Client-Source": decision.clientIdentifierSource,
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(decision.resetEpochSeconds),
  };
}

// 將 rate limit headers 套到既有 response，避免 handler 自行重複處理 header 細節。
export function withRateLimitHeaders(response: Response, decision: RateLimitDecision): Response {
  for (const [name, value] of Object.entries(rateLimitHeaders(decision))) {
    response.headers.set(name, value);
  }

  return response;
}

let globalRateLimiter: RateLimiter | null = null;
let globalRateLimitDenialLogger: RateLimitDenialLogger | null = null;

function getGlobalRateLimiter(): RateLimiter {
  globalRateLimiter ??= createRateLimiter();

  return globalRateLimiter;
}

function getGlobalRateLimitDenialLogger(): RateLimitDenialLogger {
  globalRateLimitDenialLogger ??= createRateLimitDenialLogger();

  return globalRateLimitDenialLogger;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const trimmedValue = value?.trim();

  if (!trimmedValue || !/^\d+$/.test(trimmedValue)) {
    return fallback;
  }

  const parsedValue = Number.parseInt(trimmedValue, 10);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function readBoundedNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return Number.isSafeInteger(value) && value !== undefined && value >= 0
    ? Math.min(value, maximum)
    : fallback;
}

function readBoundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function readSingleIpHeader(value: string | null): string | null {
  const candidate = value?.trim();

  return candidate && !candidate.includes(",") && isIP(candidate) !== 0 ? candidate : null;
}

function hashClientIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function rateLimitLogEntry(decision: RateLimitDecision): Omit<RateLimitLogEntry, "event"> {
  return {
    scope: decision.scope,
    limit: decision.limit,
    remaining: decision.remaining,
    resetEpochSeconds: decision.resetEpochSeconds,
    retryAfterSeconds: decision.retryAfterSeconds,
    clientIdentifierSource: decision.clientIdentifierSource,
    clientIdentifierHash: decision.clientIdentifierHash,
  };
}

const RATE_LIMIT_SCOPES: readonly RateLimitScope[] = [
  "api:read",
  "api:list",
  "api:list:movement",
  "api:image",
  "api:build-list",
  "metadata:image",
];

function emptySuppressedCounts(): Record<RateLimitScope, number> {
  return {
    "api:read": 0,
    "api:list": 0,
    "api:list:movement": 0,
    "api:image": 0,
    "api:build-list": 0,
    "metadata:image": 0,
  };
}

function writeRateLimitLogEntry(entry: RateLimitLogEntry): void {
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}
