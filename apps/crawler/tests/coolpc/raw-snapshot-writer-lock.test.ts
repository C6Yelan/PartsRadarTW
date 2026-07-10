// apps/crawler/tests/coolpc/raw-snapshot-writer-lock.test.ts
// 驗證 scheduled、manual live 與 raw replay 都在共享 mutation lock 內執行並可靠 release。

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRAWL_TRIGGER_TYPES } from "../../src/coolpc/crawl-run";
import { runCoolpcCategoryCrawl } from "../../src/coolpc/live-crawl";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("raw snapshot writer mutation lock", () => {
  it.each([
    {
      name: "scheduled crawler",
      triggerType: CRAWL_TRIGGER_TYPES.SCHEDULED,
      fromRawDir: null,
      expectedOwner: "scheduled-crawler",
    },
    {
      name: "manual live crawler",
      triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
      fromRawDir: null,
      expectedOwner: "manual-crawler",
    },
    {
      name: "manual raw replay",
      triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
      fromRawDir: "/tmp/offline-raw-replay",
      expectedOwner: "manual-raw-replay",
    },
  ])("holds and releases the shared lock for $name", async (testCase) => {
    const { workspaceRoot, storageRoot } = await createWorkspace();
    const calls: string[] = [];
    const acquireMutationLock = vi.fn(async () => ({
      lockDir: join(storageRoot, ".locks", "raw-snapshot-mutation"),
      owner: testCase.expectedOwner,
      async release() {
        calls.push("release");
      },
    }));
    const runCrawl = vi.fn(async () => {
      calls.push("run");
      return {} as never;
    });

    await runCoolpcCategoryCrawl(
      {
        client: {} as never,
        workspaceRoot,
        storageDir: join(storageRoot, "controlled-child"),
        configuredStorageDir: null,
        additionalAllowedStorageRootsForTesting: [storageRoot],
        triggerType: testCase.triggerType,
        fromRawDir: testCase.fromRawDir,
        fetchUserAgent: "test-agent",
      },
      {
        acquireMutationLock: acquireMutationLock as never,
        runCrawl: runCrawl as never,
      },
    );

    expect(acquireMutationLock).toHaveBeenCalledWith({
      mutationRoot: storageRoot,
      owner: testCase.expectedOwner,
    });
    expect(calls).toEqual(["run", "release"]);
  });

  it("releases the lock when the crawl fails", async () => {
    const { workspaceRoot, storageRoot } = await createWorkspace();
    const release = vi.fn(async () => {});

    await expect(
      runCoolpcCategoryCrawl(
        {
          client: {} as never,
          workspaceRoot,
          storageDir: storageRoot,
          configuredStorageDir: null,
          additionalAllowedStorageRootsForTesting: [storageRoot],
          fetchUserAgent: "test-agent",
        },
        {
          acquireMutationLock: (async () => ({
            lockDir: join(storageRoot, ".locks", "raw-snapshot-mutation"),
            owner: "manual-crawler",
            release,
          })) as never,
          runCrawl: (async () => {
            throw new Error("crawl failed");
          }) as never,
        },
      ),
    ).rejects.toThrow("crawl failed");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not start a crawl when the shared lock is busy", async () => {
    const { workspaceRoot, storageRoot } = await createWorkspace();
    const runCrawl = vi.fn(async () => ({}) as never);

    await expect(
      runCoolpcCategoryCrawl(
        {
          client: {} as never,
          workspaceRoot,
          storageDir: storageRoot,
          configuredStorageDir: null,
          additionalAllowedStorageRootsForTesting: [storageRoot],
          fetchUserAgent: "test-agent",
        },
        {
          acquireMutationLock: (async () => null) as never,
          runCrawl: runCrawl as never,
        },
      ),
    ).rejects.toThrow("another crawler or cleanup process holds the mutation lock");
    expect(runCrawl).not.toHaveBeenCalled();
  });
});

async function createWorkspace(): Promise<{ workspaceRoot: string; storageRoot: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-writer-lock-"));
  const storageRoot = join(workspaceRoot, "allowed-snapshots");
  tempRoots.push(workspaceRoot);
  await mkdir(storageRoot);
  return { workspaceRoot, storageRoot };
}
