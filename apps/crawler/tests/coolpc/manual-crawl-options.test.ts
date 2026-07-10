// apps/crawler/tests/coolpc/manual-crawl-options.test.ts
// 驗證 manual live crawl 的確認旗標、raw snapshot storage allowlist 與安全 default。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseOptions } from "../../src/scripts/manual/crawl-coolpc-once/options";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("manual CoolPC crawl snapshot storage options", () => {
  it("requires explicit live fetch confirmation", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() => parseOptions([], crawlerCwd, {})).toThrow("Refusing live CoolPC fetch");
  });

  it("rejects the former raw replay flag instead of falling through to live fetch", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseOptions(["--from-raw-dir", "temp/replay", "--confirm-live-fetch"], crawlerCwd, {}),
    ).toThrow("Use manual:validate-coolpc-live");
  });

  it("uses the shared built-in snapshot root for live crawl", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();

    expect(parseOptions(["--confirm-live-fetch"], crawlerCwd, {})).toMatchObject({
      workspaceRoot,
      storageDir: join(workspaceRoot, "temp", "coolpc-daemon", "snapshots"),
    });
  });

  it("allows the configured root and rejects unrelated storage paths", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();
    const configuredRoot = join(workspaceRoot, "configured-snapshots");
    await mkdir(configuredRoot);

    expect(
      parseOptions(["--confirm-live-fetch", "--storage-dir", configuredRoot], crawlerCwd, {
        SNAPSHOT_STORAGE_DIR: configuredRoot,
      }).storageDir,
    ).toBe(configuredRoot);
    expect(() =>
      parseOptions(["--confirm-live-fetch", "--storage-dir", "temp/unrelated"], crawlerCwd, {}),
    ).toThrow("not within an allowlisted snapshot storage root");
  });
});

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-manual-crawl-options-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });
  return { workspaceRoot, crawlerCwd };
}
