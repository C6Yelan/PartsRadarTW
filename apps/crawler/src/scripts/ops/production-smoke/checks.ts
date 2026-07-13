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
import { checkCoolpcFilterSync } from "./checks/filter-sync";
import { checkRecentParseErrors } from "./checks/parse-errors";
import {
  checkActiveProductCount,
  checkHistoricalImageCacheMetadata,
  checkMissingProductImages,
  checkSourceImageFetchFailures,
} from "./checks/product-health";
import { checkProductFilterQuality } from "./checks/product-filter-quality";
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
  if (options.filterSyncStateFilePath) {
    checks.push(await checkCoolpcFilterSync(options.filterSyncStateFilePath, now));
  }
  checks.push(await checkRecentSuspectedBlocks(client, options, now));
  checks.push(await checkRecentParseErrors(client, options, now));
  checks.push(await checkSourceImageFetchFailures(client, options, now));
  checks.push(await checkActiveProductCount(client, options));
  checks.push(await checkProductFilterQuality(client));
  checks.push(await checkMissingProductImages(client, options));
  checks.push(await checkHistoricalImageCacheMetadata(client, options, now));
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
