// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-daemon.test.ts
// 驗證 durable progress、transport 解耦、fatal exception/timeout 與固定結構 cycle log。

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  logProductionSmokeDaemonSummary,
  runProductionSmokeDaemon,
  SmokeCycleTimeoutError,
  withSmokeCycleTimeout,
} from "../../../../src/scripts/ops/production-smoke-daemon";
import { parseProductionSmokeDaemonOptions } from "../../../../src/scripts/ops/production-smoke-daemon/options";
import { readSmokeDiscordNotificationState } from "../../../../src/scripts/ops/smoke-discord-notification";
import {
  createWorkspace,
  DISCORD_ADMIN_WEBHOOK_URL,
  idleShutdown,
} from "./production-smoke-support";

type SendDiscordWebhook = NonNullable<
  Parameters<typeof runProductionSmokeDaemon>[0]["sendDiscordWebhook"]
>;

describe("production smoke daemon options", () => {
  it("matches the production five-minute interval and reliability defaults", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseProductionSmokeDaemonOptions([], {}, crawlerCwd);
    expect(options).toMatchObject({
      intervalSeconds: 300,
      initialDelaySeconds: 60,
      cycleTimeoutMs: 30_000,
      runOnce: false,
      smokeDiscordNotification: {
        warnReminderSeconds: 43_200,
        failReminderSeconds: 3_600,
        warningPendingCycles: 2,
        filterQualityPendingCycles: 3,
        recoveryGoodCycles: 2,
      },
    });
  });

  it("accepts timeout override and rejects an unsafe deadline", async () => {
    const { crawlerCwd } = await createWorkspace();
    expect(
      parseProductionSmokeDaemonOptions(["--cycle-timeout-ms", "5000"], {}, crawlerCwd)
        .cycleTimeoutMs,
    ).toBe(5000);
    expect(() =>
      parseProductionSmokeDaemonOptions(["--cycle-timeout-ms", "4999"], {}, crawlerCwd),
    ).toThrow("SMOKE_CYCLE_TIMEOUT_MS must be an integer");
  });
});

describe("production smoke daemon output", () => {
  it("keeps compact summary logging and excludes OK details", () => {
    const logs: string[] = [];
    logProductionSmokeDaemonSummary(smokeSummary("WARN"), (message) => logs.push(message));
    expect(logs).toEqual([
      "Production smoke finished. status=WARN ok=1 warn=1 fail=0",
      "Production smoke issue. status=WARN check=source freshness message=source freshness WARN",
    ]);
  });
});

