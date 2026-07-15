// apps/crawler/tests/scripts/ops/smoke-discord-notification/smoke-discord-notification.test.ts
// 驗證 per-check pending、stable recovery、reminder 與 message policy。

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSmokeDiscordNotificationDecision,
  markSmokeNotificationSent,
  parseSmokeDiscordNotificationOptions,
  parseSmokeDiscordNotificationState,
} from "../../../../src/scripts/ops/smoke-discord-notification";
import {
  check,
  checkState,
  createWorkspace,
  historicalV2State,
  POLICY_OPTIONS,
  state,
  summary,
  WEBHOOK_URL,
} from "./smoke-discord-notification-support";

describe("smoke Discord notification options", () => {
  it("uses durable policy defaults", async () => {
    const workspaceRoot = await createWorkspace();
    expect(parseSmokeDiscordNotificationOptions([], {}, workspaceRoot)).toEqual({
      adminWebhookUrl: null,
      stateFilePath: join(workspaceRoot, "storage", "ops", "smoke-discord-state.json"),
      warnReminderSeconds: 43_200,
      failReminderSeconds: 3_600,
      warningPendingCycles: 2,
      filterQualityPendingCycles: 3,
      recoveryGoodCycles: 2,
    });
  });

  it("accepts all policy overrides and rejects unsafe integers", async () => {
    const workspaceRoot = await createWorkspace();
    const options = parseSmokeDiscordNotificationOptions(
      ["--smoke-discord-state-file", "custom/state.json"],
      {
        DISCORD_ADMIN_WEBHOOK_URL: WEBHOOK_URL,
        SMOKE_WARNING_PENDING_CYCLES: "4",
        SMOKE_FILTER_QUALITY_PENDING_CYCLES: "5",
        SMOKE_RECOVERY_GOOD_CYCLES: "3",
        SMOKE_FAIL_REMINDER_SECONDS: "7200",
      },
      workspaceRoot,
    );
    expect(options).toMatchObject({
      adminWebhookUrl: WEBHOOK_URL,
      stateFilePath: join(workspaceRoot, "custom", "state.json"),
      warningPendingCycles: 4,
      filterQualityPendingCycles: 5,
      recoveryGoodCycles: 3,
      failReminderSeconds: 7200,
    });
    expect(() =>
      parseSmokeDiscordNotificationOptions(
        [],
        { SMOKE_WARNING_PENDING_CYCLES: "0" },
        workspaceRoot,
      ),
    ).toThrow("SMOKE_WARNING_PENDING_CYCLES must be an integer");
  });
});

describe("WARN pending and transport-safe metadata", () => {
  it("waits for two general WARN cycles before creating a notification", () => {
    const first = decide("WARN", state(), "2026-06-06T12:00:00.000Z");
    expect(first.notifications).toHaveLength(0);
    expect(first.nextState.checks["source freshness"]).toMatchObject({
      consecutiveBad: 1,
      pendingSince: "2026-06-06T12:00:00.000Z",
      lastNotificationAt: null,
    });

    const second = decide("WARN", first.nextState, "2026-06-06T12:05:00.000Z");
    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0]).toMatchObject({
      kind: "WARN",
      checkName: "source freshness",
      consecutiveCount: 2,
    });
    expect(second.nextState.checks["source freshness"]?.lastNotificationAt).toBeNull();
  });

  it("records notification metadata only after sender success", () => {
    const first = decide("WARN", state(), "2026-06-06T12:00:00.000Z");
    const second = decide("WARN", first.nextState, "2026-06-06T12:05:00.000Z");
    const notification = second.notifications[0];
    if (!notification) throw new Error("Expected WARN notification.");
    const sent = markSmokeNotificationSent({
      state: second.nextState,
      notification,
      sentAt: new Date("2026-06-06T12:05:01.000Z"),
    });
    expect(sent.checks["source freshness"]).toMatchObject({
      activeSince: "2026-06-06T12:00:00.000Z",
      pendingSince: null,
      lastNotificationKind: "WARN",
      lastNotificationAt: "2026-06-06T12:05:01.000Z",
    });
  });

  it("retries an unsent pending notification on the next cycle", () => {
    const first = decide("WARN", state(), "2026-06-06T12:00:00.000Z");
    const second = decide("WARN", first.nextState, "2026-06-06T12:05:00.000Z");
    const third = decide("WARN", second.nextState, "2026-06-06T12:10:00.000Z");
    expect(second.notifications).toHaveLength(1);
    expect(third.notifications).toHaveLength(1);
    expect(third.nextState.checks["source freshness"]?.lastNotificationAt).toBeNull();
  });

  it("uses a stable fingerprint when numeric message details change", () => {
    const first = createSmokeDiscordNotificationDecision({
      summary: summary({
        status: "WARN",
        checks: [check("missing product images", "WARN", "missing=30")],
      }),
      previousState: state(),
      options: POLICY_OPTIONS,
    });
    const second = createSmokeDiscordNotificationDecision({
      summary: summary({
        status: "WARN",
        checkedAt: new Date("2026-06-06T12:05:00.000Z"),
        checks: [check("missing product images", "WARN", "missing=31")],
      }),
      previousState: first.nextState,
      options: POLICY_OPTIONS,
    });
    expect(second.nextState.checks["missing product images"]?.currentFingerprint).toBe(
      "missing product images|WARN|WARNING",
    );
    expect(second.nextState.checks["missing product images"]?.consecutiveBad).toBe(2);
  });
});

