// apps/crawler/src/scripts/ops/production-smoke/summary.ts
// 將 production smoke summary 輸出成維運 CLI 可快速掃描的文字摘要。

import { formatTaipeiDateTime, TAIPEI_TIME_ZONE } from "../shared/time";
import type { ProductionSmokeSummary } from "./types";

// 輸出整體狀態、各等級數量與 WARN / FAIL 細節，省略 OK 明細以降低噪音。
export function printProductionSmokeSummary(summary: ProductionSmokeSummary): void {
  const counts = countChecksByStatus(summary);
  const issueChecks = summary.checks.filter((check) => check.status !== "OK");

  console.log("");
  console.log("PartsRadarTW production smoke");
  console.log(`Checked at (${TAIPEI_TIME_ZONE}): ${formatTaipeiDateTime(summary.checkedAt)}`);
  console.log(`Checked at (UTC): ${summary.checkedAt.toISOString()}`);
  console.log("");
  console.log(`Checks: ok=${counts.OK} warn=${counts.WARN} fail=${counts.FAIL}`);

  for (const check of issueChecks) {
    console.log(`[${check.status}] ${check.name}: ${check.message}`);
  }

  console.log("");
  console.log(`Result: ${summary.status}`);
}

// 統計 summary 內各 smoke status 的數量，供 CLI 摘要列印。
function countChecksByStatus(
  summary: ProductionSmokeSummary,
): Record<"OK" | "WARN" | "FAIL", number> {
  const counts = { OK: 0, WARN: 0, FAIL: 0 };

  for (const check of summary.checks) {
    counts[check.status] += 1;
  }

  return counts;
}
