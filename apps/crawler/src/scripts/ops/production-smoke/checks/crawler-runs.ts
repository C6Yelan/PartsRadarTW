// apps/crawler/src/scripts/ops/production-smoke/checks/crawler-runs.ts
import { CRAWL_RUN_STATUSES } from "../../../../coolpc/crawl-run";
import { MILLISECONDS_PER_HOUR } from "../constants";
import { fail, formatAgeMinutes, minutesBetween, ok, warn } from "../results";
import type { ProductionSmokeClient, ProductionSmokeOptions, SmokeCheckResult } from "../types";

export async function checkCrawlerFreshness(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const latestScheduledRun = await client.crawlRun.findFirst({
    where: {
      triggerType: "SCHEDULED",
    },
    orderBy: {
      startedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  const latestSuccess = await client.crawlRun.findFirst({
    where: {
      triggerType: "SCHEDULED",
      status: {
        in: [CRAWL_RUN_STATUSES.SUCCESS_CHANGED, CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED],
      },
      finishedAt: {
        not: null,
      },
    },
    orderBy: {
      finishedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      finishedAt: true,
    },
  });

  if (!latestSuccess?.finishedAt) {
    return fail("crawler freshness", "no successful scheduled crawl run found");
  }

  const ageMinutes = minutesBetween(latestSuccess.finishedAt, now);
  const latestStatus = latestScheduledRun?.status ?? "none";
  const message = `latestSuccess=${formatAgeMinutes(ageMinutes)} latestStatus=${latestStatus}`;

  if (latestScheduledRun?.status === CRAWL_RUN_STATUSES.SUSPECTED_BLOCK) {
    return fail("crawler freshness", message);
  }

  if (ageMinutes >= options.crawlerFailAfterMinutes) {
    return fail("crawler freshness", message);
  }

  if (ageMinutes >= options.crawlerWarnAfterMinutes) {
    return warn("crawler freshness", message);
  }

  return ok("crawler freshness", message);
}

export async function checkRecentSuspectedBlocks(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const count = await client.crawlRun.count({
    where: {
      triggerType: "SCHEDULED",
      status: CRAWL_RUN_STATUSES.SUSPECTED_BLOCK,
      startedAt: {
        gte: since,
      },
    },
  });
  const message = `${count} suspected block run(s) in ${options.recentWindowHours}h`;

  return count > 0
    ? warn("recent suspected blocks", message)
    : ok("recent suspected blocks", message);
}
