// 將排程個人報告的結構化 delivery 結果轉成有界、可持久化的下一步狀態。

import type { DiscordPriceReportDeliveryState } from "@partsradar/db";
import {
  SCHEDULED_PRICE_REPORT_MAX_RETRY_ATTEMPTS,
  SCHEDULED_PRICE_REPORT_RETRY_AFTER_MAX_MS,
  SCHEDULED_PRICE_REPORT_RETRY_BASE_DELAY_MS,
  SCHEDULED_PRICE_REPORT_RETRY_MAX_JITTER_MS,
} from "../constants";
import type { PersonalPriceReportDeliveryResult } from "../types";

type FailedScheduledDelivery = Extract<
  PersonalPriceReportDeliveryResult,
  { status: "failed" | "rate_limited" }
>;

export type ScheduledPriceReportFailureDisposition =
  | {
      outcome: "retry_scheduled";
      deliveryState: "ACTIVE";
      consecutiveDeliveryFailures: number;
      nextSendAt: Date;
    }
  | {
      outcome: "paused_permanent" | "paused_retry_exhausted" | "paused_partial_delivery";
      deliveryState: Exclude<DiscordPriceReportDeliveryState, "ACTIVE">;
      consecutiveDeliveryFailures: number;
      nextSendAt: null;
    };

export function resolveScheduledPriceReportFailure({
  result,
  previousFailureCount,
  now,
  random = Math.random,
}: {
  result: FailedScheduledDelivery;
  previousFailureCount: number;
  now: Date;
  random?: () => number;
}): ScheduledPriceReportFailureDisposition {
  const nextFailureCount = Math.min(
    SCHEDULED_PRICE_REPORT_MAX_RETRY_ATTEMPTS,
    Math.max(0, previousFailureCount) + 1,
  );

  if (result.sentMessageCount > 0) {
    return paused("paused_partial_delivery", "PAUSED_PARTIAL_DELIVERY", nextFailureCount);
  }

  if (isPermanentScheduledPriceReportFailure(result)) {
    return paused("paused_permanent", "PAUSED_PERMANENT_FAILURE", nextFailureCount);
  }

  if (nextFailureCount >= SCHEDULED_PRICE_REPORT_MAX_RETRY_ATTEMPTS) {
    return paused("paused_retry_exhausted", "PAUSED_RETRY_EXHAUSTED", nextFailureCount);
  }

  const exponentialDelayMs =
    SCHEDULED_PRICE_REPORT_RETRY_BASE_DELAY_MS * 2 ** (nextFailureCount - 1);
  const jitterMs = Math.min(
    SCHEDULED_PRICE_REPORT_RETRY_MAX_JITTER_MS,
    Math.floor(normalizeRandom(random()) * (SCHEDULED_PRICE_REPORT_RETRY_MAX_JITTER_MS + 1)),
  );
  const retryAfterMs =
    result.status === "rate_limited" ? boundRetryAfterMs(result.retryAfterMs) : 0;
  const delayMs = Math.max(exponentialDelayMs + jitterMs, retryAfterMs);

  return {
    outcome: "retry_scheduled",
    deliveryState: "ACTIVE",
    consecutiveDeliveryFailures: nextFailureCount,
    nextSendAt: new Date(now.getTime() + delayMs),
  };
}

function boundRetryAfterMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(SCHEDULED_PRICE_REPORT_RETRY_AFTER_MAX_MS, Math.max(0, Math.ceil(value)));
}

function isPermanentScheduledPriceReportFailure(result: FailedScheduledDelivery): boolean {
  if (result.status === "rate_limited") {
    return false;
  }

  if (
    result.errorCategory === "DM_UNAVAILABLE" ||
    result.errorCategory === "PERMISSIONS" ||
    result.errorCategory === "INTERACTION_EXPIRED"
  ) {
    return true;
  }

  if (result.httpStatus === null) {
    return false;
  }

  return (
    result.httpStatus >= 400 &&
    result.httpStatus < 500 &&
    result.httpStatus !== 408 &&
    result.httpStatus !== 425 &&
    result.httpStatus !== 429
  );
}

function paused(
  outcome: "paused_permanent" | "paused_retry_exhausted" | "paused_partial_delivery",
  deliveryState: Exclude<DiscordPriceReportDeliveryState, "ACTIVE">,
  consecutiveDeliveryFailures: number,
): ScheduledPriceReportFailureDisposition {
  return {
    outcome,
    deliveryState,
    consecutiveDeliveryFailures,
    nextSendAt: null,
  };
}

function normalizeRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
