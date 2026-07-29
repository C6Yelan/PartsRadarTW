// apps/crawler/tests/scripts/ops/external-fetch-lock.test.ts
// 驗證外部來源抓取鎖的互斥取得與釋放流程。

import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tryAcquireExternalFetchLock } from "../../../src/scripts/ops/external-fetch-lock";
import { createDaemonTestEnvironment } from "./crawl-coolpc-daemon/crawl-coolpc-daemon-support";

const testEnv = createDaemonTestEnvironment();

async function pollUntil<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 1_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error(`Condition was not met within ${timeoutMs}ms.`);
}

async function readLockMetadata(lockDir: string): Promise<{
  acquiredAt: string;
  heartbeatAt: string;
  owner: string;
  token: string;
}> {
  return JSON.parse(await readFile(join(lockDir, "lock.json"), "utf8")) as {
    acquiredAt: string;
    heartbeatAt: string;
    owner: string;
    token: string;
  };
}

afterEach(async () => {
  vi.useRealTimers();
  await testEnv.cleanup();
});

describe("external fetch lock", () => {
  it("allows only one holder and can be released", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    const firstLock = await tryAcquireExternalFetchLock({ lockDir, owner: "first" });

    try {
      expect(firstLock).not.toBeNull();
      await expect(tryAcquireExternalFetchLock({ lockDir, owner: "second" })).resolves.toBeNull();
    } finally {
      await firstLock?.release();
    }
    const secondLock = await tryAcquireExternalFetchLock({ lockDir, owner: "second" });

    try {
      expect(secondLock).not.toBeNull();
    } finally {
      await secondLock?.release();
    }
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
    try {
      const metadata = await pollUntil(
        () => readLockMetadata(lockDir),
        (value) => value.heartbeatAt === "2026-07-13T02:00:00.020Z",
      );

      expect(metadata.heartbeatAt).toBe("2026-07-13T02:00:00.020Z");
    } finally {
      await lock?.release();
    }
  });

  it("keeps metadata complete for concurrent readers across heartbeat replacements", async () => {
    const { workspaceRoot } = await testEnv.createWorkspace();
    const lockDir = join(workspaceRoot, "external-fetch.lock");
    const owner = `active-holder-${"x".repeat(64 * 1024)}`;
    const startedAt = Date.now();
    let clockTick = 0;
    const lock = await tryAcquireExternalFetchLock({
      lockDir,
      owner,
      staleSeconds: 0.03,
      now: () => new Date(startedAt + clockTick++ * 10),
    });

    expect(lock).not.toBeNull();
    const observedHeartbeats = new Set<string>();
    const deadline = Date.now() + 2_000;

    try {
      await Promise.all(
        Array.from({ length: 16 }, async () => {
          while (observedHeartbeats.size < 6 && Date.now() < deadline) {
            const metadata = await readLockMetadata(lockDir);
            expect(metadata.owner).toBe(owner);
            expect(metadata.token).toBeTypeOf("string");
            expect(metadata.acquiredAt).toBeTypeOf("string");
            expect(metadata.heartbeatAt).toBeTypeOf("string");
            observedHeartbeats.add(metadata.heartbeatAt);
          }
        }),
      );

      expect(observedHeartbeats.size).toBeGreaterThanOrEqual(6);
      expect(await readdir(lockDir)).toEqual(["lock.json"]);
    } finally {
      await lock?.release();
    }
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

    try {
      expect(replacement).not.toBeNull();
    } finally {
      await replacement?.release();
    }
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

    try {
      expect(acquiredLocks).toHaveLength(1);
      await expect(lstat(guardDir)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await Promise.all(acquiredLocks.map((lock) => lock.release()));
    }
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

    try {
      expect(settledBeforeUnblock).toBe(0);
      expect(acquiredLocks).toHaveLength(1);
    } finally {
      await Promise.all(acquiredLocks.map((lock) => lock.release()));
    }
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

    try {
      expect(lock).not.toBeNull();
    } finally {
      await lock?.release();
    }
  });
});
