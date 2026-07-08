// apps/crawler/src/scripts/ops/production-smoke/results.ts
// 提供 production smoke check 結果組裝、門檻判斷與時間顯示的共用 helper。

import { MILLISECONDS_PER_MINUTE } from "./constants";
import type { SmokeCheckResult, SmokeStatus } from "./types";

// 依 count 與 warn / fail 門檻建立標準 smoke check 結果。
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

// 將數量門檻轉成 OK / WARN / FAIL，0 門檻代表該層級不啟用。
export function countStatus(count: number, warnCount: number, failCount: number): SmokeStatus {
  if (failCount > 0 && count >= failCount) {
    return "FAIL";
  }

  if (warnCount > 0 && count >= warnCount) {
    return "WARN";
  }

  return "OK";
}

// 彙整多個 check 的最嚴重狀態，作為整體 production smoke 結果。
export function resolveSummaryStatus(checks: SmokeCheckResult[]): SmokeStatus {
  return checks.reduce<SmokeStatus>((status, check) => worseStatus(status, check.status), "OK");
}

// 比較兩個 smoke 狀態並回傳較嚴重者。
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

// 計算兩個時間點相差的完整分鐘數，避免未來時間造成負值。
export function minutesBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MILLISECONDS_PER_MINUTE));
}

// 將分鐘差轉成 smoke summary 使用的簡短 age 字串。
export function formatAgeMinutes(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m ago`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;

  return `${hours}h${minutes}m ago`;
}

// 解析 API 回傳的 ISO 日期字串，失敗時回傳 null 讓檢查點明確 fail。
export function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
