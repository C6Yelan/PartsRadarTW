// apps/crawler/src/scripts/ops/production-smoke/results.ts

import { MILLISECONDS_PER_MINUTE } from "./constants";
import type { SmokeCheckResult, SmokeStatus } from "./types";

export function thresholdCheck(
  name: string,
  count: number,
  warnCount: number,
  failCount: number,
  message: string,
): SmokeCheckResult {
  return {
    name,
    status: countStatus(count, warnCount, failCount),
    message,
  };
}

export function countStatus(count: number, warnCount: number, failCount: number): SmokeStatus {
  if (failCount > 0 && count >= failCount) {
    return "FAIL";
  }

  if (warnCount > 0 && count >= warnCount) {
    return "WARN";
  }

  return "OK";
}

export function resolveSummaryStatus(checks: SmokeCheckResult[]): SmokeStatus {
  return checks.reduce<SmokeStatus>((status, check) => worseStatus(status, check.status), "OK");
}

export function worseStatus(left: SmokeStatus, right: SmokeStatus): SmokeStatus {
  if (left === "FAIL" || right === "FAIL") {
    return "FAIL";
  }

  if (left === "WARN" || right === "WARN") {
    return "WARN";
  }

  return "OK";
}

export function ok(name: string, message: string): SmokeCheckResult {
  return {
    name,
    status: "OK",
    message,
  };
}

export function warn(name: string, message: string): SmokeCheckResult {
  return {
    name,
    status: "WARN",
    message,
  };
}

export function fail(name: string, message: string): SmokeCheckResult {
  return {
    name,
    status: "FAIL",
    message,
  };
}

export function minutesBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MILLISECONDS_PER_MINUTE));
}

export function formatAgeMinutes(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m ago`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;

  return `${hours}h${minutes}m ago`;
}

export function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
