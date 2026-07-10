// apps/crawler/tests/scripts/ops/backfill-product-vendors.test.ts
// 驗證 vendor backfill 預設不寫 DB，只有 --confirm-write 會更新已變更候選。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backfillProductVendors,
  parseOptions,
  type ProductCandidate,
} from "../../../src/scripts/ops/backfill-product-vendors";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("product vendor backfill safety", () => {
  it("defaults to dry-run and performs no updates", async () => {
    const crawlerCwd = await createWorkspace();
    const options = parseOptions([], crawlerCwd);
    const client = new FakeVendorBackfillClient();
    vi.spyOn(console, "log").mockImplementation(() => {});

    const summary = await backfillProductVendors(
      client as never,
      [createChangedCandidate()],
      options,
    );

    expect(options.dryRun).toBe(true);
    expect(summary).toMatchObject({ selected: 1, changed: 1, matched: 1 });
    expect(client.updateCalls).toEqual([]);
  });

  it("writes only after explicit confirmation", async () => {
    const crawlerCwd = await createWorkspace();
    const options = parseOptions(["--confirm-write"], crawlerCwd);
    const client = new FakeVendorBackfillClient();

    await backfillProductVendors(client as never, [createChangedCandidate()], options);

    expect(options.dryRun).toBe(false);
    expect(client.updateCalls).toEqual([
      {
        where: { id: "product-1" },
        data: { vendorSlug: "amd", vendorName: "AMD" },
        select: { id: true },
      },
    ]);
  });

  it("rejects contradictory dry-run and write confirmation flags", async () => {
    const crawlerCwd = await createWorkspace();

    expect(() => parseOptions(["--dry-run", "--confirm-write"], crawlerCwd)).toThrow(
      "Do not combine --dry-run with --confirm-write",
    );
  });
});

class FakeVendorBackfillClient {
  readonly updateCalls: unknown[] = [];
  readonly product = {
    update: async (args: unknown) => {
      this.updateCalls.push(args);
      return { id: "product-1" };
    },
  };
}

function createChangedCandidate(): ProductCandidate {
  return {
    id: "product-1",
    name: "AMD Ryzen 7 9700X",
    vendorSlug: null,
    vendorName: null,
    sourceCategory: {
      igrp: 4,
      displayName: "CPU",
    },
  };
}

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-vendor-backfill-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });
  return crawlerCwd;
}
