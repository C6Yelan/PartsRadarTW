// apps/crawler/src/scripts/ops/production-smoke-daemon/progress.ts
// 建立每輪 smoke start/finish durable progress，不保存 exception stack 或敏感連線資訊。

import type { SmokeStatus } from "../production-smoke";
import type {
  SmokeCycleOutcome,
  SmokeDiscordNotificationStateV2,
} from "../smoke-discord-notification";

export function markSmokeCycleStarted(
  state: SmokeDiscordNotificationStateV2,
  startedAt: Date,
): SmokeDiscordNotificationStateV2 {
  return {
    ...state,
    progress: {
      ...state.progress,
      lastCycleStartedAt: startedAt.toISOString(),
    },
  };
}

export function markSmokeCycleCompleted(
  state: SmokeDiscordNotificationStateV2,
  {
    completedAt,
    durationMs,
    outcome,
  }: { completedAt: Date; durationMs: number; outcome: SmokeStatus },
): SmokeDiscordNotificationStateV2 {
  return {
    ...state,
    progress: {
      lastCycleStartedAt: state.progress.lastCycleStartedAt,
      lastCycleCompletedAt: completedAt.toISOString(),
      lastCycleDurationMs: normalizeDuration(durationMs),
      lastCycleOutcome: outcome,
      lastCycleErrorKind: null,
      consecutiveCycleErrors: 0,
    },
  };
}

export function markSmokeCycleFailed(
  state: SmokeDiscordNotificationStateV2,
  {
    completedAt,
    durationMs,
    outcome,
    errorKind,
  }: {
    completedAt: Date;
    durationMs: number;
    outcome: Extract<SmokeCycleOutcome, "ERROR" | "TIMEOUT">;
    errorKind: string;
  },
): SmokeDiscordNotificationStateV2 {
  return {
    ...state,
    progress: {
      lastCycleStartedAt: state.progress.lastCycleStartedAt,
      lastCycleCompletedAt: completedAt.toISOString(),
      lastCycleDurationMs: normalizeDuration(durationMs),
      lastCycleOutcome: outcome,
      lastCycleErrorKind: sanitizeSmokeErrorKind(errorKind),
      consecutiveCycleErrors: state.progress.consecutiveCycleErrors + 1,
    },
  };
}

export function sanitizeSmokeErrorKind(value: unknown): string {
  const candidate =
    value instanceof Error && value.name ? value.name : typeof value === "string" ? value : "Error";
  const sanitized = candidate.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  return sanitized || "Error";
}

function normalizeDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(value));
}
