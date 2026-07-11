// apps/crawler/tests/scripts/ops/backfill-product-filter-tags.test.ts
// 驗證 filter tag backfill 預設不寫 DB、只更新變更列，且重複執行結果穩定。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backfillProductFilterTags,
  type ProductFilterTagCandidate,
  parseOptions,
} from "../../../src/scripts/ops/backfill-product-filter-tags";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("product filter tag backfill safety", () => {
  it("defaults to dry-run and performs no updates", async () => {
    const crawlerCwd = await createWorkspace();
    const options = parseOptions([], crawlerCwd);
    const client = new FakeFilterTagBackfillClient();

    const summary = await backfillProductFilterTags(client, [changedCandidate()], options);

    expect(options.dryRun).toBe(true);
    expect(summary).toEqual({ selected: 1, changed: 1, unchanged: 0, updated: 0 });
    expect(client.updateCalls).toEqual([]);
  });

  it("writes only changed rows after explicit confirmation", async () => {
    const crawlerCwd = await createWorkspace();
    const options = parseOptions(["--confirm-write"], crawlerCwd);
    const client = new FakeFilterTagBackfillClient();

    const summary = await backfillProductFilterTags(
      client,
      [changedCandidate(), unchangedCandidate()],
      options,
    );

    expect(summary).toEqual({ selected: 2, changed: 1, unchanged: 1, updated: 1 });
    expect(client.updateCalls).toEqual([
      {
        where: { id: "product-1" },
        data: { filterTags: ["socket:am5", "cpu_family:ryzen-7"] },
        select: { id: true },
      },
    ]);
  });

  it("is unchanged when canonical tags are processed again", async () => {
    const client = new FakeFilterTagBackfillClient();

    const summary = await backfillProductFilterTags(
      client,
      [unchangedCandidate()],
      { dryRun: false },
    );

    expect(summary).toEqual({ selected: 1, changed: 0, unchanged: 1, updated: 0 });
    expect(client.updateCalls).toEqual([]);
  });

  it("rejects contradictory flags and unsupported categories", async () => {
    const crawlerCwd = await createWorkspace();
    expect(() => parseOptions(["--dry-run", "--confirm-write"], crawlerCwd)).toThrow(
      "Do not combine --dry-run with --confirm-write",
    );
    expect(() => parseOptions(["--igrp", "9"], crawlerCwd)).toThrow(
      "Unsupported --igrp value",
    );
  });
});

class FakeFilterTagBackfillClient {
  readonly updateCalls: unknown[] = [];
  readonly product = {
    update: async (args: unknown) => {
      this.updateCalls.push(args);
      return { id: "product-1" };
    },
  };
}

function changedCandidate(): ProductFilterTagCandidate {
  return {
    id: "product-1",
    name: "AMD R7 9700X【8核/16緒】3.8G",
    filterTags: [],
    sourceCategory: {
      igrp: 4,
      displayName: "CPU",
    },
  };
}

function unchangedCandidate(): ProductFilterTagCandidate {
  return {
    ...changedCandidate(),
    id: "product-2",
    filterTags: ["socket:am5", "cpu_family:ryzen-7"],
  };
}

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-filter-tag-backfill-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });
  return crawlerCwd;
}
