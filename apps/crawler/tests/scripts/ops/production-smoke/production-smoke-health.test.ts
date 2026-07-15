// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-health.test.ts
// 驗證唯讀 progress health 規則與 CLI exit code contract。

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkProductionSmokeProgress } from "../../../../src/scripts/ops/check-production-smoke-progress";
import { evaluateSmokeProgressHealth } from "../../../../src/scripts/ops/production-smoke-daemon/health";
import {
  createEmptySmokeDiscordNotificationState,
  writeSmokeDiscordNotificationState,
} from "../../../../src/scripts/ops/smoke-discord-notification";
import { createWorkspace } from "./production-smoke-workspace-support";

const NOW = new Date("2026-06-06T12:15:00.000Z");

describe("production smoke progress health", () => {
  it.each(["OK", "WARN"] as const)("treats a recent %s completion as healthy", (outcome) => {
    expect(
      evaluateSmokeProgressHealth({
        state: progressState({ outcome, completedAt: "2026-06-06T12:10:00.000Z" }),
        now: NOW,
        staleThresholdSeconds: 900,
      }),
    ).toMatchObject({ healthy: true, reason: "recent_cycle_completed" });
  });

  it.each(["ERROR", "TIMEOUT"] as const)("treats recent %s as unhealthy", (outcome) => {
    expect(
      evaluateSmokeProgressHealth({
        state: progressState({ outcome, completedAt: "2026-06-06T12:14:00.000Z" }),
        now: NOW,
        staleThresholdSeconds: 900,
      }),
    ).toMatchObject({ healthy: false, reason: `last_outcome_${outcome.toLowerCase()}` });
  });

  it("rejects a completion older than three production intervals", () => {
    expect(
      evaluateSmokeProgressHealth({
        state: progressState({ outcome: "OK", completedAt: "2026-06-06T11:59:59.000Z" }),
        now: NOW,
        staleThresholdSeconds: 900,
      }),
    ).toMatchObject({ healthy: false, reason: "last_completion_stale" });
  });

  it("rejects a cycle that started after the last completion and exceeded the deadline", () => {
    const state = progressState({ outcome: "OK", completedAt: "2026-06-06T11:50:00.000Z" });
    state.progress.lastCycleStartedAt = "2026-06-06T11:59:59.000Z";
    expect(
      evaluateSmokeProgressHealth({ state, now: NOW, staleThresholdSeconds: 900 }),
    ).toMatchObject({
      healthy: false,
      reason: "cycle_in_progress_too_long",
    });
  });

  it("treats missing state as unhealthy", () => {
    expect(
      evaluateSmokeProgressHealth({ state: null, now: NOW, staleThresholdSeconds: 900 }),
    ).toMatchObject({
      healthy: false,
      reason: "state_missing",
    });
  });

  it("returns CLI exit 0 for healthy state and 1 for missing state", async () => {
    const { workspaceRoot } = await createWorkspace();
    const path = join(workspaceRoot, "state.json");
    await writeSmokeDiscordNotificationState(
      path,
      progressState({ outcome: "WARN", completedAt: "2026-06-06T12:10:00.000Z" }),
    );
    await expect(
      checkProductionSmokeProgress({
        stateFilePath: path,
        staleThresholdSeconds: 900,
        now: NOW,
      }),
    ).resolves.toMatchObject({ exitCode: 0, output: expect.stringContaining("health=healthy") });
    await expect(
      checkProductionSmokeProgress({
        stateFilePath: join(workspaceRoot, "missing.json"),
        staleThresholdSeconds: 900,
        now: NOW,
      }),
    ).resolves.toMatchObject({ exitCode: 1, output: expect.stringContaining("state_missing") });
  });
});

function progressState({
  outcome,
  completedAt,
}: {
  outcome: "OK" | "WARN" | "FAIL" | "ERROR" | "TIMEOUT";
  completedAt: string;
}) {
  const state = createEmptySmokeDiscordNotificationState();
  state.progress = {
    lastCycleStartedAt: completedAt,
    lastCycleCompletedAt: completedAt,
    lastCycleDurationMs: 700,
    lastCycleOutcome: outcome,
    lastCycleErrorKind: outcome === "ERROR" || outcome === "TIMEOUT" ? `${outcome}Kind` : null,
    consecutiveCycleErrors: outcome === "ERROR" || outcome === "TIMEOUT" ? 1 : 0,
  };
  return state;
}
