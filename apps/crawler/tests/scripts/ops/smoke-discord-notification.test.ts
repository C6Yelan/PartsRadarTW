// apps/crawler/tests/scripts/ops/smoke-discord-notification.test.ts
// 驗證 production smoke Discord 告警 options、通知決策、cooldown、fingerprint 與恢復通知。

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSmokeDiscordNotificationDecision,
  parseSmokeDiscordNotificationOptions,
} from "../../../src/scripts/ops/smoke-discord-notification";
import { check, createWorkspace, state, summary, WEBHOOK_URL } from "./smoke-discord-notification-support";

describe("smoke Discord notification options", () => {
  it("uses disabled webhook defaults and workspace-relative state path", async () => {
    const workspaceRoot = await createWorkspace();
    const options = parseSmokeDiscordNotificationOptions([], {}, workspaceRoot);

    expect(options).toEqual({
      adminWebhookUrl: null,
      stateFilePath: join(workspaceRoot, "storage", "ops", "smoke-discord-state.json"),
      cooldownSeconds: 3600,
    });
  });

  it("accepts webhook, cooldown, and state path overrides", async () => {
    const workspaceRoot = await createWorkspace();
    const options = parseSmokeDiscordNotificationOptions(
      [
        "--smoke-discord-state-file",
        "custom/smoke-state.json",
        "--smoke-discord-cooldown-seconds",
        "120",
      ],
      {
        DISCORD_ADMIN_WEBHOOK_URL: WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: "ignored/state.json",
        SMOKE_DISCORD_COOLDOWN_SECONDS: "999",
      },
      workspaceRoot,
    );

    expect(options).toEqual({
      adminWebhookUrl: WEBHOOK_URL,
      stateFilePath: join(workspaceRoot, "custom", "smoke-state.json"),
      cooldownSeconds: 120,
    });
  });
});

