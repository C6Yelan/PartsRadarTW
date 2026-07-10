// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-daemon.test.ts
// 驗證 production smoke daemon 的排程參數、摘要 log 與 Discord admin webhook 告警 state 行為。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logProductionSmokeDaemonSummary,
  parseProductionSmokeDaemonOptions,
  runProductionSmokeDaemon,
} from "../../../../src/scripts/ops/production-smoke-daemon";
import { readSmokeDiscordNotificationState } from "../../../../src/scripts/ops/smoke-discord-notification";
import {
  createSmokeClient,
  createWorkspace,
  DISCORD_ADMIN_WEBHOOK_URL,
  idleShutdown,
  type SendDiscordWebhook,
  stubHealthyPublicApi,
} from "./production-smoke-support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("production smoke daemon options", () => {
  it("uses a lower-noise daemon interval by default", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseProductionSmokeDaemonOptions([], {}, crawlerCwd);

    expect(options.intervalSeconds).toBe(900);
    expect(options.initialDelaySeconds).toBe(60);
    expect(options.runOnce).toBe(false);
    expect(options.smokeDiscordNotification.cooldownSeconds).toBe(21600);
  });

  it("adds daemon interval and run-once options", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--interval-seconds", "600", "--initial-delay-seconds", "0"],
      {},
      crawlerCwd,
    );

    expect(options.runOnce).toBe(true);
    expect(options.intervalSeconds).toBe(600);
    expect(options.initialDelaySeconds).toBe(0);
  });

  it("adds smoke Discord notification options", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const options = parseProductionSmokeDaemonOptions(
      [
        "--run-once",
        "--smoke-discord-state-file",
        "custom/smoke-state.json",
        "--smoke-discord-cooldown-seconds",
        "120",
      ],
      {
        DISCORD_ADMIN_WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: "ignored/state.json",
        SMOKE_DISCORD_COOLDOWN_SECONDS: "999",
      },
      crawlerCwd,
    );

    expect(options.smokeDiscordNotification).toEqual({
      adminWebhookUrl: DISCORD_ADMIN_WEBHOOK_URL,
      stateFilePath: join(workspaceRoot, "custom", "smoke-state.json"),
      cooldownSeconds: 120,
    });
  });
});

describe("production smoke daemon output", () => {
  it("logs one compact status line and only WARN/FAIL details", () => {
    const logs: string[] = [];

    logProductionSmokeDaemonSummary(
      {
        checkedAt: new Date("2026-06-02T12:00:00.000Z"),
        status: "WARN",
        checks: [
          { name: "homepage", status: "OK", message: "HTTP 200" },
          { name: "rate limit headers", status: "WARN", message: "clientSource=unknown" },
        ],
      },
      (message) => logs.push(message),
    );

    expect(logs).toEqual([
      "Production smoke finished. status=WARN ok=1 warn=1 fail=0",
      "Production smoke issue. status=WARN check=rate limit headers message=clientSource=unknown",
    ]);
  });
});

