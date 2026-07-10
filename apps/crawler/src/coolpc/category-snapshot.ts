// apps/crawler/src/coolpc/category-snapshot.ts
// 處理 CoolPC 分類頁抓取結果與 crawl run 的銜接：
// 先落 raw snapshot，成功解析後再交給分類商品觀測寫入流程。

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
  writeCoolpcCategoryProductObservation,
  type CoolpcProductWriteClient,
  type WriteCoolpcCategoryProductObservationResult,
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

export interface CoolpcCategorySnapshotInput {
  url?: string;
  fetchedAt: Date;
  httpStatus?: number | null;
  rawHtml?: string | null;
  fetchError?: string | null;
}

interface ProcessCoolpcCategorySnapshotBaseOptions {
  storageDir: string;
  storagePathPrefix?: string;
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
      writeProducts: WriteCoolpcCategoryProductObservation;
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

export type WriteCoolpcCategoryProductObservation = (options: {
  crawlRunId: string;
  rawSnapshotId: string;
  sourceCategoryId: string;
  fetchedAt: Date;
  parsedProducts: ParsedCoolpcProduct[];
}) => Promise<WriteCoolpcCategoryProductObservationResult>;

export type PrismaCoolpcCategorySnapshotClient = Pick<
  PrismaClient,
  "rawSnapshot" | "parseError" | "product" | "priceSnapshot" | "currentPrice" | "$transaction"
>;

/**
 * 以 Prisma client 進入點呼叫共用流程，讓測試時可注入較窄 client。
 */
export function processCoolpcCategorySnapshotWithPrisma(
  options: ProcessCoolpcCategorySnapshotBaseOptions & {
    client: PrismaCoolpcCategorySnapshotClient;
  },
): Promise<ProcessCrawlCategoryResult> {
  return processCoolpcCategorySnapshot(options);
}

/**
 * 落 raw snapshot 並依 parser 結果決定 crawl run 分類結果狀態。
 * 僅當內容可匯入時，才進入分類商品觀測寫入流程，避免污染資料。
 */
export async function processCoolpcCategorySnapshot(
  options: ProcessCoolpcCategorySnapshotOptions,
): Promise<ProcessCrawlCategoryResult> {
  const { client, storageDir, storagePathPrefix, crawlRunId, category, snapshot } = options;
  const productWriter = options.writeProducts
    ? options.writeProducts
    : createDefaultProductWriter(options.client);
  const url = snapshot.url ?? createCoolpcCategoryUrl(category.igrp);
  const fetchError = snapshot.fetchError ?? null;

  if (fetchError || !snapshot.rawHtml) {
    const rawSnapshot = await recordRawSnapshot({
      client,
      storageDir,
      storagePathPrefix,
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
  const rawSnapshot = await recordRawSnapshot({
    client,
    storageDir,
    storagePathPrefix,
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

  if (parseResult.validation.status === "suspected_block") {
    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK,
      rawSnapshotId: rawSnapshot.id,
      errorMessage: parseResult.validation.reason ?? "suspected block content",
    };
  }

  if (parseResult.validation.status === "invalid" || !parseResult.canImport) {
    return {
      status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
      rawSnapshotId: rawSnapshot.id,
      errorMessage: buildParseFailureMessage(parseResult),
    };
  }

  const productWriteSummary = await productWriter({
    crawlRunId,
    rawSnapshotId: rawSnapshot.id,
    sourceCategoryId: category.id,
    fetchedAt: snapshot.fetchedAt,
    parsedProducts: parseResult.items,
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
): WriteCoolpcCategoryProductObservation {
  return (options) =>
    writeCoolpcCategoryProductObservation({
      client,
      ...options,
    });
}
