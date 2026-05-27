import type { PrismaClient } from "@partsradar/db";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "./categories";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  type CrawlRunSourceCategory,
  type ProcessCrawlCategoryResult,
} from "./crawl-run";
import {
  createCoolpcCategoryUrl,
  parseCoolpcCategoryPage,
  type ContentValidationStatus,
  type ParsedCoolpcProduct,
  type SourceCategoryContext,
} from "./parser";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  createParsedResultHash,
  recordRawSnapshot,
  type RawSnapshotContentStatusValue,
  type RawSnapshotWriteClient,
} from "./raw-snapshot";

// This module is the handoff point between raw CoolPC fetches and crawl-run
// category results. It records evidence first; product and price table writes
// stay in later Phase 3 slices.
export interface CoolpcCategorySnapshotInput {
  url?: string;
  fetchedAt: Date;
  httpStatus?: number | null;
  rawHtml?: string | null;
  fetchError?: string | null;
}

export interface ProcessCoolpcCategorySnapshotOptions {
  client: RawSnapshotWriteClient;
  storageDir: string;
  crawlRunId: string;
  category: CrawlRunSourceCategory;
  snapshot: CoolpcCategorySnapshotInput;
}

export type PrismaCoolpcCategorySnapshotClient = Pick<PrismaClient, "rawSnapshot">;

export function processCoolpcCategorySnapshotWithPrisma(
  options: Omit<ProcessCoolpcCategorySnapshotOptions, "client"> & {
    client: PrismaCoolpcCategorySnapshotClient;
  },
): Promise<ProcessCrawlCategoryResult> {
  // Keep the processor testable with a narrow write client while exposing a
  // Prisma-typed entry point for the real crawler wiring.
  return processCoolpcCategorySnapshot(options);
}

export async function processCoolpcCategorySnapshot({
  client,
  storageDir,
  crawlRunId,
  category,
  snapshot,
}: ProcessCoolpcCategorySnapshotOptions): Promise<ProcessCrawlCategoryResult> {
  const url = snapshot.url ?? createCoolpcCategoryUrl(category.igrp);
  const fetchError = snapshot.fetchError ?? null;

  // Network failures still produce a raw_snapshot row so the crawl run has a
  // traceable category result even when there is no HTML file to store.
  if (fetchError || !snapshot.rawHtml) {
    const rawSnapshot = await recordRawSnapshot({
      client,
      storageDir,
      crawlRunId,
      sourceCategoryId: category.id,
      url,
      fetchedAt: snapshot.fetchedAt,
      httpStatus: snapshot.httpStatus,
      fetchError: fetchError ?? "Missing raw HTML response body.",
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.INVALID,
      rawContent: snapshot.rawHtml,
    });

    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED,
      rawSnapshotId: rawSnapshot.id,
      errorMessage: fetchError ?? "Missing raw HTML response body.",
    };
  }

  const context = createCategoryContext(category, snapshot.fetchedAt, url);
  const parseResult = parseCoolpcCategoryPage(snapshot.rawHtml, context);
  // Parser validation decides the stored content status. Only valid parsed
  // products get a result hash; block/invalid pages remain inspectable as raw HTML.
  const rawSnapshot = await recordRawSnapshot({
    client,
    storageDir,
    crawlRunId,
    sourceCategoryId: category.id,
    url,
    fetchedAt: snapshot.fetchedAt,
    httpStatus: snapshot.httpStatus,
    contentStatus: toRawSnapshotContentStatus(parseResult.validation.status),
    rawContent: snapshot.rawHtml,
    parsedResultHash:
      parseResult.validation.status === "valid"
        ? createStableParsedResultHash(parseResult.items)
        : null,
  });

  // Suspected block is kept distinct from parse failure because the crawl runner
  // treats it as a source-level stop signal for the rest of the current cycle.
  if (parseResult.validation.status === "suspected_block") {
    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK,
      rawSnapshotId: rawSnapshot.id,
      errorMessage: parseResult.validation.reason ?? "suspected block content",
    };
  }

  // Invalid or non-importable content is saved for diagnosis, but it must not
  // flow into product/price writes in later slices.
  if (parseResult.validation.status === "invalid" || !parseResult.canImport) {
    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
      rawSnapshotId: rawSnapshot.id,
      errorMessage: buildParseFailureMessage(parseResult),
    };
  }

  // Phase 4 of the crawler write flow will compare parsedResultHash with the
  // last successful snapshot. Until that is wired, importable content is changed.
  return {
    status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
    rawSnapshotId: rawSnapshot.id,
  };
}

function createCategoryContext(
  category: CrawlRunSourceCategory,
  fetchedAt: Date,
  sourceUrl: string,
): SourceCategoryContext {
  // Runtime categories come from the database, while title validation keywords
  // live in the static CoolPC target list. Combine them here so the parser
  // does not need database-specific knowledge.
  const targetCategory: CoolpcTargetCategory | undefined = COOLPC_TARGET_CATEGORIES.find(
    (candidate) => candidate.igrp === category.igrp,
  );

  return {
    sourceCategoryId: category.id,
    igrp: category.igrp,
    sourceName: category.sourceName,
    displayName: category.displayName,
    fetchedAt,
    sourceUrl,
    expectedTitleKeywords: targetCategory?.expectedTitleKeywords
      ? [...targetCategory.expectedTitleKeywords]
      : undefined,
  };
}

function toRawSnapshotContentStatus(
  status: ContentValidationStatus,
): RawSnapshotContentStatusValue {
  switch (status) {
    case "valid":
      return RAW_SNAPSHOT_CONTENT_STATUSES.VALID;
    case "suspected_block":
      return RAW_SNAPSHOT_CONTENT_STATUSES.SUSPECTED_BLOCK;
    case "invalid":
      return RAW_SNAPSHOT_CONTENT_STATUSES.INVALID;
  }
}

function createStableParsedResultHash(items: ParsedCoolpcProduct[]): string {
  // The change detector should react to product identity/name/price changes,
  // not crawl time, source URL defaults, or parser-only bookkeeping fields.
  return createParsedResultHash(
    items.map((item) => ({
      sourceItemKey: item.sourceItemKey,
      name: item.name,
      normalizedName: item.normalizedName,
      price: item.price,
      currency: item.currency,
    })),
  );
}

function buildParseFailureMessage(parseResult: ReturnType<typeof parseCoolpcCategoryPage>): string {
  if (parseResult.validation.status !== "valid") {
    return parseResult.validation.reason ?? "content validation failed";
  }

  return (
    parseResult.issues.find((issue) => issue.type === "duplicate_source_identity")?.message ??
    "parsed category result cannot be imported"
  );
}