describe("production smoke daemon durable lifecycle", () => {
  it("enforces the 30-second deadline with a fake timer", async () => {
    vi.useFakeTimers();
    const timed = withSmokeCycleTimeout(new Promise<never>(() => {}), 30_000);
    const rejection = expect(timed).rejects.toBeInstanceOf(SmokeCycleTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    vi.useRealTimers();
  });

  it("writes progress even when the webhook is missing", async () => {
    const fixture = await createDaemonFixture({ webhook: false });
    const sendDiscordWebhook = vi.fn();
    const logs: string[] = [];
    await runProductionSmokeDaemon({
      ...fixture.runOptions,
      runSmoke: async () => smokeSummary("WARN"),
      now: sequenceNow("2026-06-06T12:00:00.000Z", "2026-06-06T12:00:00.700Z"),
      createRunId: () => "run-1",
      logMessage: (message) => logs.push(message),
      sendDiscordWebhook,
    });
    expect(sendDiscordWebhook).not.toHaveBeenCalled();
    await expect(readSmokeDiscordNotificationState(fixture.stateFilePath)).resolves.toMatchObject({
      version: 2,
      progress: {
        lastCycleStartedAt: "2026-06-06T12:00:00.000Z",
        lastCycleCompletedAt: "2026-06-06T12:00:00.700Z",
        lastCycleDurationMs: 700,
        lastCycleOutcome: "WARN",
        consecutiveCycleErrors: 0,
      },
      checks: { "source freshness": { consecutiveBad: 1 } },
    });
    expect(logs).toContain(
      "Production smoke cycle start. runId=run-1 startedAt=2026-06-06T12:00:00.000Z",
    );
    expect(logs).toContain(
      "Production smoke cycle finish. runId=run-1 startedAt=2026-06-06T12:00:00.000Z durationMs=700 outcome=WARN ok=1 warn=1 fail=0 notification=none",
    );
  });

  it("sends a general WARN only on the second persisted cycle", async () => {
    const fixture = await createDaemonFixture({ webhook: true });
    const sender = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    await runOneWarn(fixture, sender, "2026-06-06T12:00:00.000Z");
    expect(sender).not.toHaveBeenCalled();
    await runOneWarn(fixture, sender, "2026-06-06T12:05:00.000Z");
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0]?.[0].message.embeds?.[0]).toMatchObject({
      title: "PartsRadarTW smoke WARN",
    });
    await expect(readSmokeDiscordNotificationState(fixture.stateFilePath)).resolves.toMatchObject({
      checks: {
        "source freshness": {
          lastNotificationKind: "WARN",
          lastNotificationAt: "2026-06-06T12:05:00.700Z",
        },
      },
    });
  });

  it.each([
    "failed",
    "rate_limited",
  ] as const)("keeps observation counters but no notification metadata when sender is %s", async (senderStatus) => {
    const fixture = await createDaemonFixture({ webhook: true });
    const sender = vi.fn<SendDiscordWebhook>(async () =>
      senderStatus === "failed"
        ? ({ status: "failed", httpStatus: 500, message: "HTTP 500" } as const)
        : ({ status: "rate_limited", httpStatus: 429, retryAfterMs: 1000, global: false } as const),
    );
    await runOneWarn(fixture, sender, "2026-06-06T12:00:00.000Z");
    await runOneWarn(fixture, sender, "2026-06-06T12:05:00.000Z");
    await expect(readSmokeDiscordNotificationState(fixture.stateFilePath)).resolves.toMatchObject({
      checks: {
        "source freshness": {
          consecutiveBad: 2,
          lastNotificationAt: null,
          lastNotificationKind: null,
        },
      },
    });
    await runOneWarn(fixture, sender, "2026-06-06T12:10:00.000Z");
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("records ERROR, best-effort alerts, and exits before sleep", async () => {
    const fixture = await createDaemonFixture({ webhook: true, runOnce: false });
    const sender = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    const sleep = vi.fn(async () => undefined);
    await expect(
      runProductionSmokeDaemon({
        ...fixture.runOptions,
        shutdown: { requested: false, sleep },
        runSmoke: async () => {
          throw Object.assign(new Error("DATABASE_URL=secret"), { name: "PrismaQueryError" });
        },
        now: sequenceNow("2026-06-06T12:00:00.000Z", "2026-06-06T12:00:00.500Z"),
        sendDiscordWebhook: sender,
      }),
    ).rejects.toThrow("DATABASE_URL=secret");
    expect(sleep).not.toHaveBeenCalled();
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0]?.[0].message.embeds?.[0]?.description).toContain("Outcome: ERROR");
    expect(sender.mock.calls[0]?.[0].message.embeds?.[0]?.description).not.toContain(
      "DATABASE_URL",
    );
    await expect(readSmokeDiscordNotificationState(fixture.stateFilePath)).resolves.toMatchObject({
      progress: {
        lastCycleOutcome: "ERROR",
        lastCycleErrorKind: "PrismaQueryError",
        consecutiveCycleErrors: 1,
      },
    });
  });

  it("keeps ERROR progress when the execution-failure notification sender fails", async () => {
    const fixture = await createDaemonFixture({ webhook: true });
    const sender = vi.fn<SendDiscordWebhook>(async () => ({
      status: "failed",
      httpStatus: 500,
      message: "Discord webhook returned HTTP 500.",
    }));
    await expect(
      runProductionSmokeDaemon({
        ...fixture.runOptions,
        runSmoke: async () => {
          throw Object.assign(new Error("query failed"), { name: "DatabaseQueryError" });
        },
        now: sequenceNow("2026-06-06T12:00:00.000Z", "2026-06-06T12:00:00.500Z"),
        sendDiscordWebhook: sender,
      }),
    ).rejects.toThrow("query failed");
    await expect(readSmokeDiscordNotificationState(fixture.stateFilePath)).resolves.toMatchObject({
      progress: { lastCycleOutcome: "ERROR", lastCycleErrorKind: "DatabaseQueryError" },
      checks: {
        "production smoke execution": {
          lastNotificationAt: null,
          lastNotificationKind: null,
        },
      },
    });
  });

  it("records TIMEOUT and never starts a sleep or overlapping next cycle", async () => {
    const fixture = await createDaemonFixture({ webhook: true, runOnce: false });
    const sender = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    const sleep = vi.fn(async () => undefined);
    const runSmoke = vi.fn(() => new Promise<never>(() => {}));
    await expect(
      runProductionSmokeDaemon({
        ...fixture.runOptions,
        shutdown: { requested: false, sleep },
        runSmoke,
        runWithTimeout: async () => {
          throw new SmokeCycleTimeoutError(30_000);
        },
        now: sequenceNow("2026-06-06T12:00:00.000Z", "2026-06-06T12:00:30.000Z"),
        sendDiscordWebhook: sender,
      }),
    ).rejects.toBeInstanceOf(SmokeCycleTimeoutError);
    expect(runSmoke).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(sender).toHaveBeenCalledTimes(1);
    await expect(readSmokeDiscordNotificationState(fixture.stateFilePath)).resolves.toMatchObject({
      progress: {
        lastCycleDurationMs: 30_000,
        lastCycleOutcome: "TIMEOUT",
        lastCycleErrorKind: "SmokeCycleTimeoutError",
      },
    });
  });

  it("also rejects run-once mode after a timeout", async () => {
    const fixture = await createDaemonFixture({ webhook: false });
    await expect(
      runProductionSmokeDaemon({
        ...fixture.runOptions,
        runSmoke: async () => new Promise<never>(() => {}),
        runWithTimeout: async () => {
          throw new SmokeCycleTimeoutError(30_000);
        },
        now: sequenceNow("2026-06-06T12:00:00.000Z", "2026-06-06T12:00:30.000Z"),
      }),
    ).rejects.toBeInstanceOf(SmokeCycleTimeoutError);
  });

  it("recovers safely from corrupted state and overwrites it with valid v2", async () => {
    const fixture = await createDaemonFixture({ webhook: false });
    await mkdir(dirname(fixture.stateFilePath), { recursive: true });
    await writeFile(fixture.stateFilePath, "{secret state contents", "utf8");
    const logs: string[] = [];
    await runProductionSmokeDaemon({
      ...fixture.runOptions,
      runSmoke: async () => smokeSummary("OK"),
      now: sequenceNow("2026-06-06T12:00:00.000Z", "2026-06-06T12:00:00.600Z"),
      logMessage: (message) => logs.push(message),
      logWarning: (message) => logs.push(message),
    });
    expect(logs).toContain(
      "Production smoke state is invalid; using an empty state without deleting the file.",
    );
    expect(logs.join("\n")).not.toContain("secret state contents");
    await expect(readSmokeDiscordNotificationState(fixture.stateFilePath)).resolves.toMatchObject({
      version: 2,
      progress: { lastCycleOutcome: "OK" },
    });
  });
});

