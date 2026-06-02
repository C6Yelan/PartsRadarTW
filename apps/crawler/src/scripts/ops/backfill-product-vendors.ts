// apps/crawler/src/scripts/ops/backfill-product-vendors.ts
// This script is a manual local backfill tool for product vendor metadata.
// It derives vendor fields from existing product names and category IDs.
// Do not use this as the production scheduled crawler entrypoint.
import type { PrismaClient } from "@partsradar/db";
import { classifyProductVendor } from "@partsradar/shared";
import {
  getPositiveNumberArg,
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

interface BackfillProductVendorsOptions {
  workspaceRoot: string;
  dryRun: boolean;
  limit: number | null;
  igrp: number | null;
}

interface ProductCandidate {
  id: string;
  name: string;
  vendorSlug: string | null;
  vendorName: string | null;
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

interface BackfillSummary {
  selected: number;
  changed: number;
  unchanged: number;
  matched: number;
  unmatched: number;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let client: PrismaClient | null = null;

  try {
    await loadWorkspaceEnv(options.workspaceRoot);
    const db = await import("@partsradar/db");
    client = db.prisma;

    const candidates = await readCandidates(client, options);
    const summary = await backfillProductVendors(client, candidates, options);

    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

async function readCandidates(
  client: PrismaClient,
  options: BackfillProductVendorsOptions,
): Promise<ProductCandidate[]> {
  return client.product.findMany({
    where: {
      sourceCategory: {
        ...(options.igrp === null ? {} : { igrp: options.igrp }),
        enabled: true,
      },
    },
    select: {
      id: true,
      name: true,
      vendorSlug: true,
      vendorName: true,
      sourceCategory: {
        select: {
          igrp: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ sourceCategory: { igrp: "asc" } }, { id: "asc" }],
    take: options.limit ?? undefined,
  });
}

async function backfillProductVendors(
  client: PrismaClient,
  candidates: ProductCandidate[],
  options: BackfillProductVendorsOptions,
): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    selected: candidates.length,
    changed: 0,
    unchanged: 0,
    matched: 0,
    unmatched: 0,
  };

  for (const product of candidates) {
    const vendor = classifyProductVendor(product.sourceCategory.igrp, product.name);
    const nextVendorSlug = vendor?.slug ?? null;
    const nextVendorName = vendor?.name ?? null;

    if (vendor) {
      summary.matched += 1;
    } else {
      summary.unmatched += 1;
    }

    if (product.vendorSlug === nextVendorSlug && product.vendorName === nextVendorName) {
      summary.unchanged += 1;
      continue;
    }

    summary.changed += 1;

    if (options.dryRun) {
      console.log(
        `[dry-run] ${product.id} | ${product.sourceCategory.displayName} | ${
          nextVendorName ?? "unknown"
        } | ${product.name}`,
      );
      continue;
    }

    await client.product.update({
      where: { id: product.id },
      data: {
        vendorSlug: nextVendorSlug,
        vendorName: nextVendorName,
      },
      select: { id: true },
    });
  }

  return summary;
}

function parseOptions(args: string[]): BackfillProductVendorsOptions {
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  return {
    workspaceRoot: resolveWorkspaceRoot(),
    dryRun: args.includes("--dry-run"),
    limit: getPositiveNumberArg(args, "--limit"),
    igrp: getPositiveNumberArg(args, "--igrp"),
  };
}

function printSummary(summary: BackfillSummary, options: BackfillProductVendorsOptions): void {
  console.log("");
  console.log("Product vendor backfill summary:");
  console.log(`- mode: ${options.dryRun ? "dry-run" : "write"}`);
  console.log(`- selected: ${summary.selected}`);
  console.log(`- matched: ${summary.matched}`);
  console.log(`- unmatched: ${summary.unmatched}`);
  console.log(`- changed: ${summary.changed}`);
  console.log(`- unchanged: ${summary.unchanged}`);
}

function printHelp(): void {
  console.log(`
Usage: pnpm ops:product-vendors:backfill [options]

Options:
  --dry-run       Print changes without writing to the database.
  --igrp <value>  Limit backfill to one CoolPC category.
  --limit <value> Limit number of products to scan.
  --help          Show this help message.
`);
}

main().catch((error: unknown) => {
  console.error(toSafeCliErrorMessage(error));
  process.exitCode = 1;
});
