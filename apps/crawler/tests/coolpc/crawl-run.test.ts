// apps/crawler/tests/coolpc/crawl-run.test.ts
// 驗證 CoolPC crawl run 會依分類順序寫入結果、彙總狀態，並處理阻斷與錯誤分支。

import { describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  runCoolpcCrawlOnce,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunSourceCategory,
  type CrawlRunStatusValue,
  type CrawlRunWriteClient,
} from "../../src/coolpc/crawl-run";

describe("CoolPC crawl run writer", () => {
  it("creates a crawl run and records category results in IGrp order", async () => {
    const client = new FakeCrawlRunWriteClient([
      category({ id: "category-12", igrp: 12, displayName: "顯示卡", enabled: true }),
      category({ id: "category-4", igrp: 4, displayName: "CPU", enabled: true }),
    ]);

    const result = await runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: async ({ category: sourceCategory }) => ({
        status:
          sourceCategory.igrp === 4
            ? CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
            : CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_CHANGED,
      }),
    });

    expect(result).toMatchObject({
      crawlRunId: "crawl-run-1",
      status: CRAWL_RUN_STATUSES.SUCCESS_CHANGED,
      stoppedBySuspectedBlock: false,
    });
    expect(result.categoryResults.map((categoryResult) => categoryResult.igrp)).toEqual([4, 12]);
    expect(client.crawlRuns[0]).toMatchObject({
      id: "crawl-run-1",
      status: CRAWL_RUN_STATUSES.SUCCESS_CHANGED,
      triggerType: CRAWL_TRIGGER_TYPES.MANUAL,
    });
    expect(client.categoryResults.map((categoryResult) => categoryResult.sourceCategoryId)).toEqual(
      ["category-4", "category-12"],
    );
    expect(client.sourceCategoryUpdates).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        lastCheckedAt: fixedDate(),
        lastSuccessAt: fixedDate(),
        updatedLastSuccessAt: true,
      }),
      expect.objectContaining({
        sourceCategoryId: "category-12",
        lastCheckedAt: fixedDate(),
        lastSuccessAt: fixedDate(),
        updatedLastSuccessAt: true,
      }),
    ]);
  });

  it("stops the current crawl run when a category reports suspected block", async () => {
    const client = new FakeCrawlRunWriteClient([
      category({ id: "category-4", igrp: 4, displayName: "CPU" }),
      category({ id: "category-5", igrp: 5, displayName: "主機板" }),
      category({ id: "category-6", igrp: 6, displayName: "記憶體" }),
    ]);

    const result = await runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: async ({ category: sourceCategory }) => ({
        status:
          sourceCategory.igrp === 5
            ? CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK
            : CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
        errorMessage: sourceCategory.igrp === 5 ? "HTTP 200 returned non-product content." : null,
      }),
    });

    expect(result.status).toBe(CRAWL_RUN_STATUSES.SUSPECTED_BLOCK);
    expect(result.stoppedBySuspectedBlock).toBe(true);
    expect(result.categoryResults.map((categoryResult) => categoryResult.igrp)).toEqual([4, 5]);
    expect(client.categoryResults).toHaveLength(2);
    expect(client.crawlRuns[0]?.status).toBe(CRAWL_RUN_STATUSES.SUSPECTED_BLOCK);
    expect(client.sourceCategoryUpdates).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        updatedLastSuccessAt: true,
      }),
      expect.objectContaining({
        sourceCategoryId: "category-5",
        updatedLastSuccessAt: false,
      }),
    ]);
  });

  it("marks a mixed success and failure run as success with errors", async () => {
    const client = new FakeCrawlRunWriteClient([
      category({ id: "category-4", igrp: 4, displayName: "CPU" }),
      category({ id: "category-5", igrp: 5, displayName: "主機板" }),
    ]);

    const result = await runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: async ({ category: sourceCategory }) => ({
        status:
          sourceCategory.igrp === 4
            ? CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED
            : CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED,
        rawSnapshotId: sourceCategory.igrp === 4 ? "snapshot-4" : null,
        errorMessage: sourceCategory.igrp === 5 ? "Fetch timed out." : null,
      }),
    });

    expect(result.status).toBe(CRAWL_RUN_STATUSES.SUCCESS_WITH_ERRORS);
    expect(result.categoryResults).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
        rawSnapshotId: "snapshot-4",
      }),
      expect.objectContaining({
        sourceCategoryId: "category-5",
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.FETCH_FAILED,
        errorMessage: "Fetch timed out.",
      }),
    ]);
    expect(client.sourceCategoryUpdates).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        updatedLastSuccessAt: true,
      }),
      expect.objectContaining({
        sourceCategoryId: "category-5",
        updatedLastSuccessAt: false,
      }),
    ]);
  });

  it("records an unexpected category processing error as parse failed", async () => {
    const client = new FakeCrawlRunWriteClient([
      category({ id: "category-4", igrp: 4, displayName: "CPU" }),
    ]);

    const result = await runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: async () => {
        throw new Error("Parser crashed.");
      },
    });

    expect(result.status).toBe(CRAWL_RUN_STATUSES.PARSE_FAILED);
    expect(result.categoryResults).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.PARSE_FAILED,
        errorMessage: "Parser crashed.",
      }),
    ]);
    expect(client.sourceCategoryUpdates).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        lastCheckedAt: fixedDate(),
        updatedLastSuccessAt: false,
      }),
    ]);
  });
});

