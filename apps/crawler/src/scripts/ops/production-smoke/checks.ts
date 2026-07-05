// apps/crawler/src/scripts/ops/production-smoke/checks.ts

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
  checks.push(await checkLinkHealth(client, options));
  checks.push(await checkRawSnapshotRetention(client, options, now));
  checks.push(await checkDiscordBotDeliveries(client, options, now));

  return {
    checkedAt: now,
    status: resolveSummaryStatus(checks),
    checks,
  };
}

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
