// apps/crawler/tests/scripts/ops/smoke-discord-notification/smoke-discord-notification-state.test.ts
// 驗證 smoke state v1 migration、v2 嚴格 schema 與 atomic round trip。

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  migrateSmokeNotificationStateV1,
  parseSmokeDiscordNotificationState,
  readSmokeDiscordNotificationState,
  writeSmokeDiscordNotificationState,
} from "../../../../src/scripts/ops/smoke-discord-notification";
import { checkState, createWorkspace, state, stateV1 } from "./smoke-discord-notification-support";

describe("production smoke state file", () => {
  it("returns null when the state file does not exist", async () => {
    const workspaceRoot = await createWorkspace();
    await expect(
      readSmokeDiscordNotificationState(join(workspaceRoot, "missing.json")),
    ).resolves.toBeNull();
  });

  it("reads and migrates a valid v1 state without losing aggregate metadata", () => {
    const legacy = stateV1();
    expect(parseSmokeDiscordNotificationState(legacy)).toEqual(
      migrateSmokeNotificationStateV1(legacy),
    );
    expect(parseSmokeDiscordNotificationState(legacy)).toMatchObject({
      version: 2,
      checks: {},
      legacyNotification: {
        lastObservedStatus: "WARN",
        lastNotificationKind: "WARN",
        lastNotificationAt: "2026-06-06T11:00:00.000Z",
        lastNotificationKey: "WARN:WARN:source freshness",
      },
    });
  });

  it("round trips a valid v2 state through an atomic write", async () => {
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
    [{ version: 999 }, "invalid version"],
    [state({ progress: { ...state().progress, consecutiveCycleErrors: -1 } }), "invalid counter"],
    [
      state({ progress: { ...state().progress, lastCycleStartedAt: "not-a-date" } }),
      "invalid date",
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
