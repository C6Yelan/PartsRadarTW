// 驗證個人排程報告 retry policy 的分類、budget 與所有時間上限。

import { describe, expect, it } from "vitest";
import {
  SCHEDULED_PRICE_REPORT_MAX_RETRY_ATTEMPTS,
  SCHEDULED_PRICE_REPORT_RETRY_AFTER_MAX_MS,
  SCHEDULED_PRICE_REPORT_RETRY_MAX_JITTER_MS,
} from "../../../../../src/scripts/ops/discord-bot/constants";
import { resolveScheduledPriceReportFailure } from "../../../../../src/scripts/ops/discord-bot/price-report/retry-policy";

const NOW = new Date("2026-06-07T05:00:00.000Z");

describe("scheduled price report retry policy", () => {
  it("pauses permanent DM and authentication failures", () => {
    expect(
      resolveScheduledPriceReportFailure({
        result: failed({ errorCategory: "DM_UNAVAILABLE", httpStatus: 403 }),
        previousFailureCount: 0,
        now: NOW,
      }),
    ).toEqual({
      outcome: "paused_permanent",
      deliveryState: "PAUSED_PERMANENT_FAILURE",
      consecutiveDeliveryFailures: 1,
      nextSendAt: null,
    });
    expect(
      resolveScheduledPriceReportFailure({
        result: failed({ errorCategory: "PROVIDER", httpStatus: 401 }),
        previousFailureCount: 2,
        now: NOW,
      }).outcome,
    ).toBe("paused_permanent");
  });

  it.each([
    { previousFailureCount: 0, expectedFailureCount: 1, expectedMinutes: 5 },
    { previousFailureCount: 1, expectedFailureCount: 2, expectedMinutes: 10 },
    { previousFailureCount: 2, expectedFailureCount: 3, expectedMinutes: 20 },
    { previousFailureCount: 3, expectedFailureCount: 4, expectedMinutes: 40 },
  ])("backs off attempt $expectedFailureCount by $expectedMinutes minutes plus bounded jitter", ({
    previousFailureCount,
    expectedFailureCount,
    expectedMinutes,
  }) => {
    const withoutJitter = resolveScheduledPriceReportFailure({
      result: failed({ errorCategory: "TRANSPORT", httpStatus: null }),
      previousFailureCount,
      now: NOW,
      random: () => 0,
    });
    const withMaximumJitter = resolveScheduledPriceReportFailure({
      result: failed({ errorCategory: "TRANSPORT", httpStatus: null }),
      previousFailureCount,
      now: NOW,
      random: () => 1,
    });

    expect(withoutJitter).toEqual({
      outcome: "retry_scheduled",
      deliveryState: "ACTIVE",
      consecutiveDeliveryFailures: expectedFailureCount,
      nextSendAt: new Date(NOW.getTime() + expectedMinutes * 60_000),
    });
    expect(withMaximumJitter.nextSendAt).toEqual(
      new Date(
        NOW.getTime() + expectedMinutes * 60_000 + SCHEDULED_PRICE_REPORT_RETRY_MAX_JITTER_MS,
      ),
    );
  });

  it("honors retry-after while bounding untrusted provider values", () => {
    const disposition = resolveScheduledPriceReportFailure({
      result: rateLimited(Number.MAX_SAFE_INTEGER),
      previousFailureCount: 0,
      now: NOW,
      random: () => 0,
    });

    expect(disposition.nextSendAt).toEqual(
      new Date(NOW.getTime() + SCHEDULED_PRICE_REPORT_RETRY_AFTER_MAX_MS),
    );
  });

  it("pauses after the fixed retry budget and never schedules another run", () => {
    expect(
      resolveScheduledPriceReportFailure({
        result: failed({ errorCategory: "TRANSPORT", httpStatus: null }),
        previousFailureCount: SCHEDULED_PRICE_REPORT_MAX_RETRY_ATTEMPTS - 1,
        now: NOW,
      }),
    ).toEqual({
      outcome: "paused_retry_exhausted",
      deliveryState: "PAUSED_RETRY_EXHAUSTED",
      consecutiveDeliveryFailures: SCHEDULED_PRICE_REPORT_MAX_RETRY_ATTEMPTS,
      nextSendAt: null,
    });
  });

  it("pauses partial deliveries instead of replaying already-sent messages", () => {
    expect(
      resolveScheduledPriceReportFailure({
        result: failed({ sentMessageCount: 1, errorCategory: "TRANSPORT", httpStatus: null }),
        previousFailureCount: 0,
        now: NOW,
      }).deliveryState,
    ).toBe("PAUSED_PARTIAL_DELIVERY");
  });
});

function failed({
  sentMessageCount = 0,
  errorCategory,
  httpStatus,
}: {
  sentMessageCount?: number;
  errorCategory:
    | "DM_UNAVAILABLE"
    | "PERMISSIONS"
    | "INTERACTION_EXPIRED"
    | "TRANSPORT"
    | "PROVIDER";
  httpStatus: number | null;
}) {
  return {
    status: "failed" as const,
    changeCount: 0,
    newProductCount: 0,
    listedCount: 0,
    messageCount: 2,
    sentMessageCount,
    httpStatus,
    errorCategory,
    providerErrorCode: null,
  };
}

function rateLimited(retryAfterMs: number) {
  return {
    status: "rate_limited" as const,
    changeCount: 0,
    newProductCount: 0,
    listedCount: 0,
    messageCount: 1,
    sentMessageCount: 0,
    httpStatus: 429 as const,
    errorCategory: "RATE_LIMITED" as const,
    providerErrorCode: null,
    retryAfterMs,
    global: false,
  };
}
