import type { Prisma, PrismaClient } from "@partsradar/db";
import {
  isUsableCoolpcContinuityImageUrl,
  normalizeCoolpcContinuityName,
} from "../../coolpc/product-continuity";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

const APPLY_FLAG = "--apply";
const HELP_FLAG = "--help";
const ALLOWED_FLAGS = new Set([APPLY_FLAG, HELP_FLAG]);
export const MAX_RECONCILIATION_GAP_MS = 2 * 60 * 60 * 1000;

const reconciliationProductSelect = {
  id: true,
  sourceCategoryId: true,
  ibuyToken: true,
  name: true,
  normalizedName: true,
  vendorSlug: true,
  vendorName: true,
  filterTags: true,
  primaryImageUrl: true,
  primaryImageCheckedAt: true,
  imageCachedAt: true,
  imageCacheCheckedAt: true,
  imageCacheFailureCount: true,
  imageCacheLastError: true,
  imageCacheLastErrorKind: true,
  imageCacheLastHttpStatus: true,
  imageCacheFailureSince: true,
  imageCacheLastSuccessAt: true,
  imageCacheNextRetryAt: true,
  sourceUrl: true,
  isActive: true,
  isExcluded: true,
  exclusionReason: true,
  missingSince: true,
  missingSeenCount: true,
  firstSeenAt: true,
  lastSeenAt: true,
  createdAt: true,
  sourceCategory: { select: { igrp: true } },
  currentPrice: {
    select: {
      priceSnapshotId: true,
      lastSeenAt: true,
      priceChangedAt: true,
      priceSnapshot: { select: { price: true, currency: true } },
    },
  },
  priceSnapshots: {
    select: { id: true, price: true, currency: true, capturedAt: true },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
    take: 1,
  },
  discordTargetWatches: { select: { discordUserId: true } },
} satisfies Prisma.ProductSelect;

export type ReconciliationProduct = Prisma.ProductGetPayload<{
  select: typeof reconciliationProductSelect;
}>;

export interface ReconciliationPair {
  keeper: ReconciliationProduct;
  duplicate: ReconciliationProduct;
}

export interface ReconciliationScan {
  pairs: ReconciliationPair[];
  ambiguous: number;
  skipped: number;
}

export interface ReconciliationSummary {
  matched: number;
  ambiguous: number;
  skipped: number;
  conflicts: number;
  applied: number;
}

export interface ReconciliationOptions {
  dryRun: boolean;
}

type MergeResult = "applied" | "conflict" | "already_applied";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseReconciliationOptions(args);

  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  let client: PrismaClient | null = null;

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;
    const products = await readReconciliationProducts(client);
    const summary = await reconcileCoolpcProductIdentities(client, products, options);
    printSummary(summary, options);
  } finally {
    await client?.$disconnect();
  }
}

export function parseReconciliationOptions(args: readonly string[]): ReconciliationOptions {
  const unknownFlag = args.find((arg) => !ALLOWED_FLAGS.has(arg));

  if (unknownFlag) {
    throw new Error(`Unknown option: ${unknownFlag}`);
  }

  return { dryRun: !args.includes(APPLY_FLAG) };
}

export async function readReconciliationProducts(
  client: PrismaClient,
): Promise<ReconciliationProduct[]> {
  return client.product.findMany({
    where: { primaryImageUrl: { not: null } },
    select: reconciliationProductSelect,
    orderBy: [{ sourceCategoryId: "asc" }, { firstSeenAt: "asc" }, { id: "asc" }],
  });
}

export function findHistoricalReconciliationPairs(
  products: readonly ReconciliationProduct[],
): ReconciliationScan {
  const productsByImage = new Map<string, ReconciliationProduct[]>();

  for (const product of products) {
    if (!isUsableCoolpcContinuityImageUrl(product.primaryImageUrl)) {
      continue;
    }

    const key = `${product.sourceCategoryId}\0${product.primaryImageUrl}`;
    const group = productsByImage.get(key) ?? [];
    group.push(product);
    productsByImage.set(key, group);
  }

  const scan: ReconciliationScan = { pairs: [], ambiguous: 0, skipped: 0 };

  for (const group of productsByImage.values()) {
    if (group.length < 2) {
      continue;
    }

    const orderedGroup = [...group].sort(compareProductsChronologically);
    const possiblePairs: ReconciliationPair[] = [];

    for (const [duplicateIndex, duplicate] of orderedGroup.entries()) {
      for (const keeper of orderedGroup.slice(0, duplicateIndex)) {
        if (isHistoricalContinuityPair(keeper, duplicate)) {
          possiblePairs.push({ keeper, duplicate });
        }
      }
    }

    if (possiblePairs.length === 0) {
      scan.skipped += 1;
      continue;
    }

    const keeperMatchCounts = countPairSides(possiblePairs, "keeper");
    const duplicateMatchCounts = countPairSides(possiblePairs, "duplicate");
    const unambiguousPairs = possiblePairs.filter(
      (pair) =>
        keeperMatchCounts.get(pair.keeper.id) === 1 &&
        duplicateMatchCounts.get(pair.duplicate.id) === 1,
    );

    if (unambiguousPairs.length !== possiblePairs.length) {
      scan.ambiguous += 1;
      continue;
    }

    scan.pairs.push(...unambiguousPairs);
  }

  scan.pairs.sort(
    (left, right) =>
      right.duplicate.firstSeenAt.getTime() - left.duplicate.firstSeenAt.getTime() ||
      right.duplicate.id.localeCompare(left.duplicate.id),
  );
  return scan;
}

