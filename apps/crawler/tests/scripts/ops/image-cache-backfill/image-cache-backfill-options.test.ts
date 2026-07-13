// apps/crawler/tests/scripts/ops/image-cache-backfill/image-cache-backfill-options.test.ts
// 驗證 image-cache backfill 裸命令安全預設與唯一 live confirmation flag。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseOptions } from "../../../../src/scripts/ops/image-cache-backfill/options";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("image cache backfill options", () => {
  it("defaults bare and compatibility alias invocations to dry-run", async () => {
    const crawlerCwd = await createWorkspace();

    expect(parseOptions([], crawlerCwd, {})).toMatchObject({
      dryRun: true,
      inactiveRetentionDays: 30,
    });
    expect(parseOptions(["--dry-run"], crawlerCwd, {}).dryRun).toBe(true);
  });

  it("accepts CLI and environment overrides for inactive retention", async () => {
    const crawlerCwd = await createWorkspace();

    expect(
      parseOptions(["--inactive-retention-days", "45"], crawlerCwd, {
        IMAGE_CACHE_INACTIVE_RETENTION_DAYS: "60",
      }).inactiveRetentionDays,
    ).toBe(45);
    expect(
      parseOptions([], crawlerCwd, { IMAGE_CACHE_INACTIVE_RETENTION_DAYS: "60" })
        .inactiveRetentionDays,
    ).toBe(60);
    expect(() =>
      parseOptions([], crawlerCwd, { IMAGE_CACHE_INACTIVE_RETENTION_DAYS: "invalid" }),
    ).toThrow("IMAGE_CACHE_INACTIVE_RETENTION_DAYS must be a non-negative integer");
  });

  it("enables live requests only with explicit confirmation", async () => {
    const crawlerCwd = await createWorkspace();

    expect(parseOptions(["--confirm-live-fetch"], crawlerCwd, {})).toMatchObject({
      dryRun: false,
      externalFetchLockDir: join(
        crawlerCwd,
        "..",
        "..",
        "temp",
        "coolpc-daemon",
        "snapshots",
        ".locks",
        "external-fetch",
      ),
      externalFetchLockStaleSeconds: 300,
    });
  });

  it("rejects contradictory dry-run and live confirmation flags", async () => {
    const crawlerCwd = await createWorkspace();

    expect(() => parseOptions(["--dry-run", "--confirm-live-fetch"], crawlerCwd, {})).toThrow(
      "Do not combine --dry-run with --confirm-live-fetch",
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-image-options-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });
  return crawlerCwd;
}
