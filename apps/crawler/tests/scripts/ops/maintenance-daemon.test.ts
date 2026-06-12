// apps/crawler/tests/scripts/ops/maintenance-daemon.test.ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type MaintenanceDaemonOptions,
  parseMaintenanceDaemonOptions,
  runMaintenanceCycle,
  runMaintenanceDaemon,
} from "../../../src/scripts/ops/maintenance-daemon";
import { PRODUCT_LINK_KINDS } from "../../../src/scripts/ops/product-link-checker/processor";
import {
  clearExternalFetchPriority,
  hasActiveExternalFetchPriority,
  requestExternalFetchPriority,
  tryAcquireExternalFetchLock,
} from "../../../src/scripts/ops/external-fetch-lock";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("maintenance daemon options", () => {
  it("requires explicit live fetch confirmation unless dry-run is used", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() => parseMaintenanceDaemonOptions([], {}, crawlerCwd)).toThrow(
      "Refusing scheduled maintenance live fetch",
    );
    expect(parseMaintenanceDaemonOptions(["--dry-run"], {}, crawlerCwd).dryRun).toBe(true);
  });

  it("uses conservative scheduled maintenance defaults", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();
    const options = parseMaintenanceDaemonOptions(["--confirm-live-fetch"], {}, crawlerCwd);

    expect(options).toMatchObject({
      workspaceRoot,
      dryRun: false,
      runOnce: false,
      intervalSeconds: 86400,
      initialDelaySeconds: 900,
      pricePriorityPauseSeconds: 300,
      prioritySignalTtlSeconds: 600,
      lockDir: join(workspaceRoot, "temp", "external-fetch.lock"),
      lockStaleSeconds: 43200,
      link: {
        limit: 200,
        staleAfterHours: 48,
        minDelayMs: 10000,
        maxDelayMs: 20000,
        kinds: [PRODUCT_LINK_KINDS.SOURCE],
      },
    });
  });

  it("reads Docker paths and cycle settings from env", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseMaintenanceDaemonOptions(
      ["--confirm-live-fetch", "--run-once"],
      {
        EXTERNAL_FETCH_LOCK_DIR: "/var/lib/partsradar/snapshots/.locks/external-fetch",
        MAINTENANCE_INTERVAL_SECONDS: "172800",
        MAINTENANCE_INITIAL_DELAY_SECONDS: "1200",
        MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS: "180",
        EXTERNAL_FETCH_PRIORITY_TTL_SECONDS: "240",
        MAINTENANCE_LINK_LIMIT: "75",
      },
      crawlerCwd,
    );

    expect(options).toMatchObject({
      runOnce: true,
      intervalSeconds: 172800,
      initialDelaySeconds: 1200,
      pricePriorityPauseSeconds: 180,
      prioritySignalTtlSeconds: 240,
      lockDir: "/var/lib/partsradar/snapshots/.locks/external-fetch",
      link: { limit: 75 },
    });
  });

  it("rejects too frequent maintenance intervals", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseMaintenanceDaemonOptions(
        ["--confirm-live-fetch", "--interval-seconds", "3599"],
        {},
        crawlerCwd,
      ),
    ).toThrow("--interval-seconds/MAINTENANCE_INTERVAL_SECONDS must be an integer between 3600 and 604800.");
  });
});

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

describe("external fetch lock", () => {
  it("allows only one holder and can be released", async () => {
    const lockDir = join(await createTempRoot(), "external-fetch.lock");
    const firstLock = await tryAcquireExternalFetchLock({ lockDir, owner: "first" });

    expect(firstLock).not.toBeNull();
    await expect(tryAcquireExternalFetchLock({ lockDir, owner: "second" })).resolves.toBeNull();

    await firstLock?.release();
    const secondLock = await tryAcquireExternalFetchLock({ lockDir, owner: "second" });

    expect(secondLock).not.toBeNull();
    await secondLock?.release();
  });

  it("tracks short-lived crawler priority signals", async () => {
    const lockDir = join(await createTempRoot(), "external-fetch.lock");

    await requestExternalFetchPriority({
      lockDir,
      owner: "crawler-daemon",
      now: () => new Date("2026-06-12T10:00:00.000Z"),
    });

    await expect(
      hasActiveExternalFetchPriority({
        lockDir,
        owner: "crawler-daemon",
        ttlSeconds: 600,
        now: () => new Date("2026-06-12T10:05:00.000Z"),
      }),
    ).resolves.toBe(true);

    await expect(
      hasActiveExternalFetchPriority({
        lockDir,
        owner: "crawler-daemon",
        ttlSeconds: 600,
        now: () => new Date("2026-06-12T10:11:00.000Z"),
      }),
    ).resolves.toBe(false);

    await requestExternalFetchPriority({ lockDir, owner: "crawler-daemon" });
    await clearExternalFetchPriority({ lockDir, owner: "crawler-daemon" });
    await expect(hasActiveExternalFetchPriority({ lockDir, owner: "crawler-daemon" })).resolves.toBe(
      false,
    );
  });
});

function createMaintenanceOptions(
  overrides: Partial<MaintenanceDaemonOptions> = {},
): MaintenanceDaemonOptions {
  return {
    workspaceRoot: "/workspace",
    dryRun: false,
    runOnce: true,
    intervalSeconds: 86400,
    initialDelaySeconds: 0,
    pricePriorityPauseSeconds: 300,
    prioritySignalTtlSeconds: 600,
    lockDir: "/workspace/temp/external-fetch.lock",
    lockStaleSeconds: 43200,
    link: {
      workspaceRoot: "/workspace",
      dryRun: false,
      limit: 200,
      igrp: null,
      staleAfterHours: 48,
      minDelayMs: 10000,
      maxDelayMs: 20000,
      timeoutMs: 10000,
      failureThreshold: 3,
      kinds: [PRODUCT_LINK_KINDS.SOURCE],
    },
    ...overrides,
  };
}

function emptyLinkSummary() {
  return {
    selected: 0,
    checked: 0,
    dryRun: 0,
    ok: 0,
    broken: 0,
    temporaryError: 0,
    liveRequests: 0,
    pausedForPriority: false,
  };
}

function createFakeShutdown(): {
  readonly requested: boolean;
  sleepCalls: number[];
  sleep(ms: number): Promise<void>;
} {
  let requested = false;
  const sleepCalls: number[] = [];

  return {
    get requested() {
      return requested;
    },
    sleepCalls,
    async sleep(ms: number) {
      sleepCalls.push(ms);
      requested = true;
    },
  };
}

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await createTempRoot();
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });

  return { workspaceRoot, crawlerCwd };
}

async function createTempRoot(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-maintenance-daemon-"));
  tempRoots.push(workspaceRoot);

  return workspaceRoot;
}
