// apps/crawler/tests/coolpc/raw-snapshot-writer-lock.test.ts
// 驗證 scheduled 與 manual live crawl 都在共享 mutation lock 內執行並可靠 release。

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
      expectedOwner: "scheduled-crawler",
    },
    {
      name: "manual live crawler",
      triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
      expectedOwner: "manual-crawler",
    },
  ])("holds and releases the shared lock for $name", async (testCase) => {
    const { workspaceRoot, storageRoot } = await createWorkspace();
    const calls: string[] = [];
    const client = {} as never;
    const log = vi.fn();
    const acquireMutationLock = vi.fn(async () => {
      calls.push("acquire");
      return {
        lockDir: join(storageRoot, ".locks", "raw-snapshot-mutation"),
        owner: testCase.expectedOwner,
        async release() {
          calls.push("release");
        },
      };
    });
    const reconcileRuns = vi.fn(async () => {
      calls.push("reconcile");
      return 2;
    });
    const runCrawl = vi.fn(async () => {
      calls.push("run");
      return {} as never;
    });

    await runCoolpcCategoryCrawl(
      {
        client,
        workspaceRoot,
        storageDir: join(storageRoot, "controlled-child"),
        configuredStorageDir: null,
        additionalAllowedStorageRootsForTesting: [storageRoot],
        triggerType: testCase.triggerType,
        fetchUserAgent: "test-agent",
        log,
      },
      {
        acquireMutationLock: acquireMutationLock as never,
        reconcileRuns: reconcileRuns as never,
        runCrawl: runCrawl as never,
      },
    );

    expect(acquireMutationLock).toHaveBeenCalledWith({
      mutationRoot: storageRoot,
      owner: testCase.expectedOwner,
    });
    expect(reconcileRuns).toHaveBeenCalledWith({ client });
    expect(calls).toEqual(["acquire", "reconcile", "run", "release"]);
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("Reconciled interrupted CoolPC crawl runs. count=2");
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
          reconcileRuns: (async () => 0) as never,
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
    const reconcileRuns = vi.fn(async () => 0);
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
          reconcileRuns: reconcileRuns as never,
          runCrawl: runCrawl as never,
        },
      ),
    ).rejects.toThrow("another crawler or cleanup process holds the mutation lock");
    expect(reconcileRuns).not.toHaveBeenCalled();
    expect(runCrawl).not.toHaveBeenCalled();
  });

  it("does not log when reconciliation updates no crawl runs", async () => {
    const { workspaceRoot, storageRoot } = await createWorkspace();
    const log = vi.fn();

    await runCoolpcCategoryCrawl(
      {
        client: {} as never,
        workspaceRoot,
        storageDir: storageRoot,
        configuredStorageDir: null,
        additionalAllowedStorageRootsForTesting: [storageRoot],
        fetchUserAgent: "test-agent",
        log,
      },
      {
        acquireMutationLock: (async () => ({
          lockDir: join(storageRoot, ".locks", "raw-snapshot-mutation"),
          owner: "manual-crawler",
          release: async () => {},
        })) as never,
        reconcileRuns: (async () => 0) as never,
        runCrawl: (async () => ({}) as never) as never,
      },
    );

    expect(log).not.toHaveBeenCalled();
  });

  it("releases the lock and does not crawl when reconciliation fails", async () => {
    const { workspaceRoot, storageRoot } = await createWorkspace();
    const reconciliationError = new Error("crawl-run reconciliation failed");
    const release = vi.fn(async () => {});
    const runCrawl = vi.fn(async () => ({}) as never);

    const result = runCoolpcCategoryCrawl(
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
        reconcileRuns: (async () => {
          throw reconciliationError;
        }) as never,
        runCrawl: runCrawl as never,
      },
    );

    await expect(result).rejects.toBe(reconciliationError);
    expect(runCrawl).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});

async function createWorkspace(): Promise<{ workspaceRoot: string; storageRoot: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-writer-lock-"));
  const storageRoot = join(workspaceRoot, "allowed-snapshots");
  tempRoots.push(workspaceRoot);
  await mkdir(storageRoot);
  return { workspaceRoot, storageRoot };
}
