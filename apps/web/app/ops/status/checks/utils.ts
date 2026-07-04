// apps/web/app/ops/status/checks/utils.ts

import type { OpsStatusLevel } from "../types";
import type { OpsStatusCheck } from "./types";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export function thresholdCheck(
  key: string,
  label: string,
  count: number,
  warnCount: number,
  failCount: number,
  message: string,
): OpsStatusCheck {
  return {
    key,
    label,
    level: countLevel(count, warnCount, failCount),
    message,
  };
}

export function countLevel(count: number, warnCount: number, failCount: number): OpsStatusLevel {
  if (failCount > 0 && count >= failCount) {
    return "fail";
  }

  if (warnCount > 0 && count >= warnCount) {
    return "warn";
  }

  return "ok";
}

export function countAgeLevel(
  ageMinutes: number,
  warnMinutes: number,
  failMinutes: number,
): OpsStatusLevel {
  if (ageMinutes >= failMinutes) {
    return "fail";
  }

  if (ageMinutes >= warnMinutes) {
    return "warn";
  }

  return "ok";
}

export function worseLevel(left: OpsStatusLevel, right: OpsStatusLevel): OpsStatusLevel {
  if (left === "fail" || right === "fail") {
    return "fail";
  }

  if (left === "warn" || right === "warn") {
    return "warn";
  }

  return "ok";
}

export function oldestDate(values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value !== null);

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

export function minutesBetween(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MILLISECONDS_PER_MINUTE));
}

export function formatAgeMinutes(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;

  return `${hours}h${minutes.toString().padStart(2, "0")}m`;
}
