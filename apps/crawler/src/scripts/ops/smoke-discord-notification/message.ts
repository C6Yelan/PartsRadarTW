// apps/crawler/src/scripts/ops/smoke-discord-notification/message.ts
// 組裝 production smoke Discord admin webhook 訊息，區分異常告警與恢復通知的 embed 內容。

import type { ProductionSmokeSummary, SmokeCheckResult, SmokeStatus } from "../production-smoke";
import { type DiscordWebhookMessage, formatDiscordWebhookText } from "../discord-webhook";
import type { SmokeDiscordNotificationKind } from "./state";

const MAX_ABNORMAL_CHECK_LINES = 8;
const TAIPEI_TIME_ZONE = "Asia/Taipei";
const TAIPEI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TAIPEI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const SMOKE_EMBED_COLORS: Record<SmokeDiscordNotificationKind, number> = {
  WARN: 0xf59e0b,
  FAIL: 0xdc2626,
  RECOVERED: 0x16a34a,
};

// 建立 WARN / FAIL 告警訊息，只列出 abnormal checks 以降低 Discord 通知噪音。
export function createAbnormalMessage(summary: ProductionSmokeSummary): DiscordWebhookMessage {
  const abnormalChecks = summary.checks.filter((check) => check.status !== "OK");

  return {
    username: "PartsRadarTW ops",
    embeds: [
      {
        title: `PartsRadarTW smoke ${summary.status}`,
        description: formatAbnormalSmokeDescription(summary, abnormalChecks),
        color: summary.status === "FAIL" ? SMOKE_EMBED_COLORS.FAIL : SMOKE_EMBED_COLORS.WARN,
      },
    ],
  };
}

// 建立 smoke 狀態恢復訊息，保留前一個異常狀態供維運判斷本次恢復來源。
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
      },
    ],
  };
}

// 格式化異常摘要；管理者主要時間明確使用台北時區，並只列異常 check。
function formatAbnormalSmokeDescription(
  summary: ProductionSmokeSummary,
  checks: SmokeCheckResult[],
): string {
  return [
    `Checked at (${TAIPEI_TIME_ZONE}): ${formatTaipeiDateTime(summary.checkedAt)}`,
    `Status: ${summary.status}`,
    "",
    "Issues:",
    ...formatAbnormalCheckLines(checks),
  ].join("\n");
}

// 格式化恢復摘要；只保留前一狀態、恢復時間與目前 counts，避免列出所有 OK check。
function formatRecoveredSmokeDescription(
  summary: ProductionSmokeSummary,
  previousStatus: SmokeStatus,
): string {
  const counts = countChecksByStatus(summary);

  return [
    `Previous status: ${previousStatus}`,
    `Recovered at (${TAIPEI_TIME_ZONE}): ${formatTaipeiDateTime(summary.checkedAt)}`,
    `Checks: OK=${counts.OK} WARN=${counts.WARN} FAIL=${counts.FAIL}`,
  ].join("\n");
}

// 異常摘要已從結構上排除 OK；保留上限只作為 Discord payload safety guard。
function formatAbnormalCheckLines(checks: SmokeCheckResult[]): string[] {
  if (checks.length === 0) {
    return ["- No abnormal checks reported."];
  }

  const visibleChecks = checks
    .slice(0, MAX_ABNORMAL_CHECK_LINES)
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

function countChecksByStatus(summary: ProductionSmokeSummary): Record<SmokeStatus, number> {
  const counts: Record<SmokeStatus, number> = { OK: 0, WARN: 0, FAIL: 0 };

  for (const check of summary.checks) {
    counts[check.status] += 1;
  }

  return counts;
}

function formatTaipeiDateTime(value: Date): string {
  const parts = new Map(
    TAIPEI_DATE_TIME_FORMATTER.formatToParts(value).map((part) => [part.type, part.value]),
  );

  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")} ${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}`;
}
