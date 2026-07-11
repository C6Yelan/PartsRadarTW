// apps/crawler/tests/scripts/ops/external-fetch-lock.test.ts
// 驗證外部來源抓取鎖的互斥取得與釋放流程。

import { lstat, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tryAcquireExternalFetchLock } from "../../../src/scripts/ops/external-fetch-lock";
import { createDaemonTestEnvironment } from "./crawl-coolpc-daemon/crawl-coolpc-daemon-support";

const testEnv = createDaemonTestEnvironment();

afterEach(testEnv.cleanup);

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