describe("production smoke daemon Discord notifications", () => {
  it("sends a WARN notification and writes state after a smoke summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-discord-state.json");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const sendDiscordWebhook = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    const logMessage = vi.fn();
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--initial-delay-seconds", "0", "--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        DISCORD_ADMIN_WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: stateFilePath,
      },
      crawlerCwd,
    );

    await runProductionSmokeDaemon({
      client: createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }) as unknown as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage,
      sendDiscordWebhook,
    });

    expect(sendDiscordWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookUrl: DISCORD_ADMIN_WEBHOOK_URL,
        message: expect.objectContaining({
          embeds: [
            expect.objectContaining({
              title: "PartsRadarTW smoke WARN",
            }),
          ],
        }),
      }),
    );
    const webhookCall = sendDiscordWebhook.mock.calls[0]?.[0];
    if (!webhookCall) {
      throw new Error("Expected Discord webhook sender call.");
    }
    expect(webhookCall.message.content).toBeUndefined();
    expect(webhookCall.message.embeds?.[0]?.description).toContain("Issues:");
    expect(webhookCall.message.embeds?.[0]?.description).toContain(
      "Checked at (Asia/Taipei): 2026-06-02 20:00:00",
    );
    expect(webhookCall.message.embeds?.[0]?.timestamp).toBeUndefined();
    expect(webhookCall.message.embeds?.[0]?.description).toContain(
      "- WARN rate limit headers: clientSource=unknown limit=360 remaining=359; public HTTPS smoke should expose client identity",
    );
    expect(webhookCall.message.embeds?.[0]?.description).not.toContain("Runbook:");
    expect(logMessage).toHaveBeenCalledWith(
      "Smoke Discord notification sent. kind=WARN httpStatus=204",
    );
    await expect(readSmokeDiscordNotificationState(stateFilePath)).resolves.toMatchObject({
      lastObservedStatus: "WARN",
      lastNotificationKind: "WARN",
      lastNotificationKey: "WARN:WARN:rate limit headers",
    });
  });

  it("sends an admin WARN notification for Discord bot delivery issues", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-discord-state.json");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const sendDiscordWebhook = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--initial-delay-seconds", "0", "--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        DISCORD_ADMIN_WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: stateFilePath,
      },
      crawlerCwd,
    );

    await runProductionSmokeDaemon({
      client: createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
        discordDeliveryCounts: {
          failed: 2,
          rateLimited: 1,
        },
      }) as unknown as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage: vi.fn(),
      sendDiscordWebhook,
    });

    const webhookCall = sendDiscordWebhook.mock.calls[0]?.[0];
    if (!webhookCall) {
      throw new Error("Expected Discord webhook sender call.");
    }

    expect(webhookCall.message.embeds?.[0]).toMatchObject({
      title: "PartsRadarTW smoke WARN",
    });
    expect(webhookCall.message.embeds?.[0]?.description).toContain(
      "- WARN discord bot deliveries: personalFailed=2 personalRateLimited=1 publicFailed=0 publicRateLimited=0 in 24h",
    );
    await expect(readSmokeDiscordNotificationState(stateFilePath)).resolves.toMatchObject({
      lastObservedStatus: "WARN",
      lastNotificationKind: "WARN",
      lastNotificationKey: "WARN:WARN:discord bot deliveries",
    });
  });

  it("does not send or write state when the admin webhook is not configured", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-discord-state.json");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const sendDiscordWebhook = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--initial-delay-seconds", "0", "--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        SMOKE_DISCORD_STATE_FILE: stateFilePath,
      },
      crawlerCwd,
    );

    await runProductionSmokeDaemon({
      client: createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }) as unknown as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage: vi.fn(),
      sendDiscordWebhook,
    });

    expect(sendDiscordWebhook).not.toHaveBeenCalled();
    await expect(readSmokeDiscordNotificationState(stateFilePath)).resolves.toBeNull();
  });

  it("logs Discord send failures without writing notification state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-discord-state.json");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const sendDiscordWebhook = vi.fn<SendDiscordWebhook>(
      async () =>
        ({
          status: "failed",
          httpStatus: 500,
          message: "Discord webhook returned HTTP 500.",
        }) as const,
    );
    const logMessage = vi.fn();
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--initial-delay-seconds", "0", "--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        DISCORD_ADMIN_WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: stateFilePath,
      },
      crawlerCwd,
    );

    await runProductionSmokeDaemon({
      client: createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }) as unknown as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage,
      sendDiscordWebhook,
    });

    expect(logMessage).toHaveBeenCalledWith(
      "Smoke Discord notification failed. httpStatus=500 message=Discord webhook returned HTTP 500.",
    );
    await expect(readSmokeDiscordNotificationState(stateFilePath)).resolves.toBeNull();
  });
});
