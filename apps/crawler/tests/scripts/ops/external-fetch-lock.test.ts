// apps/crawler/tests/scripts/ops/external-fetch-lock.test.ts
// 驗證外部來源抓取鎖的互斥取得、釋放流程與短效 priority signal TTL 行為。

import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearExternalFetchPriority,
  hasActiveExternalFetchPriority,
  requestExternalFetchPriority,
  tryAcquireExternalFetchLock,
} from "../../../src/scripts/ops/external-fetch-lock";
import {
  cleanupMaintenanceTempRoots,
  createTempRoot,
} from "./maintenance-daemon-support";

afterEach(cleanupMaintenanceTempRoots);

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
