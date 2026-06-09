// apps/crawler/tests/scripts/ops/image-cache-backfill-processor.test.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ImageBackfillOptions } from "../../../src/scripts/ops/image-cache-backfill/options";
import {
  readMissingImageCandidates,
  type ProductImageCandidate,
} from "../../../src/scripts/ops/image-cache-backfill/processor";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("image cache backfill candidate reader", () => {
  it("prioritizes newly seen products and applies the limit after existing-file checks", async () => {
    const storageDir = await createTempRoot();
    await writeFile(join(storageDir, "recent-cached.webp"), "cached");
    const client = new FakeImageCandidateClient([
      createCandidate("recent-missing", "2026-06-08T08:05:00.000Z"),
      createCandidate("recent-cached", "2026-06-08T08:04:00.000Z"),
      createCandidate("old-missing", "2026-06-08T03:00:00.000Z"),
    ]);

    const candidates = await readMissingImageCandidates(
      client as never,
      createOptions({ storageDir, limit: 2 }),
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "recent-missing",
      "old-missing",
    ]);
    expect(client.lastFindManyArgs?.orderBy).toEqual([
      { firstSeenAt: "desc" },
      { lastSeenAt: "desc" },
      { primaryImageCheckedAt: "desc" },
      { sourceCategory: { igrp: "asc" } },
      { id: "asc" },
    ]);
    expect(client.lastFindManyArgs?.select).toEqual(
      expect.objectContaining({
        id: true,
        name: true,
        primaryImageUrl: true,
        primaryImageCheckedAt: true,
        firstSeenAt: true,
        lastSeenAt: true,
      }),
    );
  });
});

interface ProductFindManyArgs {
  orderBy?: unknown;
  select?: unknown;
}

class FakeImageCandidateClient {
  readonly product: {
    findMany: (args: ProductFindManyArgs) => Promise<ProductImageCandidate[]>;
  };
  lastFindManyArgs: ProductFindManyArgs | null = null;

  constructor(private readonly products: ProductImageCandidate[]) {
    this.product = {
      findMany: async (args) => {
        this.lastFindManyArgs = args;

        return this.products;
      },
    };
  }
}

function createCandidate(id: string, seenAt: string): ProductImageCandidate {
  const date = new Date(seenAt);

  return {
    id,
    name: id,
    primaryImageUrl: `https://www.coolpc.com.tw/eval/4/${id}.jpg`,
    primaryImageCheckedAt: date,
    firstSeenAt: date,
    lastSeenAt: date,
    sourceCategory: {
      igrp: 4,
      displayName: "CPU",
    },
  };
}

function createOptions(
  overrides: Partial<ImageBackfillOptions> = {},
): ImageBackfillOptions {
  return {
    workspaceRoot: "/workspace",
    storageDir: "/workspace/storage/product-images",
    limit: null,
    productId: null,
    igrp: null,
    minDelayMs: 3000,
    maxDelayMs: 8000,
    timeoutMs: 15000,
    maxSourceBytes: 5 * 1024 * 1024,
    dryRun: false,
    overwrite: false,
    ...overrides,
  };
}

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "partsradar-image-cache-backfill-"));
  tempRoots.push(root);

  return root;
}
