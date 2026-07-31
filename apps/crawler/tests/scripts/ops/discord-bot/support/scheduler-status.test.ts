// 驗證 Discord bot scheduler status store 的初始狀態、執行摘要與防禦性 snapshot。

import { describe, expect, it, vi } from "vitest";
import { runDiscordBotNotificationCycle } from "../../../../../src/scripts/ops/discord-bot/daemon";
import { createDiscordBotSchedulerStatusStore } from "../../../../../src/scripts/ops/discord-bot/scheduler-status";
import { createDiscordBotClient } from "./client";
import { createDiscordBotOptions } from "./options";

describe("Discord bot scheduler status store", () => {
  it("starts as NOT_RUN and records safe execution metadata", () => {
    const store = createDiscordBotSchedulerStatusStore();
    const initial = store.getSnapshot();

    expect(initial.notificationLoop.lastOutcome).toBe("NOT_RUN");
    expect(initial.targetPrice.processedCount).toBe(0);

    store.recordTargetPrice({
      startedAt: new Date("2026-07-15T04:00:00.000Z"),
      completedAt: new Date("2026-07-15T04:00:05.250Z"),
      outcome: "ERROR",
      nextRunAt: new Date("2026-07-15T04:05:00.000Z"),
      errorKind: "SCAN_ERROR",
      scannedCount: 7,
      dueCount: 3,
      processedCount: 2,
      sentCount: 1,
      rateLimitedCount: 0,
      failedCount: 1,
    });

    expect(store.getSnapshot().targetPrice).toMatchObject({
      lastDurationMs: 5250,
      lastOutcome: "ERROR",
      lastErrorKind: "SCAN_ERROR",
      scannedCount: 7,
      dueCount: 3,
      processedCount: 2,
      sentCount: 1,
      failedCount: 1,
    });
  });

  it("returns cloned dates so readers cannot mutate the stored snapshot", () => {
    const store = createDiscordBotSchedulerStatusStore();
    store.recordNotificationLoop({
      startedAt: new Date("2026-07-15T04:00:00.000Z"),
      completedAt: new Date("2026-07-15T04:00:01.000Z"),
      outcome: "OK",
      nextRunAt: new Date("2026-07-15T04:05:01.000Z"),
    });
    const first = store.getSnapshot();
    first.notificationLoop.lastStartedAt?.setUTCFullYear(2000);
    first.notificationLoop.nextRunAt?.setUTCFullYear(2000);

    const second = store.getSnapshot();
    expect(second.notificationLoop.lastStartedAt?.getUTCFullYear()).toBe(2026);
    expect(second.notificationLoop.nextRunAt?.getUTCFullYear()).toBe(2026);
  });

  it("records a successful target-price scan from the notification cycle", async () => {
    const store = createDiscordBotSchedulerStatusStore();
    const now = new Date("2026-07-15T04:00:00.000Z");

    await runDiscordBotNotificationCycle({
      client: createDiscordBotClient(),
      options: createDiscordBotOptions({
        targetWatchesEnabled: true,
        personalReportsEnabled: false,
        publicReportsEnabled: false,
      }),
      fetchImpl: vi.fn() as typeof fetch,
      logMessage: vi.fn(),
      scanIntervalMs: 300_000,
      nextTargetPriceScanAtMs: 0,
      now,
      schedulerStatus: store,
    });

    expect(store.getSnapshot()).toMatchObject({
      notificationLoop: { lastOutcome: "OK" },
      targetPrice: {
        lastOutcome: "OK",
        nextRunAt: new Date("2026-07-15T04:05:00.000Z"),
        scannedCount: 0,
        processedCount: 0,
      },
    });
  });

  it("records only a safe error kind when a target-price scan throws", async () => {
    const store = createDiscordBotSchedulerStatusStore();
    const client = createDiscordBotClient();
    client.$transaction.mockRejectedValueOnce(new Error("DATABASE_URL=private raw stack"));

    await runDiscordBotNotificationCycle({
      client,
      options: createDiscordBotOptions({
        targetWatchesEnabled: true,
        personalReportsEnabled: false,
        publicReportsEnabled: false,
      }),
      fetchImpl: vi.fn() as typeof fetch,
      logMessage: vi.fn(),
      scanIntervalMs: 300_000,
      nextTargetPriceScanAtMs: 0,
      now: new Date("2026-07-15T04:00:00.000Z"),
      schedulerStatus: store,
    });

    const snapshotText = JSON.stringify(store.getSnapshot());
    expect(store.getSnapshot().targetPrice).toMatchObject({
      lastOutcome: "ERROR",
      lastErrorKind: "SCAN_ERROR",
    });
    expect(store.getSnapshot().notificationLoop.lastOutcome).toBe("ERROR");
    expect(snapshotText).not.toContain("DATABASE_URL");
    expect(snapshotText).not.toContain("raw stack");
  });
});
