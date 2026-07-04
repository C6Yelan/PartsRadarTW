// apps/crawler/src/scripts/ops/smoke-discord-notification/message.ts

import type { ProductionSmokeSummary, SmokeCheckResult, SmokeStatus } from "../production-smoke";
import {
  type DiscordWebhookMessage,
  formatDiscordWebhookText,
} from "../discord-webhook";
import type { SmokeDiscordNotificationKind } from "./state";

const MAX_DETAILED_CHECK_LINES = 8;
const SMOKE_EMBED_COLORS: Record<SmokeDiscordNotificationKind, number> = {
  WARN: 0xf59e0b,
  FAIL: 0xdc2626,
  RECOVERED: 0x16a34a,
};

export function createAbnormalMessage(summary: ProductionSmokeSummary): DiscordWebhookMessage {
  const abnormalChecks = summary.checks.filter((check) => check.status !== "OK");

  return {
    username: "PartsRadarTW ops",
    embeds: [
      {
        title: `PartsRadarTW smoke ${summary.status}`,
        description: formatAbnormalSmokeDescription(summary, abnormalChecks),
        color: summary.status === "FAIL" ? SMOKE_EMBED_COLORS.FAIL : SMOKE_EMBED_COLORS.WARN,
        timestamp: summary.checkedAt.toISOString(),
      },
    ],
  };
}

export function createRecoveredMessage(
  summary: ProductionSmokeSummary,
  previousStatus: SmokeStatus,
): DiscordWebhookMessage {
  return {
    username: "PartsRadarTW ops",
    embeds: [
      {
        title: "PartsRadarTW smoke RECOVERED",
        description: formatRecoveredSmokeDescription(summary, previousStatus),
        color: SMOKE_EMBED_COLORS.RECOVERED,
        timestamp: summary.checkedAt.toISOString(),
      },
    ],
  };
}

function formatAbnormalSmokeDescription(
  summary: ProductionSmokeSummary,
  checks: SmokeCheckResult[],
): string {
  return [
    `Checked at: ${summary.checkedAt.toISOString()}`,
    `Status: ${summary.status}`,
    "",
    "Issues:",
    ...formatDetailedCheckLines(checks),
  ].join("\n");
}

function formatRecoveredSmokeDescription(
  summary: ProductionSmokeSummary,
  previousStatus: SmokeStatus,
): string {
  return [
    `Previous status: ${previousStatus}`,
    `Checked at: ${summary.checkedAt.toISOString()}`,
    "",
    "Current state:",
    ...formatDetailedCheckLines(summary.checks),
  ].join("\n");
}

function formatDetailedCheckLines(checks: SmokeCheckResult[]): string[] {
  if (checks.length === 0) {
    return ["- No checks reported."];
  }

  const visibleChecks = checks
    .slice(0, MAX_DETAILED_CHECK_LINES)
    .map(
      (check) =>
        `- ${check.status} ${formatDiscordWebhookText(check.name, 80)}: ${formatDiscordWebhookText(
          check.message,
          260,
        )}`,
    );
  const hiddenCount = checks.length - visibleChecks.length;

  return hiddenCount > 0 ? [...visibleChecks, `- ... ${hiddenCount} more checks`] : visibleChecks;
}
