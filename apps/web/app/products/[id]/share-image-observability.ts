// apps/web/app/products/[id]/share-image-observability.ts
// 以固定欄位與固定頻率聚合分享圖工作量，不記錄商品、路徑或 client identifier。

export type ProductShareImageOutcome =
  | "invalid"
  | "missing"
  | "rate_denied"
  | "unavailable"
  | "valid";

export type ProductShareImageCacheStatus = "bypass" | "coalesced" | "hit" | "miss";

export interface ProductShareImageObservation {
  byteLength: number;
  cacheStatus: ProductShareImageCacheStatus;
  durationMs: number;
  outcome: ProductShareImageOutcome;
}

interface ProductShareImageObservationAggregatorOptions {
  emit?: (value: string) => void;
  flushIntervalMs?: number;
  nowMs?: () => number;
}

const DEFAULT_FLUSH_INTERVAL_MS = 60_000;
const COUNTER_MAX = Number.MAX_SAFE_INTEGER;

export function createProductShareImageObservationAggregator(
  options: ProductShareImageObservationAggregatorOptions = {},
): (observation: ProductShareImageObservation) => void {
  const emit = options.emit ?? ((value: string) => process.stderr.write(`${value}\n`));
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const nowMs = options.nowMs ?? Date.now;
  let nextFlushAtMs = nowMs() + flushIntervalMs;
  let state = createEmptyObservationState();

  return (observation) => {
    state.total = incrementCounter(state.total);
    state.bytes = addCounter(state.bytes, observation.byteLength);
    state.outcomes[observation.outcome] = incrementCounter(state.outcomes[observation.outcome]);
    state.cache[observation.cacheStatus] = incrementCounter(state.cache[observation.cacheStatus]);
    const durationBucket = resolveDurationBucket(observation.durationMs);
    state.durationMs[durationBucket] = incrementCounter(state.durationMs[durationBucket]);

    const currentTimeMs = nowMs();

    if (currentTimeMs < nextFlushAtMs) {
      return;
    }

    emit(
      JSON.stringify({
        event: "product_share_image_summary",
        intervalMs: flushIntervalMs,
        ...state,
      }),
    );
    state = createEmptyObservationState();
    nextFlushAtMs = currentTimeMs + flushIntervalMs;
  };
}

export const observeProductShareImage = createProductShareImageObservationAggregator();

function createEmptyObservationState() {
  return {
    total: 0,
    bytes: 0,
    outcomes: {
      invalid: 0,
      missing: 0,
      rate_denied: 0,
      unavailable: 0,
      valid: 0,
    } satisfies Record<ProductShareImageOutcome, number>,
    cache: {
      bypass: 0,
      coalesced: 0,
      hit: 0,
      miss: 0,
    } satisfies Record<ProductShareImageCacheStatus, number>,
    durationMs: {
      under_50: 0,
      under_250: 0,
      under_1000: 0,
      at_least_1000: 0,
    },
  };
}

function resolveDurationBucket(
  durationMs: number,
): "at_least_1000" | "under_1000" | "under_250" | "under_50" {
  if (durationMs < 50) {
    return "under_50";
  }

  if (durationMs < 250) {
    return "under_250";
  }

  if (durationMs < 1000) {
    return "under_1000";
  }

  return "at_least_1000";
}

function incrementCounter(value: number): number {
  return value >= COUNTER_MAX ? COUNTER_MAX : value + 1;
}

function addCounter(value: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0) {
    return value;
  }

  return Math.min(COUNTER_MAX, value + Math.floor(increment));
}
