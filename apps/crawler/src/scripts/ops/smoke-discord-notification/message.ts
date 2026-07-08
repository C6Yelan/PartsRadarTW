// apps/crawler/src/scripts/ops/smoke-discord-notification/message.ts
// 組裝 production smoke Discord admin webhook 訊息，區分異常告警與恢復通知的 embed 內容。

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
        timestamp: summary.checkedAt.toISOString(),
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
        timestamp: summary.checkedAt.toISOString(),
      },
    ],
  };
}

// 格式化異常摘要；目前保留 UTC ISO 時間，後續可與 ops 人讀時間格式一併收斂。
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

// 格式化恢復摘要；目前沿用詳細 check 列表，避免單輪恢復通知缺少可追溯上下文。
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

// 限制單則 Discord webhook 內的 check 明細數量與文字長度，避免告警訊息超過 payload 上限。
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