export async function reconcileCoolpcProductIdentities(
  client: PrismaClient,
  products: readonly ReconciliationProduct[],
  options: ReconciliationOptions,
): Promise<ReconciliationSummary> {
  const scan = findHistoricalReconciliationPairs(products);
  const summary: ReconciliationSummary = {
    matched: scan.pairs.length,
    ambiguous: scan.ambiguous,
    skipped: scan.skipped,
    conflicts: 0,
    applied: 0,
  };

  for (const pair of scan.pairs) {
    if (hasTargetWatchConflict(pair.keeper, pair.duplicate)) {
      summary.conflicts += 1;
      continue;
    }

    if (options.dryRun) {
      continue;
    }

    const result = await mergeReconciliationPair(client, pair);
    if (result === "conflict") {
      summary.conflicts += 1;
    } else if (result === "applied") {
      summary.applied += 1;
    }
  }

  return summary;
}

export function hasTargetWatchConflict(
  keeper: ReconciliationProduct,
  duplicate: ReconciliationProduct,
): boolean {
  const keeperUsers = new Set(keeper.discordTargetWatches.map((watch) => watch.discordUserId));
  return duplicate.discordTargetWatches.some((watch) => keeperUsers.has(watch.discordUserId));
}

export async function mergeReconciliationPair(
  client: PrismaClient,
  pair: ReconciliationPair,
): Promise<MergeResult> {
  return client.$transaction(async (transaction) => {
    const [keeper, duplicate] = await Promise.all([
      transaction.product.findUnique({
        where: { id: pair.keeper.id },
        select: reconciliationProductSelect,
      }),
      transaction.product.findUnique({
        where: { id: pair.duplicate.id },
        select: reconciliationProductSelect,
      }),
    ]);

    if (!duplicate) {
      return "already_applied";
    }

    if (!keeper || !isHistoricalContinuityPair(keeper, duplicate)) {
      throw new Error(`Reconciliation pair changed before apply: ${pair.keeper.id}.`);
    }

    if (hasTargetWatchConflict(keeper, duplicate)) {
      return "conflict";
    }

    const duplicateFacets = await transaction.productFacetEligibleProduct.findMany({
      where: { productId: duplicate.id },
      select: { igrp: true, tag: true },
    });
    const currentPrices = [keeper.currentPrice, duplicate.currentPrice].filter(
      (currentPrice): currentPrice is NonNullable<typeof currentPrice> => currentPrice !== null,
    );

    await transaction.currentPrice.deleteMany({
      where: { productId: { in: [keeper.id, duplicate.id] } },
    });
    await transaction.priceSnapshot.updateMany({
      where: { productId: duplicate.id },
      data: { productId: keeper.id },
    });
    await transaction.discordNotificationDelivery.updateMany({
      where: { productId: duplicate.id },
      data: { productId: keeper.id },
    });
    await transaction.discordTargetPriceWatch.updateMany({
      where: { productId: duplicate.id },
      data: { productId: keeper.id },
    });

    for (const facet of duplicateFacets) {
      await transaction.productFacetEligibleProduct.upsert({
        where: {
          igrp_tag_productId: { igrp: facet.igrp, tag: facet.tag, productId: keeper.id },
        },
        create: { igrp: facet.igrp, tag: facet.tag, productId: keeper.id },
        update: {},
      });
    }

    await transaction.productFacetEligibleProduct.deleteMany({
      where: { productId: duplicate.id },
    });
    await transaction.product.delete({ where: { id: duplicate.id }, select: { id: true } });
    await transaction.product.update({
      where: { id: keeper.id },
      data: buildKeeperUpdateData(keeper, duplicate),
      select: { id: true },
    });

    const latestSnapshot = await transaction.priceSnapshot.findFirst({
      where: { productId: keeper.id },
      select: { id: true, capturedAt: true },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    });

    if (latestSnapshot) {
      const matchingCurrentPrice = currentPrices.find(
        (currentPrice) => currentPrice.priceSnapshotId === latestSnapshot.id,
      );
      await transaction.currentPrice.create({
        data: {
          productId: keeper.id,
          priceSnapshotId: latestSnapshot.id,
          lastSeenAt: maxDate(keeper.lastSeenAt, duplicate.lastSeenAt),
          priceChangedAt: matchingCurrentPrice?.priceChangedAt ?? latestSnapshot.capturedAt,
        },
        select: { productId: true },
      });
    }

    return "applied";
  });
}

