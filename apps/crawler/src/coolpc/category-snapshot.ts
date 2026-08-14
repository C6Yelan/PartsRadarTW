// apps/crawler/src/coolpc/category-snapshot.ts
// 處理 CoolPC 分類頁抓取結果與 crawl run 的銜接：
// 先落 raw snapshot，成功解析後再交給分類商品觀測寫入流程。

import { createCoolpcCategoryUrl } from "@partsradar/shared";
import {
  buildParseFailureMessage,
  type CoolpcLatestSuccessfulSnapshotReadClient,
  type CoolpcParseIssueWriteClient,
  createCategoryContext,
  createStableParsedResultHash,
  findLatestSuccessfulParsedResultHash,
  recordParseIssues,
  toRawSnapshotContentStatus,
} from "./category-snapshot/parse-result";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  type CrawlRunSourceCategory,
  type ProcessCrawlCategoryResult,
} from "./crawl-run";
import { normalizeFilterSyncProductName } from "./filter-sync/parser";
import {
  type ExcludedCoolpcProduct,
  type ParsedCoolpcProduct,
  parseCoolpcCategoryPage,
} from "./parser";
import {
  type CoolpcProductWriteClient,
  type WriteCoolpcCategoryProductObservationResult,
  writeCoolpcCategoryProductObservation,
} from "./product-write";
import {
  RAW_SNAPSHOT_CONTENT_STATUSES,
  type RawSnapshotWriteClient,
  recordRawSnapshot,
} from "./raw-snapshot-writer";

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
  sourceFilterTagsByProductName?: Readonly<Record<string, readonly string[]>>;
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

export interface CoolpcCategorySnapshotWriteClient
  extends RawSnapshotWriteClient,
    CoolpcParseIssueWriteClient {
  rawSnapshot: RawSnapshotWriteClient["rawSnapshot"] &
    CoolpcLatestSuccessfulSnapshotReadClient["rawSnapshot"];
}

export type WriteCoolpcCategoryProductObservation = (options: {
  crawlRunId: string;
  rawSnapshotId: string;
  sourceCategoryId: string;
  fetchedAt: Date;
  parsedProducts: ParsedCoolpcProduct[];
  excludedProducts?: readonly ExcludedCoolpcProduct[];
}) => Promise<WriteCoolpcCategoryProductObservationResult>;

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

  const context = createCategoryContext(
    category,
    snapshot.fetchedAt,
    url,
    options.sourceFilterTagsByProductName,
  );
  let parseResult = parseCoolpcCategoryPage(snapshot.rawHtml, context);
  const sourceTags = options.sourceFilterTagsByProductName;
  const sourceTagJoinCoverage = getSourceTagJoinCoverage(parseResult.items, sourceTags);
  let degradedFilterSyncJoinCoverage: { matchedCount: number; totalCount: number } | null = null;
  if (sourceTagJoinCoverage && sourceTagJoinCoverage.ratio < 0.5) {
    parseResult = parseCoolpcCategoryPage(
      snapshot.rawHtml,
      createCategoryContext(category, snapshot.fetchedAt, url),
    );
    degradedFilterSyncJoinCoverage = {
      matchedCount: sourceTagJoinCoverage.matchedCount,
      totalCount: sourceTagJoinCoverage.totalCount,
    };
  }
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
    excludedProducts: parseResult.excludedProducts,
  });

  return {
    status:
      latestParsedResultHash === parsedResultHash
        ? CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
        : CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
    rawSnapshotId: rawSnapshot.id,
    productWriteSummary,
    ...(degradedFilterSyncJoinCoverage
      ? { filterSyncJoinCoverage: degradedFilterSyncJoinCoverage }
      : {}),
  };
}

function getSourceTagJoinCoverage(
  items: readonly ParsedCoolpcProduct[],
  sourceTags: Readonly<Record<string, readonly string[]>> | undefined,
): { matchedCount: number; totalCount: number; ratio: number } | null {
  if (!sourceTags || Object.keys(sourceTags).length === 0 || items.length === 0) {
    return null;
  }

  const sourceProductNames = Object.keys(sourceTags);
  const categoryProductNames = new Set(
    items.map((item) => normalizeFilterSyncProductName(item.name)),
  );
  const matchedCount = sourceProductNames.filter((name) => categoryProductNames.has(name)).length;
  return {
    matchedCount,
    totalCount: sourceProductNames.length,
    ratio: matchedCount / sourceProductNames.length,
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
