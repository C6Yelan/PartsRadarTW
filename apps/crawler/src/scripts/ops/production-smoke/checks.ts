// apps/crawler/src/scripts/ops/production-smoke/checks.ts
// 編排 production smoke 的公開端點、資料庫健康度、爬蟲狀態與通知狀態檢查。

import {
  fail,
  formatAgeMinutes,
  minutesBetween,
  ok,
  parseIsoDate,
  resolveSummaryStatus,
  warn,
} from "./results";
import { checkCrawlerFreshness, checkRecentSuspectedBlocks } from "./checks/crawler-runs";
import { checkDiscordBotDeliveries } from "./checks/discord-deliveries";
import { checkRecentParseErrors, checkSourceImageAnomalies } from "./checks/parse-errors";
import {
  checkActiveProductCount,
  checkLinkHealth,
  checkMissingProductImages,
} from "./checks/product-health";
import { checkPublicEndpoints } from "./checks/public-http";
import { checkRawSnapshotRetention } from "./checks/raw-snapshot-retention";
import type {
  ProductionSmokeClient,
  ProductionSmokeOptions,
  ProductionSmokeSummary,
  SmokeCheckResult,
  SmokeSourceStatusResponse,
} from "./types";

// 執行完整 production smoke，包含 public HTTP、DB 狀態、爬蟲資料與 Discord delivery 檢查。
export async function runProductionSmoke(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now = new Date(),
): Promise<ProductionSmokeSummary> {
  const checks: SmokeCheckResult[] = [];
  const productsResult = await checkPublicEndpoints(options);
  checks.push(...productsResult.checks);
  checks.push(await checkSourceFreshness(productsResult.sourceStatus, options, now));
  checks.push(await checkCrawlerFreshness(client, options, now));
  checks.push(await checkRecentSuspectedBlocks(client, options, now));
  checks.push(await checkRecentParseErrors(client, options, now));
  checks.push(await checkSourceImageAnomalies(client, options, now));
  checks.push(await checkActiveProductCount(client, options));
  checks.push(await checkMissingProductImages(client, options));
  // 此檢查屬於 link health maintenance 功能線；後續整線移除時一併從 smoke 編排移除。
  checks.push(await checkLinkHealth(client, options));
  checks.push(await checkRawSnapshotRetention(client, options, now));
  checks.push(await checkDiscordBotDeliveries(client, options, now));

  return {
    checkedAt: now,
    status: resolveSummaryStatus(checks),
    checks,
  };
}

// 執行不需要 DB 連線的公開網站 smoke，供外部端點或輕量部署檢查使用。
export async function runProductionPublicSmoke(
  options: ProductionSmokeOptions,
  now = new Date(),
): Promise<ProductionSmokeSummary> {
  const checks: SmokeCheckResult[] = [];
  const productsResult = await checkPublicEndpoints(options);
  checks.push(...productsResult.checks);
  checks.push(await checkSourceFreshness(productsResult.sourceStatus, options, now));

  return {
    checkedAt: now,
    status: resolveSummaryStatus(checks),
    checks,
  };
}

// 根據 public source-status 回應判斷來源資料的新鮮度與可用狀態。
async function checkSourceFreshness(
  sourceStatus: SmokeSourceStatusResponse | null,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  if (!sourceStatus) {
    return fail("source freshness", "source-status response was unavailable");
  }

  if (!sourceStatus.lastSuccessAt) {
    return fail("source freshness", "lastSuccessAt is null");
  }

  const lastSuccessAt = parseIsoDate(sourceStatus.lastSuccessAt);

  if (!lastSuccessAt) {
    return fail("source freshness", "lastSuccessAt is invalid");
  }

  const ageMinutes = minutesBetween(lastSuccessAt, now);
  const message = `lastSuccessAt=${formatAgeMinutes(ageMinutes)} status=${sourceStatus.status}`;

  if (ageMinutes >= options.sourceFailAfterMinutes || sourceStatus.status === "unavailable") {
    return fail("source freshness", message);
  }

  if (ageMinutes >= options.sourceWarnAfterMinutes || sourceStatus.status !== "ok") {
    return warn("source freshness", message);
  }

  return ok("source freshness", message);
}
