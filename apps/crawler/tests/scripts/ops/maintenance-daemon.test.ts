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
import { tryAcquireExternalFetchLock } from "../../../src/scripts/ops/external-fetch-lock";

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
      taskCooldownSeconds: 600,
      lockDir: join(workspaceRoot, "temp", "external-fetch.lock"),
      lockStaleSeconds: 43200,
      link: {
        limit: 200,
        staleAfterHours: 48,
        minDelayMs: 10000,
        maxDelayMs: 20000,
        kinds: [PRODUCT_LINK_KINDS.SOURCE, PRODUCT_LINK_KINDS.INTRODUCTION],
      },
      image: {
        limit: 150,
        minDelayMs: 8000,
        maxDelayMs: 16000,
        overwrite: false,
      },
    });
  });

  it("reads Docker paths and cycle settings from env", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseMaintenanceDaemonOptions(
      ["--confirm-live-fetch", "--run-once"],
      {
        EXTERNAL_FETCH_LOCK_DIR: "/var/lib/partsradar/snapshots/.locks/external-fetch",
        PRODUCT_IMAGE_STORAGE_DIR: "/var/lib/partsradar/product-images",
        MAINTENANCE_INTERVAL_SECONDS: "172800",
        MAINTENANCE_INITIAL_DELAY_SECONDS: "1200",
        MAINTENANCE_TASK_COOLDOWN_SECONDS: "300",
        MAINTENANCE_LINK_LIMIT: "75",
        MAINTENANCE_IMAGE_LIMIT: "25",
      },
      crawlerCwd,
    );

    expect(options).toMatchObject({
      runOnce: true,
      intervalSeconds: 172800,
      initialDelaySeconds: 1200,
      taskCooldownSeconds: 300,
      lockDir: "/var/lib/partsradar/snapshots/.locks/external-fetch",
      link: { limit: 75 },
      image: {
        limit: 25,
        storageDir: "/var/lib/partsradar/product-images",
      },
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
        readMissingImages: async () => {
          calls.push("read-images");
          return [];
        },
        logMessage: () => {},
      },
    });

    expect(summary).toEqual({
      skippedForLock: true,
      link: null,
      image: null,
    });
    expect(calls).toEqual([]);
  });

  it("runs link checks before missing image backfill and releases the lock", async () => {
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
      options: createMaintenanceOptions({ taskCooldownSeconds: 0 }),
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
        readMissingImages: async () => {
          calls.push("read-images");
          return [];
        },
        backfillMissingImages: async () => {
          calls.push("backfill-images");
          return emptyImageSummary();
        },
        logMessage: () => {},
      },
    });

    expect(calls).toEqual([
      "acquire-lock",
      "read-links",
      "check-links",
      "read-images",
      "backfill-images",
      "release-lock",
    ]);
    expect(summary.skippedForLock).toBe(false);
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
    taskCooldownSeconds: 600,
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
      kinds: [PRODUCT_LINK_KINDS.SOURCE, PRODUCT_LINK_KINDS.INTRODUCTION],
    },
    image: {
      workspaceRoot: "/workspace",
      storageDir: "/workspace/storage/product-images",
      limit: 150,
      productId: null,
      igrp: null,
      minDelayMs: 8000,
      maxDelayMs: 16000,
      timeoutMs: 15000,
      maxSourceBytes: 5 * 1024 * 1024,
      dryRun: false,
      overwrite: false,
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
  };
}

function emptyImageSummary() {
  return {
    selected: 0,
    cached: 0,
    dryRun: 0,
    skipped: 0,
    reused: 0,
    invalid: 0,
    failed: 0,
    liveFetches: 0,
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
