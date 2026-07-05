// apps/crawler/src/coolpc/category-snapshot/parse-result.ts
// 負責 category-snapshot 解析結果的輔助邏輯。
// 包含 context 組裝、驗證狀態轉換、hash 比對與 parse issue 的持久化。

import type { ParseErrorType as PrismaParseErrorType } from "@partsradar/db";
import { COOLPC_TARGET_CATEGORIES, type CoolpcTargetCategory } from "../categories";
import { CRAWL_RUN_CATEGORY_RESULT_STATUSES, type CrawlRunSourceCategory } from "../crawl-run";
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

/**
 * 將資料庫中的分類資訊，補齊 parser 需要的 context，
 * 並把 static 的預期標題關鍵字補進來，供驗證時使用。
 */
export function createCategoryContext(
  category: CrawlRunSourceCategory,
  fetchedAt: Date,
  sourceCategoryUrl: string,
): SourceCategoryContext {
  const targetCategory: CoolpcTargetCategory | undefined = COOLPC_TARGET_CATEGORIES.find(
    (candidate) => candidate.igrp === category.igrp,
  );

  return {
    sourceCategoryId: category.id,
    igrp: category.igrp,
    sourceName: category.sourceName,
    displayName: category.displayName,
    fetchedAt,
    sourceCategoryUrl,
    expectedTitleKeywords: targetCategory?.expectedTitleKeywords
      ? [...targetCategory.expectedTitleKeywords]
      : undefined,
  };
}

/** 將 parser 的驗證結果映射到 raw snapshot 可落庫的狀態。 */
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

/**
 * 只用會影響內容變更判斷的欄位計算 hash；
 * 避免把抓取時間、原始欄位雜訊算進比較，導致 false positive 變更。
 */
export function createStableParsedResultHash(items: ParsedCoolpcProduct[]): string {
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

/**
 * 取出同一分類最近一筆「有效且成功」的解析結果 hash，
 * 供本次結果做 SUCCESS_CHANGED / SUCCESS_UNCHANGED 判定。
 */
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

/**
 * 將 parser 回報的問題轉為持久化 parse_error 記錄，
 * 供後續排查與監控使用。
 */
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

/**
 * 建立統一的 parse 失敗訊息：
 * 優先回傳 validation 原因，其次回傳重複身分鍵訊息，再退回到第一筆 issue。
 */
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
