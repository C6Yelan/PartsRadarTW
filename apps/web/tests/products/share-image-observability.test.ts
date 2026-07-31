// apps/web/tests/products/share-image-observability.test.ts
// 驗證分享圖觀測只輸出固定 aggregate，且不會為每個 request 寫 log。

import { describe, expect, it, vi } from "vitest";
import { createProductShareImageObservationAggregator } from "../../app/products/[id]/share-image-observability";

describe("product share image observability", () => {
  it("emits one identifier-free aggregate per interval", () => {
    let nowMs = 0;
    const emit = vi.fn();
    const observe = createProductShareImageObservationAggregator({
      emit,
      flushIntervalMs: 1000,
      nowMs: () => nowMs,
    });

    observe({
      byteLength: 0,
      cacheStatus: "bypass",
      durationMs: 20,
      outcome: "invalid",
    });
    observe({
      byteLength: 400,
      cacheStatus: "miss",
      durationMs: 200,
      outcome: "valid",
    });
    expect(emit).not.toHaveBeenCalled();

    nowMs = 1000;
    observe({
      byteLength: 400,
      cacheStatus: "hit",
      durationMs: 1200,
      outcome: "valid",
    });

    expect(emit).toHaveBeenCalledTimes(1);
    const emittedValue = String(emit.mock.calls[0]?.[0]);
    expect(JSON.parse(emittedValue)).toEqual({
      event: "product_share_image_summary",
      intervalMs: 1000,
      total: 3,
      bytes: 800,
      outcomes: {
        invalid: 1,
        missing: 0,
        rate_denied: 0,
        unavailable: 0,
        valid: 2,
      },
      cache: {
        bypass: 1,
        coalesced: 0,
        hit: 1,
        miss: 1,
      },
      durationMs: {
        under_50: 1,
        under_250: 1,
        under_1000: 0,
        at_least_1000: 1,
      },
    });
    expect(emittedValue).not.toContain("11111111-1111-1111-1111-111111111111");
    expect(emittedValue).not.toContain("203.0.113.10");
  });
});
