// apps/crawler/tests/scripts/ops/external-fetch-lock.test.ts
// 驗證外部來源抓取鎖的互斥取得與釋放流程。

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tryAcquireExternalFetchLock } from "../../../src/scripts/ops/external-fetch-lock";
import { createDaemonTestEnvironment } from "./crawl-coolpc-daemon/crawl-coolpc-daemon-support";

const testEnv = createDaemonTestEnvironment();

afterEach(async () => {
  vi.useRealTimers();
  await testEnv.cleanup();
});

describe("external fetch lock", () => {
  it("allows only one holder and can be released", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    const firstLock = await tryAcquireExternalFetchLock({ lockDir, owner: "first" });

    expect(firstLock).not.toBeNull();
    await expect(tryAcquireExternalFetchLock({ lockDir, owner: "second" })).resolves.toBeNull();

    await firstLock?.release();
    const secondLock = await tryAcquireExternalFetchLock({ lockDir, owner: "second" });

    expect(secondLock).not.toBeNull();
    await secondLock?.release();
  });

  it("uses the latest heartbeat when deciding whether a lock is stale", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    await mkdir(lockDir);
    await writeFile(
      join(lockDir, "lock.json"),
      `${JSON.stringify({
        owner: "active-holder",
        token: "active-token",
        pid: 123,
        acquiredAt: "2026-07-13T00:00:00.000Z",
        heartbeatAt: "2026-07-13T01:59:30.000Z",
      })}\n`,
      "utf8",
    );

    await expect(
      tryAcquireExternalFetchLock({
        lockDir,
        owner: "contender",
        staleSeconds: 60,
        now: () => new Date("2026-07-13T02:00:00.000Z"),
      }),
    ).resolves.toBeNull();
  });

  it("renews the heartbeat while the holder remains active", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    let currentTime = new Date("2026-07-13T02:00:00.000Z");
    const lock = await tryAcquireExternalFetchLock({
      lockDir,
      owner: "active-holder",
      staleSeconds: 0.03,
      now: () => currentTime,
    });

    currentTime = new Date("2026-07-13T02:00:00.020Z");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const metadata = JSON.parse(await readFile(join(lockDir, "lock.json"), "utf8")) as {
      heartbeatAt: string;
    };

    expect(metadata.heartbeatAt).toBe("2026-07-13T02:00:00.020Z");
    await lock?.release();
  });

  it("reclaims a lock after its heartbeat lease expires", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    await mkdir(lockDir);
    await writeFile(
      join(lockDir, "lock.json"),
      `${JSON.stringify({
        owner: "orphaned-holder",
        token: "orphaned-token",
        pid: 123,
        acquiredAt: "2026-07-13T00:00:00.000Z",
        heartbeatAt: "2026-07-13T01:58:00.000Z",
      })}\n`,
      "utf8",
    );

    const replacement = await tryAcquireExternalFetchLock({
      lockDir,
      owner: "replacement",
      staleSeconds: 60,
      now: () => new Date("2026-07-13T02:00:00.000Z"),
    });

    expect(replacement).not.toBeNull();
    await replacement?.release();
  });

  it("recovers an orphaned state guard without allowing multiple holders", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    const guardDir = `${lockDir}.state-guard`;
    const expiredRetiredDir = `${guardDir}.retired-expired-fixture`;
    const oldTimestamp = new Date("2000-01-01T00:00:00.000Z");
    await mkdir(guardDir);
    await utimes(guardDir, oldTimestamp, oldTimestamp);
    await mkdir(expiredRetiredDir);
    await writeFile(
      join(expiredRetiredDir, "retired.json"),
      `${JSON.stringify({ identity: "expired-fixture", retiredAt: oldTimestamp.toISOString() })}\n`,
      "utf8",
    );

    const locks = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        tryAcquireExternalFetchLock({ lockDir, owner: `contender-${index}` }),
      ),
    );
    const acquiredLocks = locks.filter((lock) => lock !== null);

    expect(acquiredLocks).toHaveLength(1);
    await expect(lstat(guardDir)).rejects.toMatchObject({ code: "ENOENT" });
    await acquiredLocks[0]?.release();
  });

  it("fails closed while a matching corrupt retired tombstone is occupied", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    const guardDir = `${lockDir}.state-guard`;
    const guardToken = "occupied-retired-tombstone";
    const acquiredAt = "2000-01-01T00:00:00.000Z";
    const identity = createHash("sha256").update(`token:${guardToken}`).digest("hex");
    const retiredDir = `${guardDir}.retired-${identity}`;
    await mkdir(guardDir);
    await writeFile(
      join(guardDir, "guard.json"),
      `${JSON.stringify({ token: guardToken, pid: 0, acquiredAt })}\n`,
      "utf8",
    );
    await mkdir(retiredDir);
    await writeFile(join(retiredDir, "retired.json"), "{", "utf8");

    let settledCount = 0;
    const acquisitions = Array.from({ length: 8 }, (_, index) =>
      tryAcquireExternalFetchLock({ lockDir, owner: `contender-${index}` }).finally(() => {
        settledCount += 1;
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    const settledBeforeUnblock = settledCount;
    await rename(retiredDir, join(workspaceRoot, "blocked-retired-tombstone-fixture"));
    const locks = await Promise.all(acquisitions);
    const acquiredLocks = locks.filter((lock) => lock !== null);

    expect(settledBeforeUnblock).toBe(0);
    expect(acquiredLocks).toHaveLength(1);
    await acquiredLocks[0]?.release();
  });

  it("waits for a fresh legacy guard instead of reclaiming it", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    const guardDir = `${lockDir}.state-guard`;
    await mkdir(guardDir);

    let settled = false;
    const acquisition = tryAcquireExternalFetchLock({ lockDir, owner: "waiting" }).finally(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(settled).toBe(false);

    await rm(guardDir, { recursive: true });
    const lock = await acquisition;

    expect(lock).not.toBeNull();
    await lock?.release();
  });
});
