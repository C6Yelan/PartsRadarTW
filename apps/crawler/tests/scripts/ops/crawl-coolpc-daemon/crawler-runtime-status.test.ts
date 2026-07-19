// 驗證 crawler runtime status 的原子寫入與嚴格讀取。

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readCrawlerRuntimeStatus,
  writeCrawlerRuntimeStatus,
} from "../../../../src/scripts/ops/crawl-coolpc-daemon/runtime-status";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("crawler runtime status", () => {
  it("round-trips a lock busy status", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-crawler-runtime-"));
    const path = join(root, "ops", "crawler-runtime-status.json");
    tempRoots.push(root);
    const status = {
      version: 1 as const,
      state: "WAITING_LOCK" as const,
      cycleResult: "LOCK_BUSY" as const,
      observedAt: "2026-07-19T02:00:16.000Z",
      nextAttemptAt: "2026-07-19T02:01:01.000Z",
      lockBusySince: "2026-07-19T02:00:16.000Z",
      consecutiveLockBusyCount: 1,
    };

    await writeCrawlerRuntimeStatus(path, status);

    await expect(readCrawlerRuntimeStatus(path)).resolves.toEqual(status);
  });

  it("ignores malformed or missing status files", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-crawler-runtime-"));
    const path = join(root, "crawler-runtime-status.json");
    tempRoots.push(root);
    await writeFile(path, '{"version":1,"state":"WAITING_LOCK"}', "utf8");

    await expect(readCrawlerRuntimeStatus(path)).resolves.toBeNull();
    await expect(readCrawlerRuntimeStatus(join(root, "missing.json"))).resolves.toBeNull();
  });
});
