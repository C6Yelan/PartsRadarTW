// apps/crawler/src/scripts/ops/backfill-product-filter-tags.ts
// 依既有商品名稱回填 filter tags；預設 dry-run，只有明確確認後才更新資料庫。

import type { PrismaClient } from "@partsradar/db";
import {
  extractProductFilterTags,
  PRODUCT_FACET_IGRPS,
} from "@partsradar/shared";
import {
  getPositiveNumberArg,
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

export interface BackfillProductFilterTagsOptions {
  workspaceRoot: string;
  dryRun: boolean;
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
}

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

    const candidates = await readCandidates(client, options);
    const summary = await backfillProductFilterTags(client, candidates, options);
    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

async function readCandidates(
  client: PrismaClient,
  options: BackfillProductFilterTagsOptions,
): Promise<ProductFilterTagCandidate[]> {
  return client.product.findMany({
    where: {
      sourceCategory: {
        igrp:
          options.igrp === null
            ? { in: [...PRODUCT_FACET_IGRPS] }
            : options.igrp,
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
    orderBy: [{ sourceCategory: { igrp: "asc" } }, { id: "asc" }],
    ...(options.limit === null ? {} : { take: options.limit }),
  });
}

export async function backfillProductFilterTags(
  client: ProductFilterTagUpdateClient,
  candidates: ProductFilterTagCandidate[],
  options: Pick<BackfillProductFilterTagsOptions, "dryRun">,
): Promise<ProductFilterTagBackfillSummary> {
  const summary: ProductFilterTagBackfillSummary = {
    selected: candidates.length,
    changed: 0,
    unchanged: 0,
    updated: 0,
  };

  for (const candidate of candidates) {
    const filterTags = extractProductFilterTags(candidate.sourceCategory.igrp, candidate.name);

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
  if (igrp !== null && !PRODUCT_FACET_IGRPS.includes(igrp as (typeof PRODUCT_FACET_IGRPS)[number])) {
    throw new Error(`Unsupported --igrp value. Use one of: ${PRODUCT_FACET_IGRPS.join(", ")}`);
  }

  return {
    workspaceRoot: resolveWorkspaceRoot(cwd),
    dryRun: !confirmWrite,
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
      "  --limit <number>    Limit the number of selected products.",
      "  --help              Show this help.",
    ].join("\n"),
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
