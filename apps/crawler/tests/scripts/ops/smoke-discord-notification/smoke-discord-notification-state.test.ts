// apps/crawler/tests/scripts/ops/smoke-discord-notification/smoke-discord-notification-state.test.ts
// 驗證 smoke state v2 到 v3 升級、嚴格 schema 與 atomic round trip。

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEmptySmokeDiscordNotificationState,
  parseSmokeDiscordNotificationState,
  readSmokeDiscordNotificationState,
  writeSmokeDiscordNotificationState,
} from "../../../../src/scripts/ops/smoke-discord-notification";
import {
  checkState,
  createWorkspace,
  historicalV2State,
  state,
} from "./smoke-discord-notification-support";

describe("production smoke state file", () => {
  it("returns null when the state file does not exist", async () => {
    const workspaceRoot = await createWorkspace();
    await expect(
      readSmokeDiscordNotificationState(join(workspaceRoot, "missing.json")),
    ).resolves.toBeNull();
  });

  it("creates and parses the fixed v3 empty state shape", () => {
    const empty = createEmptySmokeDiscordNotificationState();
    expect(empty).toEqual({
      version: 3,
      progress: {
        lastCycleStartedAt: null,
        lastCycleCompletedAt: null,
        lastCycleDurationMs: null,
        lastCycleOutcome: null,
        lastCycleErrorKind: null,
        consecutiveCycleErrors: 0,
      },
      checks: {},
    });
    expect(Object.keys(empty)).toEqual(["version", "progress", "checks"]);
    expect(parseSmokeDiscordNotificationState(empty)).toEqual(empty);
  });

  it("migrates historical and post-cleanup v2 states without losing durable data", () => {
    for (const v2 of [
      historicalV2State(true),
      historicalV2State(false),
      { ...historicalV2State(false), legacyNotification: null },
    ]) {
      const migrated = parseSmokeDiscordNotificationState(v2);

      expect(migrated.version).toBe(3);
      expect(migrated.progress).toEqual(v2.progress);
      expect(migrated.checks).toEqual(v2.checks);
      expect(migrated).not.toHaveProperty("legacyNotification");
    }
  });

  it("round trips a valid v3 state through an atomic write", async () => {
    const workspaceRoot = await createWorkspace();
    const path = join(workspaceRoot, "storage", "ops", "state.json");
    const expected = state({
      progress: {
        lastCycleStartedAt: "2026-06-06T12:00:00.000Z",
        lastCycleCompletedAt: "2026-06-06T12:00:01.000Z",
        lastCycleDurationMs: 1000,
        lastCycleOutcome: "WARN",
        lastCycleErrorKind: null,
        consecutiveCycleErrors: 0,
      },
      checks: {
        "source freshness": checkState({
          checkName: "source freshness",
          lastObservedStatus: "WARN",
          currentFingerprint: "source freshness|WARN|WARNING",
          consecutiveBad: 2,
        }),
      },
    });
    await writeSmokeDiscordNotificationState(path, expected);
    await expect(readSmokeDiscordNotificationState(path)).resolves.toEqual(expected);
    expect((await readdir(dirname(path))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it.each([
    [{ ...state(), version: Number("1") }, "old version"],
    [{ ...state(), version: 999 }, "unknown version"],
    [{ progress: state().progress, checks: {} }, "missing version"],
    [{ ...state(), obsoleteField: null }, "unexpected top-level field"],
    [{ ...historicalV2State(), obsoleteField: null }, "unexpected v2 top-level field"],
    [
      { ...historicalV2State(), legacyNotification: { lastObservedStatus: "WARN" } },
      "invalid legacy notification",
    ],
    [state({ progress: { ...state().progress, consecutiveCycleErrors: -1 } }), "invalid counter"],
    [
      state({ progress: { ...state().progress, obsoleteField: null } as never }),
      "unexpected progress field",
    ],
    [
      state({ progress: { ...state().progress, lastCycleStartedAt: "not-a-date" } }),
      "invalid date",
    ],
    [
      state({
        checks: {
          homepage: { ...checkState({ checkName: "homepage" }), consecutiveBad: -1 },
        },
      }),
      "invalid check",
    ],
    [
      state({
        checks: {
          homepage: { ...checkState({ checkName: "homepage" }), obsoleteField: null } as never,
        },
      }),
      "unexpected check field",
    ],
  ])("rejects %s", (value, _label) => {
    expect(() => parseSmokeDiscordNotificationState(value)).toThrow(
      "Invalid production smoke state file.",
    );
  });

  it("rejects corrupted JSON without exposing its contents", async () => {
    const workspaceRoot = await createWorkspace();
    const path = join(workspaceRoot, "storage", "ops", "state.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{not-json SECRET_VALUE", "utf8");
    await expect(readSmokeDiscordNotificationState(path)).rejects.toThrow();
  });
});
