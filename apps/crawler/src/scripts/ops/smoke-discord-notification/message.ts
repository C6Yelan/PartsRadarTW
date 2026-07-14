// apps/crawler/src/scripts/ops/smoke-discord-notification/message.ts
// 組裝 per-check smoke 告警、穩定恢復與監控執行失敗訊息。

import { type DiscordWebhookMessage, formatDiscordWebhookText } from "../discord-webhook";
import { formatTaipeiDateTime, TAIPEI_TIME_ZONE } from "../shared/time";
import type { SmokeNotificationCandidate } from "./policy";
import type { SmokeCycleOutcome } from "./state";

const SMOKE_EMBED_COLORS = {
  WARN: 0xf59e0b,
  FAIL: 0xdc2626,
  RECOVERED: 0x16a34a,
} as const;

export function createCheckNotificationMessage(
  notification: SmokeNotificationCandidate,
): DiscordWebhookMessage {
  if (notification.kind === "RECOVERED") {
    return {
      username: "PartsRadarTW ops",
      embeds: [
        {
          title: "PartsRadarTW smoke RECOVERED",
          description: [
            `Recovered check: ${formatDiscordWebhookText(notification.checkName, 100)}`,
            `Previous status: ${notification.previousStatus ?? "WARN"}`,
            `Stable good cycles: ${notification.consecutiveCount}`,
            `Recovered at (${TAIPEI_TIME_ZONE}): ${formatTaipeiDateTime(new Date(notification.observedAt))}`,
          ].join("\n"),
          color: SMOKE_EMBED_COLORS.RECOVERED,
        },
      ],
    };
  }

  return {
    username: "PartsRadarTW ops",
    embeds: [
      {
        title: `PartsRadarTW smoke ${notification.kind}`,
        description: [
          `Check: ${formatDiscordWebhookText(notification.checkName, 100)}`,
          `Classification: ${notification.classification}`,
          `First observed (${TAIPEI_TIME_ZONE}): ${formatTaipeiDateTime(new Date(notification.firstObservedAt))}`,
          `Consecutive abnormal cycles: ${notification.consecutiveCount}`,
          `Issue: ${formatDiscordWebhookText(notification.issue, 300)}`,
          `Checked at (${TAIPEI_TIME_ZONE}): ${formatTaipeiDateTime(new Date(notification.observedAt))}`,
        ].join("\n"),
        color: notification.kind === "FAIL" ? SMOKE_EMBED_COLORS.FAIL : SMOKE_EMBED_COLORS.WARN,
      },
    ],
  };
}

export function createMonitorExecutionFailureMessage({
  outcome,
  occurredAt,
  errorKind,
}: {
  outcome: Extract<SmokeCycleOutcome, "ERROR" | "TIMEOUT">;
  occurredAt: Date;
  errorKind: string;
}): DiscordWebhookMessage {
  return {
    username: "PartsRadarTW ops",
    embeds: [
      {
        title: "Production smoke could not complete",
        description: [
          `Outcome: ${outcome}`,
          `Occurred at (${TAIPEI_TIME_ZONE}): ${formatTaipeiDateTime(occurredAt)}`,
          `Error kind: ${formatDiscordWebhookText(errorKind, 120)}`,
          "The monitor itself failed; this does not confirm that every website function is unavailable.",
        ].join("\n"),
        color: SMOKE_EMBED_COLORS.FAIL,
      },
    ],
  };
}
