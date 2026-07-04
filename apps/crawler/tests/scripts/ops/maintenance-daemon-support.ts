// apps/crawler/tests/scripts/ops/maintenance-daemon-support.ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MaintenanceDaemonOptions } from "../../../src/scripts/ops/maintenance-daemon";
import { PRODUCT_LINK_KINDS } from "../../../src/scripts/ops/product-link-checker/processor";

const tempRoots: string[] = [];

export async function cleanupMaintenanceTempRoots(): Promise<void> {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
}

export function createMaintenanceOptions(
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

export function emptyLinkSummary() {
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

export function createFakeShutdown(): {
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

export async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await createTempRoot();
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });

  return { workspaceRoot, crawlerCwd };
}

export async function createTempRoot(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-maintenance-daemon-"));
  tempRoots.push(workspaceRoot);

  return workspaceRoot;
}
