// apps/crawler/src/scripts/ops/production-smoke-daemon/health.ts
// 純函式判斷 production smoke progress 是否持續完成，不把 WARN summary 誤判為 daemon unhealthy。

import type { SmokeDiscordNotificationStateV2 } from "../smoke-discord-notification";

export interface SmokeProgressHealthResult {
  healthy: boolean;
  reason: string;
  lastCompletedAt: string | null;
  outcome: SmokeDiscordNotificationStateV2["progress"]["lastCycleOutcome"];
}

export function evaluateSmokeProgressHealth({
  state,
  now,
  staleThresholdSeconds,
}: {
  state: SmokeDiscordNotificationStateV2 | null;
  now: Date;
  staleThresholdSeconds: number;
}): SmokeProgressHealthResult {
  if (!state) {
    return unhealthy("state_missing", null, null);
  }

  const { progress } = state;
  const startedAt = toTimestamp(progress.lastCycleStartedAt);
  const completedAt = toTimestamp(progress.lastCycleCompletedAt);
  const staleMs = staleThresholdSeconds * 1000;

  if (startedAt !== null && (completedAt === null || startedAt > completedAt)) {
    if (now.getTime() - startedAt > staleMs) {
      return unhealthy(
        "cycle_in_progress_too_long",
        progress.lastCycleCompletedAt,
        progress.lastCycleOutcome,
      );
    }

    if (completedAt === null) {
      return healthy("initial_cycle_in_progress", null, progress.lastCycleOutcome);
    }
  }

  if (completedAt === null) {
    return unhealthy("cycle_never_completed", null, progress.lastCycleOutcome);
  }

  if (progress.lastCycleOutcome === "ERROR" || progress.lastCycleOutcome === "TIMEOUT") {
    return unhealthy(
      `last_outcome_${progress.lastCycleOutcome.toLowerCase()}`,
      progress.lastCycleCompletedAt,
      progress.lastCycleOutcome,
    );
  }

  if (now.getTime() - completedAt > staleMs) {
    return unhealthy(
      "last_completion_stale",
      progress.lastCycleCompletedAt,
      progress.lastCycleOutcome,
    );
  }

  return healthy(
    "recent_cycle_completed",
    progress.lastCycleCompletedAt,
    progress.lastCycleOutcome,
  );
}

function healthy(
  reason: string,
  lastCompletedAt: string | null,
  outcome: SmokeProgressHealthResult["outcome"],
): SmokeProgressHealthResult {
  return { healthy: true, reason, lastCompletedAt, outcome };
}

function unhealthy(
  reason: string,
  lastCompletedAt: string | null,
  outcome: SmokeProgressHealthResult["outcome"],
): SmokeProgressHealthResult {
  return { healthy: false, reason, lastCompletedAt, outcome };
}

function toTimestamp(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}
