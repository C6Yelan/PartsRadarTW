// apps/crawler/tests/scripts/ops/backfill-product-filter-tags.test.ts
// 驗證 filter tag backfill 預設不寫 DB、只更新變更列，且重複執行結果穩定。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backfillProductFilterTags,
  backfillProductFilterTagsInBatches,
  buildProductFilterTagCandidateQuery,
  type ProductFilterTagBatchReader,
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
    expect(summary).toEqual(summaryForCpu({ selected: 1, changed: 1 }));
    expect(client.updateCalls).toEqual([]);
  });

  it("writes only changed rows after explicit confirmation", async () => {
    const crawlerCwd = await createWorkspace();
    const options = parseOptions(["--confirm-write"], crawlerCwd);
    const client = new FakeFilterTagBackfillClient();

    const summary = await backfillProductFilterTags(
      client,
      [changedCandidate(), unchangedCandidate()],
      { ...options, sourceFilterTagsByIgrp: {} },
    );

    expect(summary).toEqual(
      summaryForCpu({ selected: 2, changed: 1, unchanged: 1, updated: 1, hitCount: 2 }),
    );
    expect(client.updateCalls).toEqual([
      {
        where: { id: "product-1" },
        data: {
          filterTags: ["socket:am5", "cpu_family:ryzen-7", "integrated_graphics:yes"],
        },
        select: { id: true },
      },
    ]);
  });

  it("is unchanged when canonical tags are processed again", async () => {
    const client = new FakeFilterTagBackfillClient();

    const summary = await backfillProductFilterTags(client, [unchangedCandidate()], {
      dryRun: false,
      sourceFilterTagsByIgrp: {},
    });

    expect(summary).toEqual(summaryForCpu({ selected: 1, unchanged: 1 }));
    expect(client.updateCalls).toEqual([]);
  });

  it("reads stable batches with an optional total limit and category filter", async () => {
    const client = new FakeFilterTagBackfillClient();
    const candidates = Array.from({ length: 5 }, (_, index) =>
      changedCandidate(`product-${index + 1}`),
    );
    const requests: Parameters<ProductFilterTagBatchReader>[0][] = [];
    const readBatch = candidateReader(candidates, requests);

    const summary = await backfillProductFilterTagsInBatches(client, readBatch, {
      batchSize: 2,
      dryRun: true,
      igrp: 4,
      limit: 3,
    });

    expect(requests).toEqual([
      { afterId: null, take: 2, igrp: 4 },
      { afterId: "product-2", take: 1, igrp: 4 },
    ]);
    expect(summary).toEqual(summaryForCpu({ selected: 3, changed: 3, hitCount: 3 }));
    expect(client.updateCalls).toEqual([]);
  });

  it("builds bounded first and subsequent Prisma batch queries", () => {
    const firstQuery = buildProductFilterTagCandidateQuery({
      afterId: null,
      take: 25,
      igrp: 4,
    });
    expect(firstQuery).toMatchObject({
      where: { sourceCategory: { igrp: 4 } },
      orderBy: { id: "asc" },
      take: 25,
    });
    expect(firstQuery).not.toHaveProperty("cursor");
    expect(firstQuery).not.toHaveProperty("skip");

    expect(
      buildProductFilterTagCandidateQuery({ afterId: "product-25", take: 10, igrp: null }),
    ).toMatchObject({
      where: { sourceCategory: { igrp: { in: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16] } } },
      orderBy: { id: "asc" },
      take: 10,
      cursor: { id: "product-25" },
      skip: 1,
    });
  });

  it("merges independently reported category coverage across batches", async () => {
    const client = new FakeFilterTagBackfillClient();
    const summary = await backfillProductFilterTagsInBatches(
      client,
      candidateReader([changedCandidate(), changedGpuCandidate()]),
      { batchSize: 1, dryRun: true, igrp: null, limit: null },
    );

    expect(summary.selected).toBe(2);
    expect(summary.changed).toBe(2);
    expect(summary.categories).toEqual([
      summaryForCpu({ selected: 1, changed: 1 }).categories[0],
      {
        igrp: 12,
        displayName: "顯示卡",
        selected: 1,
        withoutTags: 0,
        facetHits: {
          "gpu_product_type:graphics-card": 1,
          "gpu_chip:nvidia": 1,
          "gpu_series:rtx-50": 1,
          "vram_gb:16": 1,
        },
      },
    ]);
  });

  it("can restart safely after a batch interruption", async () => {
    const candidates = Array.from({ length: 3 }, (_, index) =>
      changedCandidate(`product-${index + 1}`),
    );
    const client = new MutableFilterTagBackfillClient(candidates);
    const stableReader = candidateReader(candidates);
    let readCount = 0;

    await expect(
      backfillProductFilterTagsInBatches(
        client,
        async (request) => {
          readCount += 1;
          if (readCount === 2) {
            throw new Error("interrupted");
          }
          return stableReader(request);
        },
        {
          batchSize: 2,
          dryRun: false,
          igrp: null,
          limit: null,
          sourceFilterTagsByIgrp: {},
        },
      ),
    ).rejects.toThrow("interrupted");

    const summary = await backfillProductFilterTagsInBatches(client, stableReader, {
      batchSize: 2,
      dryRun: false,
      igrp: null,
      limit: null,
      sourceFilterTagsByIgrp: {},
    });

    expect(summary).toEqual(
      summaryForCpu({ selected: 3, changed: 1, unchanged: 2, updated: 1, hitCount: 3 }),
    );
  });

  it("reports products without any extracted tags by category", async () => {
    const client = new FakeFilterTagBackfillClient();
    const summary = await backfillProductFilterTags(
      client,
      [
        {
          ...changedCandidate(),
          name: "未明示任何可辨識規格",
        },
      ],
      { dryRun: true },
    );

    expect(summary.categories).toEqual([
      {
        igrp: 4,
        displayName: "CPU",
        selected: 1,
        withoutTags: 1,
        facetHits: {},
      },
    ]);
  });

  it("uses the same source-over-local merge policy as the crawler", async () => {
    const client = new FakeFilterTagBackfillClient();

    await backfillProductFilterTags(client, [changedCandidate()], {
      dryRun: false,
      sourceFilterTagsByIgrp: {
        "4": {
          "amd r7 9700x【8核/16緒】3.8g": ["socket:lga1851"],
        },
      },
    });

    expect(client.updateCalls).toEqual([
      expect.objectContaining({
        data: {
          filterTags: ["socket:lga1851", "cpu_family:ryzen-7", "integrated_graphics:yes"],
        },
      }),
    ]);
  });

  it("regenerates supported workstation motherboard sockets through the existing backfill", async () => {
    const client = new FakeFilterTagBackfillClient();
    const candidate: ProductFilterTagCandidate = {
      id: "workstation-board",
      name: "華碩 PRO WS W880-ACE SE(ATX/8*DDR5)",
      filterTags: [],
      sourceCategory: { igrp: 5, displayName: "主機板" },
    };

    const summary = await backfillProductFilterTags(client, [candidate], { dryRun: true });

    expect(summary.changed).toBe(1);
    expect(summary.categories[0]?.facetHits).toMatchObject({
      "socket:lga1851": 1,
      "chipset:w880": 1,
      "memory_type:ddr5": 1,
      "form_factor:atx": 1,
    });
    expect(client.updateCalls).toEqual([]);
  });

  it("backfills exact SSD capacities together with their display buckets", async () => {
    const client = new FakeFilterTagBackfillClient();
    const candidate: ProductFilterTagCandidate = {
      id: "ssd-1024",
      name: "金士頓 SKC600 SSD 1024G ~搭機價~",
      filterTags: [],
      sourceCategory: { igrp: 7, displayName: "SSD" },
    };

    const summary = await backfillProductFilterTags(client, [candidate], {
      dryRun: false,
      sourceFilterTagsByIgrp: {},
    });

    expect(summary.categories[0]?.facetHits).toMatchObject({
      "capacity_gb:1024": 1,
      "capacity_bucket:about-1tb": 1,
    });
    expect(client.updateCalls).toEqual([
      expect.objectContaining({
        data: { filterTags: ["capacity_gb:1024", "capacity_bucket:about-1tb"] },
      }),
    ]);
  });

  it("refuses writes when source filter tags are unavailable", async () => {
    await expect(
      backfillProductFilterTags(new FakeFilterTagBackfillClient(), [changedCandidate()], {
        dryRun: false,
      }),
    ).rejects.toThrow("without source filter tags");
  });

  it("rejects contradictory flags and unsupported categories", async () => {
    const crawlerCwd = await createWorkspace();
    expect(() => parseOptions(["--dry-run", "--confirm-write"], crawlerCwd)).toThrow(
      "Do not combine --dry-run with --confirm-write",
    );
    expect(parseOptions(["--igrp", "9"], crawlerCwd).igrp).toBe(9);
    expect(() => parseOptions(["--igrp", "13"], crawlerCwd)).toThrow("Unsupported --igrp value");
    expect(() => parseOptions(["--batch-size", "2001"], crawlerCwd)).toThrow(
      "--batch-size must not exceed 2000",
    );

    expect(
      parseOptions(["--igrp", "4", "--batch-size", "25", "--limit", "50"], crawlerCwd),
    ).toMatchObject({
      batchSize: 25,
      igrp: 4,
      limit: 50,
    });
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

class MutableFilterTagBackfillClient {
  readonly updateCalls: unknown[] = [];

  constructor(private readonly candidates: ProductFilterTagCandidate[]) {}

  readonly product = {
    update: async (args: {
      where: { id: string };
      data: { filterTags: string[] };
      select: { id: true };
    }) => {
      const candidate = this.candidates.find((entry) => entry.id === args.where.id);
      if (candidate) {
        candidate.filterTags = [...args.data.filterTags];
      }
      this.updateCalls.push(args);
      return { id: args.where.id };
    },
  };
}

function changedCandidate(id = "product-1"): ProductFilterTagCandidate {
  return {
    id,
    name: "AMD R7 9700X【8核/16緒】3.8G",
    filterTags: [],
    sourceCategory: {
      igrp: 4,
      displayName: "CPU",
    },
  };
}

function candidateReader(
  candidates: ProductFilterTagCandidate[],
  requests: Parameters<ProductFilterTagBatchReader>[0][] = [],
): ProductFilterTagBatchReader {
  return async (request) => {
    requests.push(request);
    const filtered = candidates.filter(
      (candidate) => request.igrp === null || candidate.sourceCategory.igrp === request.igrp,
    );
    const start =
      request.afterId === null
        ? 0
        : filtered.findIndex((candidate) => candidate.id === request.afterId) + 1;
    return filtered.slice(start, start + request.take);
  };
}

function summaryForCpu({
  selected,
  changed = 0,
  unchanged = 0,
  updated = 0,
  hitCount = selected,
}: {
  selected: number;
  changed?: number;
  unchanged?: number;
  updated?: number;
  hitCount?: number;
}) {
  return {
    selected,
    changed,
    unchanged,
    updated,
    categories: [
      {
        igrp: 4,
        displayName: "CPU",
        selected,
        withoutTags: 0,
        facetHits: {
          "socket:am5": hitCount,
          "cpu_family:ryzen-7": hitCount,
          "integrated_graphics:yes": hitCount,
        },
      },
    ],
  };
}

function unchangedCandidate(): ProductFilterTagCandidate {
  return {
    ...changedCandidate(),
    id: "product-2",
    filterTags: ["socket:am5", "cpu_family:ryzen-7", "integrated_graphics:yes"],
  };
}

function changedGpuCandidate(): ProductFilterTagCandidate {
  return {
    id: "product-2",
    name: "NVIDIA GeForce RTX 5070 Ti 16GB",
    filterTags: [],
    sourceCategory: {
      igrp: 12,
      displayName: "顯示卡",
    },
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