describe("createSmokeDiscordNotificationDecision", () => {
  it("skips without changing state when the admin webhook is missing", () => {
    const previousState = state({ status: "OK" });
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({ status: "FAIL" }),
      previousState,
      options: { adminWebhookUrl: null, cooldownSeconds: 3600 },
      now: new Date("2026-06-06T12:00:00.000Z"),
    });

    expect(decision).toEqual({
      action: "skip",
      reason: "missing_webhook_url",
      nextState: previousState,
    });
  });

  it("skips OK smoke without a previous alert but records the observed OK state", () => {
    const checkedAt = new Date("2026-06-06T12:00:00.000Z");
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({ status: "OK", checkedAt }),
      previousState: null,
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
    });

    expect(decision).toEqual({
      action: "skip",
      reason: "status_ok_without_previous_alert",
      nextState: {
        version: 1,
        lastObservedStatus: "OK",
        lastObservedAt: checkedAt.toISOString(),
        lastNotificationKind: null,
        lastNotificationKey: null,
        lastNotificationAt: null,
      },
    });
  });

  it("sends WARN when smoke moves from OK to WARN", () => {
    const checkedAt = new Date("2026-06-06T12:00:00.000Z");
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({
        status: "WARN",
        checkedAt,
        checks: [
          check("homepage", "OK", "HTTP 200"),
          check("source freshness", "WARN", "lastSuccessAt=90m ago"),
        ],
      }),
      previousState: state({ status: "OK" }),
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
    });

    expect(decision).toMatchObject({
      action: "send",
      kind: "WARN",
      notificationKey: "WARN:WARN:source freshness",
      nextState: {
        lastObservedStatus: "WARN",
        lastNotificationKind: "WARN",
        lastNotificationKey: "WARN:WARN:source freshness",
        lastNotificationAt: checkedAt.toISOString(),
      },
    });

    if (decision.action !== "send") {
      throw new Error("Expected send decision.");
    }

    expect(decision.message.content).toBeUndefined();
    expect(decision.message.username).toBe("PartsRadarTW ops");
    expect(decision.message.embeds?.[0]).toMatchObject({
      title: "PartsRadarTW smoke WARN",
      color: 0xf59e0b,
      timestamp: checkedAt.toISOString(),
    });
    expect(decision.message.embeds?.[0]?.description).toContain("Status: WARN");
    expect(decision.message.embeds?.[0]?.description).toContain("Issues:");
    expect(decision.message.embeds?.[0]?.description).toContain(
      "- WARN source freshness: lastSuccessAt=90m ago",
    );
    expect(decision.message.embeds?.[0]?.description).not.toContain("Runbook:");
  });

  it("skips repeated unchanged WARN within cooldown", () => {
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({ status: "WARN" }),
      previousState: state({
        status: "WARN",
        lastNotificationKey: "WARN:WARN:source freshness",
        lastNotificationAt: "2026-06-06T11:30:00.000Z",
      }),
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
      now: new Date("2026-06-06T12:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "skip",
      reason: "unchanged_within_cooldown",
      nextState: {
        lastObservedStatus: "WARN",
        lastNotificationKey: "WARN:WARN:source freshness",
        lastNotificationAt: "2026-06-06T11:30:00.000Z",
      },
    });
  });

  it("sends repeated unchanged WARN after cooldown", () => {
    const checkedAt = new Date("2026-06-06T12:00:00.000Z");
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({ status: "WARN", checkedAt }),
      previousState: state({
        status: "WARN",
        lastNotificationKey: "WARN:WARN:source freshness",
        lastNotificationAt: "2026-06-06T10:00:00.000Z",
      }),
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
      now: checkedAt,
    });

    expect(decision).toMatchObject({
      action: "send",
      kind: "WARN",
      nextState: {
        lastNotificationAt: checkedAt.toISOString(),
      },
    });
  });

  it("sends when WARN issue fingerprint changes inside cooldown", () => {
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({
        status: "WARN",
        checks: [check("link health", "WARN", "temporary=120")],
      }),
      previousState: state({
        status: "WARN",
        lastNotificationKey: "WARN:WARN:source freshness",
        lastNotificationAt: "2026-06-06T11:55:00.000Z",
      }),
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
      now: new Date("2026-06-06T12:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "send",
      kind: "WARN",
      notificationKey: "WARN:WARN:link health",
    });
  });

  it("sends immediately when WARN escalates to FAIL", () => {
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({
        status: "FAIL",
        checks: [check("crawler freshness", "FAIL", "last run too old")],
      }),
      previousState: state({
        status: "WARN",
        lastNotificationKey: "WARN:WARN:source freshness",
        lastNotificationAt: "2026-06-06T11:59:00.000Z",
      }),
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
      now: new Date("2026-06-06T12:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "send",
      kind: "FAIL",
      notificationKey: "FAIL:FAIL:crawler freshness",
    });
  });

  it("sends RECOVERED when WARN or FAIL returns to OK", () => {
    const checkedAt = new Date("2026-06-06T12:00:00.000Z");
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({ status: "OK", checkedAt, checks: [check("homepage", "OK")] }),
      previousState: state({
        status: "FAIL",
        lastNotificationKey: "FAIL:FAIL:crawler freshness",
        lastNotificationAt: "2026-06-06T11:00:00.000Z",
      }),
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
      now: checkedAt,
    });

    expect(decision).toMatchObject({
      action: "send",
      kind: "RECOVERED",
      notificationKey: "RECOVERED:FAIL->OK",
      nextState: {
        lastObservedStatus: "OK",
        lastNotificationKind: "RECOVERED",
        lastNotificationKey: "RECOVERED:FAIL->OK",
        lastNotificationAt: checkedAt.toISOString(),
      },
    });

    if (decision.action !== "send") {
      throw new Error("Expected send decision.");
    }

    expect(decision.message.content).toBeUndefined();
    expect(decision.message.embeds?.[0]).toMatchObject({
      title: "PartsRadarTW smoke RECOVERED",
      color: 0x16a34a,
      timestamp: checkedAt.toISOString(),
    });
    expect(decision.message.embeds?.[0]?.description).toContain("Previous status: FAIL");
    expect(decision.message.embeds?.[0]?.description).toContain("Current state:");
    expect(decision.message.embeds?.[0]?.description).toContain("- OK homepage: homepage OK");
    expect(decision.message.embeds?.[0]?.description).not.toContain("Runbook:");
  });

  it("skips subsequent OK after recovered notification", () => {
    const decision = createSmokeDiscordNotificationDecision({
      summary: summary({ status: "OK", checks: [check("homepage", "OK")] }),
      previousState: state({
        status: "OK",
        lastNotificationKind: "RECOVERED",
        lastNotificationKey: "RECOVERED:FAIL->OK",
        lastNotificationAt: "2026-06-06T11:00:00.000Z",
      }),
      options: { adminWebhookUrl: WEBHOOK_URL, cooldownSeconds: 3600 },
      now: new Date("2026-06-06T12:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "skip",
      reason: "status_ok_without_previous_alert",
      nextState: {
        lastObservedStatus: "OK",
        lastNotificationKind: "RECOVERED",
        lastNotificationKey: "RECOVERED:FAIL->OK",
      },
    });
  });
});
