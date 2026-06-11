// apps/crawler/src/scripts/ops/production-smoke/summary.ts

import type { ProductionSmokeSummary } from "./types";

export function printProductionSmokeSummary(summary: ProductionSmokeSummary): void {
  console.log("");
  console.log("PartsRadarTW production smoke");
  console.log(`Checked at: ${summary.checkedAt.toISOString()}`);
  console.log("");

  for (const check of summary.checks) {
    console.log(`[${check.status}] ${check.name}: ${check.message}`);
  }

  console.log("");
  console.log(`Result: ${summary.status}`);
}
