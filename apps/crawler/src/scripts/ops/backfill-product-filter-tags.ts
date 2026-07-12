// apps/crawler/src/scripts/ops/backfill-product-filter-tags.ts
// 依既有商品名稱回填 filter tags；預設 dry-run，只有明確確認後才更新資料庫。

import type { Prisma, PrismaClient } from "@partsradar/db";
import { extractProductFilterTags, PRODUCT_FACET_IGRPS } from "@partsradar/shared";
import {
  getPositiveNumberArg,
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

export interface BackfillProductFilterTagsOptions {
  workspaceRoot: string;
  dryRun: boolean;
  batchSize: number;
  limit: number | null;
  igrp: number | null;
}

export interface ProductFilterTagCandidate {
  id: string;
  name: string;
  filterTags: string[];
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

export interface ProductFilterTagBackfillSummary {
  selected: number;
  changed: number;
  unchanged: number;
  updated: number;
  categories: ProductFilterTagCategorySummary[];
}

export interface ProductFilterTagCategorySummary {
  igrp: number;
  displayName: string;
  selected: number;
  withoutTags: number;
  facetHits: Record<string, number>;
}

export interface ProductFilterTagBatchRequest {
  afterId: string | null;
  take: number;
  igrp: number | null;
}

export type ProductFilterTagBatchReader = (
  request: ProductFilterTagBatchRequest,
) => Promise<ProductFilterTagCandidate[]>;

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 2_000;

interface ProductFilterTagUpdateClient {
  product: {
    update(args: {
      where: { id: string };
      data: { filterTags: string[] };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;

    const summary = await backfillProductFilterTagsInBatches(
      client,
      (request) => readCandidates(client as PrismaClient, request),
      options,
    );
    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

async function readCandidates(
  client: PrismaClient,
  request: ProductFilterTagBatchRequest,
): Promise<ProductFilterTagCandidate[]> {
  return client.product.findMany(buildProductFilterTagCandidateQuery(request));
}

export function buildProductFilterTagCandidateQuery(request: ProductFilterTagBatchRequest) {
  return {
    where: {
      sourceCategory: {
        igrp: request.igrp === null ? { in: [...PRODUCT_FACET_IGRPS] } : request.igrp,
      },
    },
    select: {
      id: true,
      name: true,
      filterTags: true,
      sourceCategory: {
        select: {
          igrp: true,
          displayName: true,
        },
      },
    },
    orderBy: { id: "asc" },
    take: request.take,
    ...(request.afterId === null
      ? {}
      : {
          cursor: { id: request.afterId },
          skip: 1,
        }),
  } satisfies Prisma.ProductFindManyArgs;
}

export async function backfillProductFilterTagsInBatches(
  client: ProductFilterTagUpdateClient,
  readBatch: ProductFilterTagBatchReader,
  options: Pick<BackfillProductFilterTagsOptions, "batchSize" | "dryRun" | "igrp" | "limit">,
): Promise<ProductFilterTagBackfillSummary> {
  const summary = createEmptySummary();
  let afterId: string | null = null;
  let remaining = options.limit;

  while (remaining === null || remaining > 0) {
    const take = remaining === null ? options.batchSize : Math.min(options.batchSize, remaining);
    const candidates = await readBatch({ afterId, take, igrp: options.igrp });

    if (candidates.length === 0) {
      break;
    }

    mergeSummaries(
      summary,
      await backfillProductFilterTags(client, candidates, { dryRun: options.dryRun }),
    );
    afterId = candidates.at(-1)?.id ?? null;
    if (remaining !== null) {
      remaining -= candidates.length;
    }
    if (candidates.length < take) {
      break;
    }
  }

  return summary;
}

export async function backfillProductFilterTags(
  client: ProductFilterTagUpdateClient,
  candidates: ProductFilterTagCandidate[],
  options: Pick<BackfillProductFilterTagsOptions, "dryRun">,
): Promise<ProductFilterTagBackfillSummary> {
  const summary = createEmptySummary();
  summary.selected = candidates.length;

  for (const candidate of candidates) {
    const filterTags = extractProductFilterTags(candidate.sourceCategory.igrp, candidate.name);
    recordCategoryCoverage(summary, candidate, filterTags);

    if (arraysEqual(candidate.filterTags, filterTags)) {
      summary.unchanged += 1;
      continue;
    }

    summary.changed += 1;
    if (options.dryRun) {
      continue;
    }

    await client.product.update({
      where: { id: candidate.id },
      data: { filterTags },
      select: { id: true },
    });
    summary.updated += 1;
  }

  summary.categories.sort((left, right) => left.igrp - right.igrp);
  return summary;
}

export function parseOptions(
  args: string[],
  cwd = process.cwd(),
): BackfillProductFilterTagsOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const confirmWrite = args.includes("--confirm-write");
  if (confirmWrite && args.includes("--dry-run")) {
    throw new Error(
      "Do not combine --dry-run with --confirm-write; omit both flags for the default dry run.",
    );
  }

  const igrp = getPositiveNumberArg(args, "--igrp");
  if (
    igrp !== null &&
    !PRODUCT_FACET_IGRPS.includes(igrp as (typeof PRODUCT_FACET_IGRPS)[number])
  ) {
    throw new Error(`Unsupported --igrp value. Use one of: ${PRODUCT_FACET_IGRPS.join(", ")}`);
  }

  const batchSize = getPositiveNumberArg(args, "--batch-size") ?? DEFAULT_BATCH_SIZE;
  if (batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must not exceed ${MAX_BATCH_SIZE}`);
  }

  return {
    workspaceRoot: resolveWorkspaceRoot(cwd),
    dryRun: !confirmWrite,
    batchSize,
    limit: getPositiveNumberArg(args, "--limit"),
    igrp,
  };
}

function printSummary(
  summary: ProductFilterTagBackfillSummary,
  options: BackfillProductFilterTagsOptions,
): void {
  console.log(
    JSON.stringify({
      event: "product_filter_tags_backfill",
      mode: options.dryRun ? "dry-run" : "write",
      igrp: options.igrp,
      batchSize: options.batchSize,
      limit: options.limit,
      ...summary,
    }),
  );
}

function printHelp(): void {
  console.log(
    [
      "Usage: pnpm ops:product-filter-tags:backfill -- [options]",
      "",
      "Options:",
      "  --dry-run          Preview changes without writing (default).",
      "  --confirm-write     Persist changed filter tags.",
      "  --igrp <number>     Limit candidates to one existing category.",
      `  --batch-size <n>    Read at most ${MAX_BATCH_SIZE} products per batch (default ${DEFAULT_BATCH_SIZE}).`,
      "  --limit <number>    Optional total product limit across all batches.",
      "  --help              Show this help.",
    ].join("\n"),
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createEmptySummary(): ProductFilterTagBackfillSummary {
  return {
    selected: 0,
    changed: 0,
    unchanged: 0,
    updated: 0,
    categories: [],
  };
}

function recordCategoryCoverage(
  summary: ProductFilterTagBackfillSummary,
  candidate: ProductFilterTagCandidate,
  filterTags: readonly string[],
): void {
  let category = summary.categories.find((entry) => entry.igrp === candidate.sourceCategory.igrp);
  if (!category) {
    category = {
      igrp: candidate.sourceCategory.igrp,
      displayName: candidate.sourceCategory.displayName,
      selected: 0,
      withoutTags: 0,
      facetHits: {},
    };
    summary.categories.push(category);
  }

  category.selected += 1;
  if (filterTags.length === 0) {
    category.withoutTags += 1;
  }
  for (const filterTag of filterTags) {
    category.facetHits[filterTag] = (category.facetHits[filterTag] ?? 0) + 1;
  }
}

function mergeSummaries(
  target: ProductFilterTagBackfillSummary,
  source: ProductFilterTagBackfillSummary,
): void {
  target.selected += source.selected;
  target.changed += source.changed;
  target.unchanged += source.unchanged;
  target.updated += source.updated;

  for (const sourceCategory of source.categories) {
    let targetCategory = target.categories.find((entry) => entry.igrp === sourceCategory.igrp);
    if (!targetCategory) {
      targetCategory = {
        ...sourceCategory,
        facetHits: { ...sourceCategory.facetHits },
      };
      target.categories.push(targetCategory);
      target.categories.sort((left, right) => left.igrp - right.igrp);
      continue;
    }

    targetCategory.selected += sourceCategory.selected;
    targetCategory.withoutTags += sourceCategory.withoutTags;
    for (const [filterTag, count] of Object.entries(sourceCategory.facetHits)) {
      targetCategory.facetHits[filterTag] = (targetCategory.facetHits[filterTag] ?? 0) + count;
    }
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
