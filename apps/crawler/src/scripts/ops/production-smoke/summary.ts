// apps/crawler/src/scripts/ops/production-smoke/summary.ts

import type { ProductionSmokeSummary } from "./types";

export function printProductionSmokeSummary(summary: ProductionSmokeSummary): void {
  const counts = countChecksByStatus(summary);
  const issueChecks = summary.checks.filter((check) => check.status !== "OK");

  console.log("");
  console.log("PartsRadarTW production smoke");
  console.log(`Checked at: ${summary.checkedAt.toISOString()}`);
  console.log("");
  console.log(`Checks: ok=${counts.OK} warn=${counts.WARN} fail=${counts.FAIL}`);

  for (const check of issueChecks) {
    console.log(`[${check.status}] ${check.name}: ${check.message}`);
  }

  console.log("");
  console.log(`Result: ${summary.status}`);
}

function countChecksByStatus(
  summary: ProductionSmokeSummary,
): Record<"OK" | "WARN" | "FAIL", number> {
  const counts = { OK: 0, WARN: 0, FAIL: 0 };

  for (const check of summary.checks) {
    counts[check.status] += 1;
  }

  return counts;
}