function smokeSummary(status: "OK" | "WARN" | "FAIL") {
  return {
    checkedAt: new Date("2026-06-06T12:00:00.000Z"),
    status,
    checks:
      status === "OK"
        ? [{ name: "homepage", status: "OK" as const, message: "HTTP 200" }]
        : [
            { name: "homepage", status: "OK" as const, message: "HTTP 200" },
            { name: "source freshness", status, message: `source freshness ${status}` },
          ],
  };
}

async function createDaemonFixture({
  webhook,
  runOnce = true,
}: {
  webhook: boolean;
  runOnce?: boolean;
}) {
  const { crawlerCwd, workspaceRoot } = await createWorkspace();
  const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-state.json");
  const options = parseProductionSmokeDaemonOptions(
    [
      ...(runOnce ? ["--run-once"] : []),
      "--initial-delay-seconds",
      "0",
      "--smoke-discord-state-file",
      stateFilePath,
    ],
    webhook ? { DISCORD_ADMIN_WEBHOOK_URL } : {},
    crawlerCwd,
  );
  return {
    stateFilePath,
    runOptions: {
      client: {} as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage: vi.fn(),
    },
  };
}

async function runOneWarn(
  fixture: Awaited<ReturnType<typeof createDaemonFixture>>,
  sender: Parameters<typeof runProductionSmokeDaemon>[0]["sendDiscordWebhook"],
  startedAt: string,
) {
  const start = new Date(startedAt);
  return runProductionSmokeDaemon({
    ...fixture.runOptions,
    runSmoke: async () => smokeSummary("WARN"),
    now: sequenceNow(start.toISOString(), new Date(start.getTime() + 700).toISOString()),
    sendDiscordWebhook: sender,
  });
}

function sequenceNow(...values: string[]) {
  const dates = values.map((value) => new Date(value));
  return () => dates.shift() ?? dates.at(-1) ?? new Date(0);
}
