import type { ParseErrorType as PrismaParseErrorType, PrismaClient } from "@partsradar/db";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "./categories";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  type CrawlRunSourceCategory,
  type ProcessCrawlCategoryResult,
} from "./crawl-run";
import {
  createCoolpcCategoryUrl,
  parseCoolpcCategoryPage,
  type CoolpcParseIssue,
  type ContentValidationStatus,
  type ParseErrorType as CoolpcParseErrorType,
  type ParsedCoolpcProduct,
  type SourceCategoryContext,
} from "./parser";
import {
  writeCoolpcProductPrices,
  type CoolpcProductWriteClient,
  type WriteCoolpcProductPricesResult,
} from "./product-write";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  createParsedResultHash,
  recordRawSnapshot,
  type RawSnapshotContentStatusValue,
  type RawSnapshotWriteClient,
} from "./raw-snapshot";

// This module is the handoff point between raw CoolPC fetches and crawl-run
// category results. It records evidence first, then lets changed valid parses
// flow into the product/price writer.
export interface CoolpcCategorySnapshotInput {
  url?: string;
  fetchedAt: Date;
  httpStatus?: number | null;
  rawHtml?: string | null;
  fetchError?: string | null;
}

interface ProcessCoolpcCategorySnapshotBaseOptions {
  storageDir: string;
  crawlRunId: string;
  category: CrawlRunSourceCategory;
  snapshot: CoolpcCategorySnapshotInput;
}

export type ProcessCoolpcCategorySnapshotOptions =
  | (ProcessCoolpcCategorySnapshotBaseOptions & {
      client: CoolpcCategorySnapshotWriteClient & CoolpcProductWriteClient;
      writeProducts?: undefined;
    })
  | (ProcessCoolpcCategorySnapshotBaseOptions & {
      client: CoolpcCategorySnapshotWriteClient;
      writeProducts: WriteCoolpcCategoryProducts;
    });

export interface CoolpcCategorySnapshotWriteClient extends RawSnapshotWriteClient {
  parseError: {
    createMany(args: { data: ParseErrorCreateManyData[] }): Promise<{ count: number }>;
  };
  rawSnapshot: RawSnapshotWriteClient["rawSnapshot"] & {
    findMany(args: {
      where: {
        sourceCategoryId: string;
        contentStatus: typeof RAW_SNAPSHOT_CONTENT_STATUSES.VALID;
        parsedResultHash: { not: null };
        categoryResults: {
          some: {
            status: {
              in: Array<
                | typeof CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED
                | typeof CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
              >;
            };
          };
        };
      };
      orderBy: { fetchedAt: "desc" };
      take: 1;
      select: { parsedResultHash: true };
    }): Promise<Array<{ parsedResultHash: string | null }>>;
  };
}

interface ParseErrorCreateManyData {
  crawlRunId: string;
  rawSnapshotId: string | null;
  sourceCategoryId: string;
  errorType: PrismaParseErrorType;
  message: string;
  rawName: string | null;
  rawPriceText: string | null;
  rawToken: string | null;
  rawImageUrl: string | null;
}

export type WriteCoolpcCategoryProducts = (options: {
  crawlRunId: string;
  rawSnapshotId: string;
  sourceCategoryId: string;
  fetchedAt: Date;
  items: ParsedCoolpcProduct[];
}) => Promise<WriteCoolpcProductPricesResult>;

export type PrismaCoolpcCategorySnapshotClient = Pick<
  PrismaClient,
  "rawSnapshot" | "parseError" | "product" | "priceSnapshot" | "currentPrice" | "$transaction"
>;

const PRISMA_PARSE_ERROR_TYPES = {
  missing_ibuy_token: "MISSING_IBUY_TOKEN",
  missing_name: "MISSING_NAME",
  invalid_image_url: "INVALID_IMAGE_URL",
  price_parse_failed: "PRICE_PARSE_FAILED",
  duplicate_source_identity: "DUPLICATE_SOURCE_IDENTITY",
  content_validation_failed: "CONTENT_VALIDATION_FAILED",
} as const satisfies Record<CoolpcParseErrorType, PrismaParseErrorType>;

export function processCoolpcCategorySnapshotWithPrisma(
  options: ProcessCoolpcCategorySnapshotBaseOptions & {
    client: PrismaCoolpcCategorySnapshotClient;
  },
): Promise<ProcessCrawlCategoryResult> {
  // Keep the processor testable with a narrow write client while exposing a
  // Prisma-typed entry point for the real crawler wiring.
  return processCoolpcCategorySnapshot(options);
}

export async function processCoolpcCategorySnapshot(
  options: ProcessCoolpcCategorySnapshotOptions,
): Promise<ProcessCrawlCategoryResult> {
  const { client, storageDir, crawlRunId, category, snapshot } = options;
  const productWriter = options.writeProducts
    ? options.writeProducts
    : createDefaultProductWriter(options.client);
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
  const parsedResultHash =
    parseResult.validation.status === "valid"
      ? createStableParsedResultHash(parseResult.items)
      : null;
  const latestParsedResultHash = parsedResultHash
    ? await findLatestSuccessfulParsedResultHash(client, category.id)
    : null;
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
    parsedResultHash,
  });
  await recordParseIssues({
    client,
    crawlRunId,
    rawSnapshotId: rawSnapshot.id,
    sourceCategoryId: category.id,
    issues: parseResult.issues,
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
  // flow into product/price writes.
  if (parseResult.validation.status === "invalid" || !parseResult.canImport) {
    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
      rawSnapshotId: rawSnapshot.id,
      errorMessage: buildParseFailureMessage(parseResult),
    };
  }

  // Every successful parse reaches the product writer. It avoids duplicate
  // price snapshots itself, while unchanged crawls still refresh last_seen_at
  // and advance missing counters for products absent from the parsed list.
  await productWriter({
    crawlRunId,
    rawSnapshotId: rawSnapshot.id,
    sourceCategoryId: category.id,
    fetchedAt: snapshot.fetchedAt,
    items: parseResult.items,
  });

  return {
    status:
      latestParsedResultHash === parsedResultHash
        ? CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
        : CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
    rawSnapshotId: rawSnapshot.id,
  };
}

function createDefaultProductWriter(
  client: CoolpcCategorySnapshotWriteClient & CoolpcProductWriteClient,
): WriteCoolpcCategoryProducts {
  return (options) =>
    writeCoolpcProductPrices({
      client,
      ...options,
    });
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
      primaryImageUrl: item.primaryImageUrl,
      price: item.price,
      currency: item.currency,
    })),
  );
}

async function findLatestSuccessfulParsedResultHash(
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

async function recordParseIssues({
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

function buildParseFailureMessage(parseResult: ReturnType<typeof parseCoolpcCategoryPage>): string {
  if (parseResult.validation.status !== "valid") {
    return parseResult.validation.reason ?? "content validation failed";
  }

  return (
    parseResult.issues.find((issue) => issue.type === "duplicate_source_identity")?.message ??
    parseResult.issues[0]?.message ??
    "parsed category result cannot be imported"
  );
}