interface FakeCrawlRun {
  id: string;
  status: CrawlRunStatusValue;
  startedAt: Date;
  finishedAt: Date | null;
  triggerType: string;
}

interface FakeCategoryResult {
  id: string;
  crawlRunId: string;
  sourceCategoryId: string;
  status: CrawlRunCategoryResultStatusValue;
  rawSnapshotId: string | null;
  errorMessage: string | null;
}

interface FakeSourceCategoryUpdate {
  sourceCategoryId: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  updatedLastSuccessAt: boolean;
}

class FakeCrawlRunWriteClient implements CrawlRunWriteClient {
  readonly crawlRuns: FakeCrawlRun[] = [];
  readonly categoryResults: FakeCategoryResult[] = [];
  readonly sourceCategoryUpdates: FakeSourceCategoryUpdate[] = [];

  constructor(private readonly categories: CrawlRunSourceCategory[]) {}

  sourceCategory = {
    findMany: async () =>
      [...this.categories]
        .filter((sourceCategory) => sourceCategory.enabled)
        .sort((left, right) => left.igrp - right.igrp),
    update: async ({
      where,
      data,
    }: Parameters<CrawlRunWriteClient["sourceCategory"]["update"]>[0]) => {
      this.sourceCategoryUpdates.push({
        sourceCategoryId: where.id,
        lastCheckedAt: data.lastCheckedAt,
        lastSuccessAt: data.lastSuccessAt,
        updatedLastSuccessAt: "lastSuccessAt" in data,
      });

      return { id: where.id };
    },
  };

  crawlRun = {
    create: async ({ data }: Parameters<CrawlRunWriteClient["crawlRun"]["create"]>[0]) => {
      const crawlRun: FakeCrawlRun = {
        id: `crawl-run-${this.crawlRuns.length + 1}`,
        status: data.status,
        startedAt: data.startedAt,
        finishedAt: null,
        triggerType: data.triggerType,
      };
      this.crawlRuns.push(crawlRun);

      return { id: crawlRun.id };
    },
    update: async ({ where, data }: Parameters<CrawlRunWriteClient["crawlRun"]["update"]>[0]) => {
      const crawlRun = this.crawlRuns.find((candidate) => candidate.id === where.id);

      if (!crawlRun) {
        throw new Error(`Unknown crawl run: ${where.id}`);
      }

      crawlRun.status = data.status;
      crawlRun.finishedAt = data.finishedAt;

      return { id: crawlRun.id, status: crawlRun.status };
    },
  };

  crawlRunCategoryResult = {
    create: async ({
      data,
    }: Parameters<CrawlRunWriteClient["crawlRunCategoryResult"]["create"]>[0]) => {
      const result: FakeCategoryResult = {
        id: `category-result-${this.categoryResults.length + 1}`,
        crawlRunId: data.crawlRunId,
        sourceCategoryId: data.sourceCategoryId,
        status: data.status,
        rawSnapshotId: data.rawSnapshotId ?? null,
        errorMessage: data.errorMessage ?? null,
      };
      this.categoryResults.push(result);

      return { id: result.id };
    },
  };
}

function category({
  id,
  igrp,
  displayName,
  enabled = true,
}: {
  id: string;
  igrp: number;
  displayName: string;
  enabled?: boolean;
}): CrawlRunSourceCategory {
  return {
    id,
    igrp,
    displayName,
    enabled,
    sourceName: displayName,
  };
}

function fixedClock(): () => Date {
  return fixedDate;
}

function fixedDate(): Date {
  return new Date("2026-05-27T10:30:00.000Z");
}
