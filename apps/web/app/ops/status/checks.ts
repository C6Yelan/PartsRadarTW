// apps/web/app/ops/status/checks.ts
import type {
  OpsLatestScheduledRunRecord,
  OpsLatestSuccessfulScheduledRunRecord,
  OpsSourceCategoryRecord,
} from "./queries";
import type { OpsStatusLevel, OpsStatusThresholds } from "./types";
import type { OpsStatusCheck } from "./checks/types";
import {
  countAgeLevel,
  countLevel,
  formatAgeMinutes,
  minutesBetween,
  oldestDate,
  thresholdCheck,
  worseLevel,
} from "./checks/utils";

export type { OpsStatusCheck } from "./checks/types";

interface OpsStatusLinkKindCheckInput {
  broken: number;
  temporaryError: number;
}

interface OpsStatusDiscordDeliveryKindCheckInput {
  failed: number;
  rateLimited: number;
}

interface BuildOpsStatusChecksInput {
  displayReadyProductCount: number;
  displayReadyProductTotal: number;
  missingImageCount: number;
  sourceCategories: OpsSourceCategoryRecord[];
  latestScheduledRun: OpsLatestScheduledRunRecord | null;
  latestSuccessfulScheduledRun: OpsLatestSuccessfulScheduledRunRecord | null;
  suspectedBlockCount: number;
  parseErrorCount: number;
  invalidImageUrlCount: number;
  linkHealth: {
    source: OpsStatusLinkKindCheckInput;
  };
  rawSnapshotRetention: {
    expired: number;
    expiredNormal: number;
    expiredAbnormal: number;
  };
  discordBot: {
    recentDeliveries: {
      priceReportNow: OpsStatusDiscordDeliveryKindCheckInput;
      scheduledPriceReport: OpsStatusDiscordDeliveryKindCheckInput;
      targetPrice: OpsStatusDiscordDeliveryKindCheckInput;
    };
  };
  thresholds: OpsStatusThresholds;
  now: Date;
}

export function buildOpsStatusChecks({
  displayReadyProductCount,
  displayReadyProductTotal,
  missingImageCount,
  sourceCategories,
  latestScheduledRun,
  latestSuccessfulScheduledRun,
  suspectedBlockCount,
  parseErrorCount,
  invalidImageUrlCount,
  linkHealth,
  rawSnapshotRetention,
  discordBot,
  thresholds,
  now,
}: BuildOpsStatusChecksInput): OpsStatusCheck[] {
  return [
    activeProductsCheck(displayReadyProductCount, thresholds),
    sourceFreshnessCheck(sourceCategories, thresholds, now),
    crawlerFreshnessCheck(latestScheduledRun, latestSuccessfulScheduledRun, thresholds, now),
    suspectedBlocksCheck(suspectedBlockCount, thresholds),
    thresholdCheck(
      "parse-errors",
      "解析錯誤",
      parseErrorCount,
      thresholds.parseErrorWarnCount,
      thresholds.parseErrorFailCount,
      `${parseErrorCount} parser issue(s) in ${thresholds.recentWindowHours}h`,
    ),
    invalidImageUrlCheck(invalidImageUrlCount, thresholds),
    thresholdCheck(
      "missing-images",
      "商品圖片快取",
      missingImageCount,
      thresholds.missingImageWarnCount,
      thresholds.missingImageFailCount,
      `${missingImageCount}/${displayReadyProductTotal} display-ready product image(s) missing`,
    ),
    linkHealthCheck(linkHealth, thresholds),
    rawSnapshotRetentionCheck(rawSnapshotRetention, thresholds),
    discordDeliveryCheck(discordBot, thresholds),
  ];
}

export function getOverallOpsStatusLevel(checks: OpsStatusCheck[]): OpsStatusLevel {
  return checks.reduce((level, check) => worseLevel(level, check.level), "ok" as OpsStatusLevel);
}

function activeProductsCheck(
  displayReadyProductCount: number,
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  const level =
    displayReadyProductCount < thresholds.minActiveProducts ? ("fail" as const) : ("ok" as const);

  return {
    key: "active-products",
    label: "可顯示商品",
    level,
    message: `${displayReadyProductCount} display-ready active product(s)`,
  };
}

