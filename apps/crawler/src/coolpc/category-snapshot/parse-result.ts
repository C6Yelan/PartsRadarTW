// apps/crawler/src/coolpc/category-snapshot/parse-result.ts

import type { ParseErrorType as PrismaParseErrorType } from "@partsradar/db";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "../categories";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  type CrawlRunSourceCategory,
} from "../crawl-run";
import type {
  ContentValidationStatus,
  CoolpcParseIssue,
  CoolpcParseResult,
  ParseErrorType as CoolpcParseErrorType,
  ParsedCoolpcProduct,
  SourceCategoryContext,
} from "../parser";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  createParsedResultHash,
  type RawSnapshotContentStatusValue,
} from "../raw-snapshot-writer";
import type { CoolpcCategorySnapshotWriteClient } from "../category-snapshot";

const PRISMA_PARSE_ERROR_TYPES = {
  missing_ibuy_token: "MISSING_IBUY_TOKEN",
  missing_name: "MISSING_NAME",
  invalid_image_url: "INVALID_IMAGE_URL",
  price_parse_failed: "PRICE_PARSE_FAILED",
  duplicate_source_identity: "DUPLICATE_SOURCE_IDENTITY",
  content_validation_failed: "CONTENT_VALIDATION_FAILED",
} as const satisfies Record<CoolpcParseErrorType, PrismaParseErrorType>;

export function createCategoryContext(
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

export function toRawSnapshotContentStatus(
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

export function createStableParsedResultHash(items: ParsedCoolpcProduct[]): string {
  // The change detector should react to product identity/name/price changes,
  // not crawl time, source URL defaults, or parser-only bookkeeping fields.
  return createParsedResultHash(
    items.map((item) => ({
      sourceItemKey: item.sourceItemKey,
      name: item.name,
      normalizedName: item.normalizedName,
      primaryImageUrl: item.primaryImageUrl,
      price: item.price,
      currency: item.currency,
    })),
  );
}

export async function findLatestSuccessfulParsedResultHash(
  client: CoolpcCategorySnapshotWriteClient,
  sourceCategoryId: string,
): Promise<string | null> {
  const [latestSnapshot] = await client.rawSnapshot.findMany({
    where: {
      sourceCategoryId,
      contentStatus: RAW_SNAPSHOT_CONTENT_STATUSES.VALID,
      parsedResultHash: { not: null },
      categoryResults: {
        some: {
          status: {
            in: [
              CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
              CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
            ],
          },
        },
      },
    },
    orderBy: { fetchedAt: "desc" },
    take: 1,
    select: { parsedResultHash: true },
  });

  return latestSnapshot?.parsedResultHash ?? null;
}

export async function recordParseIssues({
  client,
  crawlRunId,
  rawSnapshotId,
  sourceCategoryId,
  issues,
}: {
  client: CoolpcCategorySnapshotWriteClient;
  crawlRunId: string;
  rawSnapshotId: string;
  sourceCategoryId: string;
  issues: CoolpcParseIssue[];
}): Promise<void> {
  if (issues.length === 0) {
    return;
  }

  await client.parseError.createMany({
    data: issues.map((issue) => ({
      crawlRunId,
      rawSnapshotId,
      sourceCategoryId,
      errorType: PRISMA_PARSE_ERROR_TYPES[issue.type],
      message: issue.message,
      rawName: issue.rawName ?? null,
      rawPriceText: issue.rawPriceText ?? null,
      rawToken: issue.rawToken ?? null,
      rawImageUrl: issue.type === "invalid_image_url" ? (issue.rawImageUrl ?? null) : null,
    })),
  });
}

export function buildParseFailureMessage(parseResult: CoolpcParseResult): string {
  if (parseResult.validation.status !== "valid") {
    return parseResult.validation.reason ?? "content validation failed";
  }

  return (
    parseResult.issues.find((issue) => issue.type === "duplicate_source_identity")?.message ??
    parseResult.issues[0]?.message ??
    "parsed category result cannot be imported"
  );
}