function isHistoricalContinuityPair(
  keeper: ReconciliationProduct,
  duplicate: ReconciliationProduct,
): boolean {
  const keeperPrice = keeper.currentPrice?.priceSnapshot;
  const duplicateInitialPrice = duplicate.priceSnapshots[0];
  const gapMs = duplicate.firstSeenAt.getTime() - keeper.lastSeenAt.getTime();

  return (
    keeper.sourceCategoryId === duplicate.sourceCategoryId &&
    keeper.ibuyToken !== duplicate.ibuyToken &&
    keeper.primaryImageUrl === duplicate.primaryImageUrl &&
    isUsableCoolpcContinuityImageUrl(keeper.primaryImageUrl) &&
    normalizeCoolpcContinuityName(keeper.name) === normalizeCoolpcContinuityName(duplicate.name) &&
    keeperPrice !== undefined &&
    duplicateInitialPrice !== undefined &&
    keeperPrice.price === duplicateInitialPrice.price &&
    keeperPrice.currency === duplicateInitialPrice.currency &&
    gapMs >= 0 &&
    gapMs <= MAX_RECONCILIATION_GAP_MS &&
    keeper.createdAt.getTime() <= duplicate.createdAt.getTime()
  );
}

function buildKeeperUpdateData(
  keeper: ReconciliationProduct,
  duplicate: ReconciliationProduct,
): Prisma.ProductUpdateInput {
  return {
    ibuyToken: duplicate.ibuyToken,
    name: duplicate.name,
    normalizedName: duplicate.normalizedName,
    vendorSlug: duplicate.vendorSlug,
    vendorName: duplicate.vendorName,
    filterTags: duplicate.filterTags,
    primaryImageUrl: duplicate.primaryImageUrl,
    primaryImageCheckedAt: duplicate.primaryImageCheckedAt,
    imageCachedAt: duplicate.imageCachedAt,
    imageCacheCheckedAt: duplicate.imageCacheCheckedAt,
    imageCacheFailureCount: duplicate.imageCacheFailureCount,
    imageCacheLastError: duplicate.imageCacheLastError,
    imageCacheLastErrorKind: duplicate.imageCacheLastErrorKind,
    imageCacheLastHttpStatus: duplicate.imageCacheLastHttpStatus,
    imageCacheFailureSince: duplicate.imageCacheFailureSince,
    imageCacheLastSuccessAt: duplicate.imageCacheLastSuccessAt,
    imageCacheNextRetryAt: duplicate.imageCacheNextRetryAt,
    sourceUrl: duplicate.sourceUrl,
    isActive: duplicate.isActive,
    isExcluded: duplicate.isExcluded,
    exclusionReason: duplicate.exclusionReason,
    missingSince: duplicate.missingSince,
    missingSeenCount: duplicate.missingSeenCount,
    firstSeenAt: minDate(keeper.firstSeenAt, duplicate.firstSeenAt),
    lastSeenAt: maxDate(keeper.lastSeenAt, duplicate.lastSeenAt),
  };
}

function compareProductsChronologically(
  left: ReconciliationProduct,
  right: ReconciliationProduct,
): number {
  return (
    left.firstSeenAt.getTime() - right.firstSeenAt.getTime() ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function countPairSides(
  pairs: readonly ReconciliationPair[],
  side: "keeper" | "duplicate",
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const pair of pairs) {
    const id = pair[side].id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

function minDate(left: Date, right: Date): Date {
  return left <= right ? left : right;
}

function maxDate(left: Date, right: Date): Date {
  return left >= right ? left : right;
}

function printSummary(summary: ReconciliationSummary, options: ReconciliationOptions): void {
  console.log("CoolPC product identity reconciliation summary:");
  console.log(`- mode: ${options.dryRun ? "dry-run" : "apply"}`);
  console.log(`- matched: ${summary.matched}`);
  console.log(`- ambiguous: ${summary.ambiguous}`);
  console.log(`- skipped: ${summary.skipped}`);
  console.log(`- conflicts: ${summary.conflicts}`);
  console.log(`- applied: ${summary.applied}`);
}

function printHelp(): void {
  console.log(`
Usage: pnpm ops:product-identities:reconcile [--apply]

Options:
  --apply  Merge zero-ambiguity pairs. Without this flag the command is read-only.
  --help   Show this help message.
`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
