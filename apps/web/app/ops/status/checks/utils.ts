// apps/web/app/ops/status/checks/utils.ts
// 提供 /ops/status 健康檢查共用的門檻判定、嚴重度比較與時間摘要 helper。

import type { OpsStatusLevel } from "../types";
import type { OpsStatusCheck } from "./types";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

// 建立以數量門檻判斷等級的檢查結果列。
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

// 依 warn / fail 數量門檻回傳 ops status 等級。
export function countLevel(count: number, warnCount: number, failCount: number): OpsStatusLevel {
  if (failCount > 0 && count >= failCount) {
    return "fail";
  }

  if (warnCount > 0 && count >= warnCount) {
    return "warn";
  }

  return "ok";
}

// 依資料年齡分鐘數回傳 ops status 等級。
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

// 比較兩個 ops status 等級並回傳較嚴重者。
export function worseLevel(left: OpsStatusLevel, right: OpsStatusLevel): OpsStatusLevel {
  if (left === "fail" || right === "fail") {
    return "fail";
  }

  if (left === "warn" || right === "warn") {
    return "warn";
  }

  return "ok";
}

// 取得一組日期中的最舊時間，忽略無資料的 null。
export function oldestDate(values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value !== null);

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

// 計算指定時間到目前時間的分鐘差，未來時間以 0 分鐘處理。
export function minutesBetween(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MILLISECONDS_PER_MINUTE));
}

// 將分鐘數轉成維運摘要用的短格式，例如 45m 或 2h05m。
export function formatAgeMinutes(ageMinutes: number): string {
  if (ageMinutes < 60) {
    return `${ageMinutes}m`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;

  return `${hours}h${minutes.toString().padStart(2, "0")}m`;
}
