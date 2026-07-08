// apps/crawler/tests/coolpc/support/data-flow-records.ts
// 定義 data-flow fake client 使用的記憶體資料列型別。

import type {
  CrawlRunCategoryResultStatusValue,
  CrawlRunSourceCategory,
  CrawlRunStatusValue,
} from "../../../src/coolpc/crawl-run";
import type { RawSnapshotContentStatusValue } from "../../../src/coolpc/raw-snapshot-writer";

export interface FakeSourceCategory extends CrawlRunSourceCategory {
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
}

export interface FakeCrawlRun {
  id: string;
  status: CrawlRunStatusValue;
  startedAt: Date;
  finishedAt: Date | null;
  triggerType: string;
}

export interface FakeCategoryResult {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
}

export interface FakeSourceCategoryUpdate {
  sourceCategoryId: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  updatedLastSuccessAt: boolean;
}

export interface FakeRawSnapshot {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  url: string;
  fetchedAt: Date;
  httpStatus: number | null;
  fetchError: string | null;
  contentStatus: RawSnapshotContentStatusValue;
  contentHash: string | null;
  parsedResultHash: string | null;
  compressedHtmlPath: string | null;
  duplicateOfSnapshotId: string | null;
  createdAt: Date;
}

export interface FakeParseError {
  id: string;
  crawlRunId: string;
  rawSnapshotId: string | null;
  sourceCategoryId: string;
  errorType: string;
  message: string;
  rawName: string | null;
  rawPriceText: string | null;
  rawToken: string | null;
  rawImageUrl: string | null;
}