describe("filter-quality pending policy", () => {
  it("waits three filter-quality WARN cycles and persists the counter across reads", () => {
    let current = state();
    for (const [index, expectedNotifications] of [0, 0, 1].entries()) {
      const decision = createSmokeDiscordNotificationDecision({
        summary: summary({
          status: "WARN",
          checkedAt: new Date(`2026-06-06T12:${String(index * 5).padStart(2, "0")}:00.000Z`),
          checks: [check("product filter quality", "WARN", `coverage=${90 + index}`)],
        }),
        previousState: parseSmokeDiscordNotificationState(JSON.parse(JSON.stringify(current))),
        options: POLICY_OPTIONS,
      });
      expect(decision.notifications).toHaveLength(expectedNotifications);
      current = decision.nextState;
    }
    expect(current.checks["product filter quality"]?.consecutiveBad).toBe(3);
  });

  it("preserves a notified v2 WARN through cooldown, reminder, and sent-state update", () => {
    const migrated = parseSmokeDiscordNotificationState(historicalV2State());
    expect(migrated).toMatchObject({
      version: 3,
      progress: historicalV2State().progress,
      checks: historicalV2State().checks,
    });

    const nextCycle = decide("WARN", migrated, "2026-06-06T00:05:00.000Z", [
      check("product filter quality", "WARN", "coverage=97.9%"),
    ]);
    expect(nextCycle.notifications).toHaveLength(0);
    expect(nextCycle.nextState.checks["product filter quality"]).toMatchObject({
      activeSince: "2026-06-05T23:50:00.000Z",
      consecutiveBad: 8,
      lastNotificationAt: "2026-06-06T00:00:00.000Z",
      lastNotifiedFingerprint: "product filter quality|WARN|WARNING",
    });

    const beforeBoundary = decide("WARN", migrated, "2026-06-06T11:59:59.000Z", [
      check("product filter quality", "WARN", "coverage=97.9%"),
    ]);
    expect(beforeBoundary.notifications).toHaveLength(0);

    const atBoundary = decide("WARN", migrated, "2026-06-06T12:00:00.000Z", [
      check("product filter quality", "WARN", "coverage=97.9%"),
    ]);
    expect(atBoundary.notifications).toHaveLength(1);
    expect(atBoundary.notifications[0]).toMatchObject({
      kind: "WARN",
      checkName: "product filter quality",
      fingerprint: "product filter quality|WARN|WARNING",
    });

    const notification = atBoundary.notifications[0];
    if (!notification) throw new Error("Expected filter-quality reminder.");
    const sent = markSmokeNotificationSent({
      state: atBoundary.nextState,
      notification,
      sentAt: new Date("2026-06-06T12:00:01.000Z"),
    });
    expect(sent.checks["product filter quality"]).toMatchObject({
      activeSince: "2026-06-05T23:50:00.000Z",
      pendingSince: null,
      lastNotificationKind: "WARN",
      lastNotificationAt: "2026-06-06T12:00:01.000Z",
      lastNotifiedFingerprint: "product filter quality|WARN|WARNING",
    });
  });
});

