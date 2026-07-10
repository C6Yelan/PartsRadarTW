// apps/crawler/tests/scripts/ops/external-fetch-lock.test.ts
// 驗證外部來源抓取鎖的互斥取得與釋放流程。

import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tryAcquireExternalFetchLock } from "../../../src/scripts/ops/external-fetch-lock";
import { createCrawlerDaemonTestEnvironment } from "./crawl-coolpc-daemon-support";

const testEnv = createCrawlerDaemonTestEnvironment();

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
});
