// apps/crawler/tests/scripts/ops/maintenance-daemon-cycle.test.ts
// 驗證 maintenance daemon 單輪 link health 檢查、external fetch lock、crawler priority 暫停與失敗續跑。

import { describe, expect, it } from "vitest";
import { runMaintenanceCycle, runMaintenanceDaemon } from "../../../src/scripts/ops/maintenance-daemon";
import { PRODUCT_LINK_KINDS } from "../../../src/scripts/ops/product-link-checker/processor";
import {
  createFakeShutdown,
  createMaintenanceOptions,
  emptyLinkSummary,
} from "./maintenance-daemon-support";

describe("maintenance daemon cycle", () => {
  it("skips the cycle when the shared external fetch lock is held", async () => {
    const calls: string[] = [];
    const summary = await runMaintenanceCycle({
      client: {} as never,
      options: createMaintenanceOptions(),
      dependencies: {
        acquireLock: async () => null,
        readLinks: async () => {
          calls.push("read-links");
          return [];
        },
        logMessage: () => {},
      },
    });

    expect(summary).toEqual({
      skippedForLock: true,
      pausedForPriority: false,
      link: null,
    });
    expect(calls).toEqual([]);
  });

  it("runs link checks and releases the lock", async () => {
    const calls: string[] = [];
    const fakeLock = {
      lockDir: "/tmp/external-fetch.lock",
      owner: "maintenance-daemon",
      async release() {
        calls.push("release-lock");
      },
    };
    const summary = await runMaintenanceCycle({
      client: {} as never,
      options: createMaintenanceOptions(),
      dependencies: {
        acquireLock: async () => {
          calls.push("acquire-lock");
          return fakeLock;
        },
        readLinks: async () => {
          calls.push("read-links");
          return [];
        },
        checkLinks: async () => {
          calls.push("check-links");
          return emptyLinkSummary();
        },
        logMessage: () => {},
      },
    });

    expect(calls).toEqual(["acquire-lock", "read-links", "check-links", "release-lock"]);
    expect(summary.skippedForLock).toBe(false);
    expect(summary.pausedForPriority).toBe(false);
  });

  it("pauses link checks for crawler priority and releases the lock", async () => {
    const calls: string[] = [];
    const fakeLock = {
      lockDir: "/tmp/external-fetch.lock",
      owner: "maintenance-daemon",
      async release() {
        calls.push("release-lock");
      },
    };
    const summary = await runMaintenanceCycle({
      client: {} as never,
      options: createMaintenanceOptions(),
      dependencies: {
        acquireLock: async () => fakeLock,
        hasPriority: async ({ owner }) => {
          calls.push(`has-priority:${owner}`);
          return true;
        },
        readLinks: async () => [
          {
            productId: "product-1",
            productName: "GPU RTX 4070",
            categoryLabel: "顯示卡 IGrp=12",
            linkKind: PRODUCT_LINK_KINDS.SOURCE,
            url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
            existingHealth: null,
          },
        ],
        logMessage: () => {},
      },
    });

    expect(calls).toEqual(["has-priority:crawler-daemon", "release-lock"]);
    expect(summary).toMatchObject({
      skippedForLock: false,
      pausedForPriority: true,
      link: {
        selected: 1,
        checked: 0,
        pausedForPriority: true,
      },
    });
  });

  it("keeps the daemon loop alive after a cycle failure", async () => {
    const logs: string[] = [];
    const shutdown = createFakeShutdown();

    await runMaintenanceDaemon({
      client: {} as never,
      options: createMaintenanceOptions({
        runOnce: false,
        initialDelaySeconds: 0,
        intervalSeconds: 3600,
      }),
      shutdown,
      dependencies: {
        acquireLock: async () => {
          throw new Error("temporary maintenance failure");
        },
        logMessage: (message) => logs.push(message),
      },
    });

    expect(logs).toContain("Maintenance cycle failed: temporary maintenance failure");
    expect(shutdown.sleepCalls).toEqual([3600 * 1000]);
  });

  it("reschedules soon after pausing for crawler priority", async () => {
    const shutdown = createFakeShutdown();

    await runMaintenanceDaemon({
      client: {} as never,
      options: createMaintenanceOptions({
        runOnce: false,
        initialDelaySeconds: 0,
        intervalSeconds: 86400,
        pricePriorityPauseSeconds: 300,
      }),
      shutdown,
      dependencies: {
        acquireLock: async () => ({
          lockDir: "/tmp/external-fetch.lock",
          owner: "maintenance-daemon",
          release: async () => {},
        }),
        hasPriority: async () => true,
        readLinks: async () => [
          {
            productId: "product-1",
            productName: "GPU RTX 4070",
            categoryLabel: "顯示卡 IGrp=12",
            linkKind: PRODUCT_LINK_KINDS.SOURCE,
            url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
            existingHealth: null,
          },
        ],
        logMessage: () => {},
      },
    });

    expect(shutdown.sleepCalls).toEqual([300 * 1000]);
  });
});