describe("stable recovery", () => {
  function activeWarningState() {
    return state({
      checks: {
        "source freshness": checkState({
          checkName: "source freshness",
          lastObservedStatus: "WARN",
          currentFingerprint: "source freshness|WARN|WARNING",
          activeSince: "2026-06-06T11:00:00.000Z",
          consecutiveBad: 3,
          lastNotificationKind: "WARN",
          lastNotificationAt: "2026-06-06T11:05:00.000Z",
          lastNotifiedFingerprint: "source freshness|WARN|WARNING",
        }),
      },
    });
  }

  it("requires two good cycles after an active warning", () => {
    const first = decide("OK", activeWarningState(), "2026-06-06T12:00:00.000Z", [
      check("source freshness", "OK"),
    ]);
    expect(first.notifications).toHaveLength(0);
    expect(first.nextState.checks["source freshness"]?.consecutiveGood).toBe(1);
    const second = decide("OK", first.nextState, "2026-06-06T12:05:00.000Z", [
      check("source freshness", "OK"),
    ]);
    expect(second.notifications[0]).toMatchObject({
      kind: "RECOVERED",
      checkName: "source freshness",
      consecutiveCount: 2,
      previousStatus: "WARN",
    });
  });

  it("resets good cycles when abnormal returns", () => {
    const good = decide("OK", activeWarningState(), "2026-06-06T12:00:00.000Z", [
      check("source freshness", "OK"),
    ]);
    const bad = decide("WARN", good.nextState, "2026-06-06T12:05:00.000Z");
    expect(bad.nextState.checks["source freshness"]?.consecutiveGood).toBe(0);
  });

  it("does not recover a pending issue that was never notified", () => {
    const pending = decide("WARN", state(), "2026-06-06T12:00:00.000Z");
    const good = decide("OK", pending.nextState, "2026-06-06T12:05:00.000Z", [
      check("source freshness", "OK"),
    ]);
    expect(good.notifications).toHaveLength(0);
  });

  it("recovers only the actual check while another active check remains", () => {
    const previous = activeWarningState();
    previous.checks["missing product images"] = checkState({
      checkName: "missing product images",
      lastObservedStatus: "WARN",
      currentFingerprint: "missing product images|WARN|WARNING",
      activeSince: "2026-06-06T11:00:00.000Z",
      consecutiveBad: 3,
      lastNotificationKind: "WARN",
      lastNotificationAt: "2026-06-06T11:05:00.000Z",
      lastNotifiedFingerprint: "missing product images|WARN|WARNING",
    });
    const first = decide("WARN", previous, "2026-06-06T12:00:00.000Z", [
      check("source freshness", "OK"),
      check("missing product images", "WARN"),
    ]);
    const second = decide("WARN", first.nextState, "2026-06-06T12:05:00.000Z", [
      check("source freshness", "OK"),
      check("missing product images", "WARN"),
    ]);
    expect(second.notifications).toHaveLength(1);
    expect(second.notifications[0]?.checkName).toBe("source freshness");
    expect(second.notifications[0]?.message.embeds?.[0]?.description).toContain(
      "Recovered check: source freshness",
    );
  });
});

describe("severity, independent causes, REPORT, and reminders", () => {
  it("pages immediately when WARN escalates to FAIL", () => {
    const pending = decide("WARN", state(), "2026-06-06T12:00:00.000Z");
    const failed = decide("FAIL", pending.nextState, "2026-06-06T12:05:00.000Z");
    expect(failed.notifications[0]).toMatchObject({ kind: "FAIL", classification: "PAGE" });
  });

  it("does not hide a new check behind another WARN cooldown", () => {
    const previous = state({
      checks: {
        "source freshness": checkState({
          checkName: "source freshness",
          lastObservedStatus: "WARN",
          currentFingerprint: "source freshness|WARN|WARNING",
          activeSince: "2026-06-06T10:00:00.000Z",
          consecutiveBad: 5,
          lastNotificationKind: "WARN",
          lastNotificationAt: "2026-06-06T11:55:00.000Z",
          lastNotifiedFingerprint: "source freshness|WARN|WARNING",
        }),
      },
    });
    const first = decide("WARN", previous, "2026-06-06T12:00:00.000Z", [
      check("source freshness", "WARN"),
      check("missing product images", "WARN"),
    ]);
    const second = decide("WARN", first.nextState, "2026-06-06T12:05:00.000Z", [
      check("source freshness", "WARN"),
      check("missing product images", "WARN"),
    ]);
    expect(second.notifications.map((item) => item.checkName)).toEqual(["missing product images"]);
  });

  it("keeps REPORT observations in state without Discord candidates", () => {
    const decision = decide("WARN", state(), "2026-06-06T12:00:00.000Z", [
      check("recent suspected blocks", "WARN"),
    ]);
    expect(decision.nextState.checks["recent suspected blocks"]?.classification).toBe("REPORT");
    expect(decision.notifications).toHaveLength(0);
  });

  it.each([
    ["WARN" as const, 43_200],
    ["FAIL" as const, 3_600],
  ])("reminds %s at its cooldown boundary", (status, reminderSeconds) => {
    const name = "source freshness";
    const classification = status === "FAIL" ? "PAGE" : "WARNING";
    const fingerprint = `${name}|${status}|${classification}`;
    const previous = state({
      checks: {
        [name]: checkState({
          checkName: name,
          classification,
          lastObservedStatus: status,
          currentFingerprint: fingerprint,
          activeSince: "2026-06-06T00:00:00.000Z",
          consecutiveBad: 9,
          lastNotificationKind: status,
          lastNotificationAt: "2026-06-06T00:00:00.000Z",
          lastNotifiedFingerprint: fingerprint,
        }),
      },
    });
    const before = decide(
      status,
      previous,
      new Date(Date.parse("2026-06-06T00:00:00.000Z") + (reminderSeconds - 1) * 1000).toISOString(),
    );
    expect(before.notifications).toHaveLength(0);
    const due = decide(
      status,
      previous,
      new Date(Date.parse("2026-06-06T00:00:00.000Z") + reminderSeconds * 1000).toISOString(),
    );
    expect(due.notifications[0]?.kind).toBe(status);
  });
});

function decide(
  status: "OK" | "WARN" | "FAIL",
  previousState: ReturnType<typeof state>,
  checkedAt: string,
  checks?: ReturnType<typeof check>[],
) {
  return createSmokeDiscordNotificationDecision({
    summary: summary({ status, checkedAt: new Date(checkedAt), checks }),
    previousState,
    options: POLICY_OPTIONS,
  });
}