function sourceFreshnessCheck(
  sourceCategories: OpsSourceCategoryRecord[],
  thresholds: OpsStatusThresholds,
  now: Date,
): OpsStatusCheck {
  const oldestSuccessAt = oldestDate(sourceCategories.map((category) => category.lastSuccessAt));

  if (sourceCategories.length === 0) {
    return {
      key: "source-freshness",
      label: "來源同步",
      level: "fail",
      message: "no enabled source category",
    };
  }

  if (!oldestSuccessAt) {
    return {
      key: "source-freshness",
      label: "來源同步",
      level: "fail",
      message: "lastSuccessAt is null",
    };
  }

  const missingSuccessCount = sourceCategories.filter((category) => !category.lastSuccessAt).length;
  const ageMinutes = minutesBetween(oldestSuccessAt, now);
  let level = countAgeLevel(
    ageMinutes,
    thresholds.sourceWarnAfterMinutes,
    thresholds.sourceFailAfterMinutes,
  );

  if (missingSuccessCount > 0) {
    level = worseLevel(level, "warn");
  }

  return {
    key: "source-freshness",
    label: "來源同步",
    level,
    message: `oldestSuccess=${formatAgeMinutes(ageMinutes)} missingSuccess=${missingSuccessCount}`,
  };
}

function crawlerFreshnessCheck(
  latestScheduledRun: OpsLatestScheduledRunRecord | null,
  latestSuccessfulScheduledRun: OpsLatestSuccessfulScheduledRunRecord | null,
  thresholds: OpsStatusThresholds,
  now: Date,
): OpsStatusCheck {
  if (!latestSuccessfulScheduledRun?.finishedAt) {
    return {
      key: "crawler-freshness",
      label: "爬蟲排程",
      level: "fail",
      message: "no successful scheduled crawl run found",
    };
  }

  const ageMinutes = minutesBetween(latestSuccessfulScheduledRun.finishedAt, now);
  const level =
    latestScheduledRun?.status === "SUSPECTED_BLOCK"
      ? "fail"
      : countAgeLevel(
          ageMinutes,
          thresholds.crawlerWarnAfterMinutes,
          thresholds.crawlerFailAfterMinutes,
        );

  return {
    key: "crawler-freshness",
    label: "爬蟲排程",
    level,
    message: `latestSuccess=${formatAgeMinutes(ageMinutes)} latestStatus=${latestScheduledRun?.status ?? "none"}`,
  };
}

function suspectedBlocksCheck(count: number, thresholds: OpsStatusThresholds): OpsStatusCheck {
  return {
    key: "suspected-blocks",
    label: "疑似攔截",
    level: count > 0 ? "warn" : "ok",
    message: `${count} suspected block run(s) in ${thresholds.recentWindowHours}h`,
  };
}

function invalidImageUrlCheck(count: number, thresholds: OpsStatusThresholds): OpsStatusCheck {
  return {
    key: "invalid-image-urls",
    label: "來源圖片異常",
    level: count > thresholds.invalidImageUrlWarnCount ? "warn" : "ok",
    message: `${count} invalid image URL issue(s) in ${thresholds.recentWindowHours}h`,
  };
}

function linkHealthCheck(
  linkHealth: { source: OpsStatusLinkKindCheckInput },
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  const level = [
    countLevel(
      linkHealth.source.broken,
      thresholds.sourceBrokenLinkWarnCount,
      thresholds.sourceBrokenLinkFailCount,
    ),
    countLevel(
      linkHealth.source.temporaryError,
      thresholds.sourceTemporaryLinkWarnCount,
      thresholds.sourceTemporaryLinkFailCount,
    ),
  ].reduce<OpsStatusLevel>((status, nextStatus) => worseLevel(status, nextStatus), "ok");

  return {
    key: "link-health",
    label: "商品連結健康",
    level,
    message: `source broken=${linkHealth.source.broken} temporary=${linkHealth.source.temporaryError}`,
  };
}

function rawSnapshotRetentionCheck(
  retention: {
    expired: number;
    expiredNormal: number;
    expiredAbnormal: number;
  },
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  return thresholdCheck(
    "raw-snapshot-retention",
    "Raw snapshot 保留",
    retention.expired,
    thresholds.rawSnapshotWarnCount,
    thresholds.rawSnapshotFailCount,
    `expired=${retention.expired} normal=${retention.expiredNormal} abnormal=${retention.expiredAbnormal}`,
  );
}

function discordDeliveryCheck(
  discordBot: {
    recentDeliveries: {
      priceReportNow: OpsStatusDiscordDeliveryKindCheckInput;
      scheduledPriceReport: OpsStatusDiscordDeliveryKindCheckInput;
      targetPrice: OpsStatusDiscordDeliveryKindCheckInput;
    };
  },
  thresholds: OpsStatusThresholds,
): OpsStatusCheck {
  const recent = discordBot.recentDeliveries;
  const failed =
    recent.priceReportNow.failed + recent.scheduledPriceReport.failed + recent.targetPrice.failed;
  const rateLimited =
    recent.priceReportNow.rateLimited +
    recent.scheduledPriceReport.rateLimited +
    recent.targetPrice.rateLimited;

  return {
    key: "discord-bot-delivery",
    label: "Discord Bot 發送",
    level: failed + rateLimited > 0 ? "warn" : "ok",
    message: `failed=${failed} rateLimited=${rateLimited} in ${thresholds.recentWindowHours}h`,
  };
}
