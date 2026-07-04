// apps/crawler/src/coolpc/category-snapshot.ts
import type { ParseErrorType as PrismaParseErrorType, PrismaClient } from "@partsradar/db";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  type CrawlRunSourceCategory,
  type ProcessCrawlCategoryResult,
} from "./crawl-run";
import {
  createCoolpcCategoryUrl,
  parseCoolpcCategoryPage,
  type ParsedCoolpcProduct,
} from "./parser";
import {
  writeCoolpcProductPrices,
  type CoolpcProductWriteClient,
  type WriteCoolpcProductPricesResult,
} from "./product-write";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  recordRawSnapshot,
  type RawSnapshotWriteClient,
} from "./raw-snapshot-writer";
import {
  buildParseFailureMessage,
  createCategoryContext,
  createStableParsedResultHash,
  findLatestSuccessfulParsedResultHash,
  recordParseIssues,
  toRawSnapshotContentStatus,
} from "./category-snapshot/parse-result";

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
  const productWriteSummary = await productWriter({
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
    productWriteSummary,
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
