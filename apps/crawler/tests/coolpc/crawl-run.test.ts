// apps/crawler/tests/coolpc/crawl-run.test.ts
// 驗證 CoolPC crawl run 會依分類順序寫入結果、彙總狀態，並處理阻斷與錯誤分支。

import { describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_INTERRUPTED_RECONCILED_MARKER,
  CRAWL_RUN_LIFECYCLE_FAILURE_MARKER,
  CRAWL_RUN_STATUSES,
  CRAWL_TRIGGER_TYPES,
  type CrawlRunCategoryResultStatusValue,
  type CrawlRunSourceCategory,
  type CrawlRunStatusValue,
  type CrawlRunWriteClient,
  type InterruptedCrawlRunReconciliationClient,
  reconcileInterruptedCrawlRuns,
  runCoolpcCrawlOnce,
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
        ...(sourceCategory.igrp === 4 ? { deduplicatedItemCount: 2 } : {}),
      }),
    });

    expect(result).toMatchObject({
      crawlRunId: "crawl-run-1",
      status: CRAWL_RUN_STATUSES.SUCCESS_CHANGED,
      stoppedBySuspectedBlock: false,
    });
    expect(result.categoryResults.map((categoryResult) => categoryResult.igrp)).toEqual([4, 12]);
    expect(result.categoryResults[0]?.deduplicatedItemCount).toBe(2);
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

  it("finalizes the crawl run when category-result persistence fails", async () => {
    const client = new FakeCrawlRunWriteClient([
      category({ id: "category-4", igrp: 4, displayName: "CPU" }),
    ]);
    const lifecycleError = new Error("provider response and database details must stay private");
    client.crawlRunCategoryResult.create = async () => {
      throw lifecycleError;
    };

    const result = runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: async () => ({
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      }),
    });

    await expect(result).rejects.toBe(lifecycleError);
    expect(client.crawlRuns[0]).toMatchObject({
      status: CRAWL_RUN_STATUSES.FETCH_FAILED,
      finishedAt: fixedDate(),
      errorMessage: CRAWL_RUN_LIFECYCLE_FAILURE_MARKER,
    });
    expect(client.crawlRuns[0]?.errorMessage).not.toContain(lifecycleError.message);
  });

  it("preserves the lifecycle error when failure finalization also fails", async () => {
    const client = new FakeCrawlRunWriteClient([
      category({ id: "category-4", igrp: 4, displayName: "CPU" }),
    ]);
    const lifecycleError = new Error("category-result persistence failed");
    const finalizationError = new Error("crawl-run finalization failed");
    let finalizationAttempted = false;
    client.crawlRunCategoryResult.create = async () => {
      throw lifecycleError;
    };
    client.crawlRun.updateMany = async () => {
      finalizationAttempted = true;
      throw finalizationError;
    };

    const result = runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: async () => ({
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      }),
    });

    await expect(result).rejects.toBe(lifecycleError);
    expect(finalizationAttempted).toBe(true);
  });

  it("does not overwrite a terminal status when the terminal update response is lost", async () => {
    const client = new FakeCrawlRunWriteClient([
      category({ id: "category-4", igrp: 4, displayName: "CPU" }),
    ]);
    const terminalUpdateError = new Error("terminal update response was lost");
    const applyTerminalUpdate = client.crawlRun.update;
    client.crawlRun.update = async (args) => {
      await applyTerminalUpdate(args);
      throw terminalUpdateError;
    };

    const result = runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: async () => ({
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUCCESS_UNCHANGED,
      }),
    });

    await expect(result).rejects.toBe(terminalUpdateError);
    expect(client.crawlRuns[0]).toMatchObject({
      status: CRAWL_RUN_STATUSES.SUCCESS_UNCHANGED,
      finishedAt: fixedDate(),
      errorMessage: null,
    });
  });
});

describe("interrupted CoolPC crawl run reconciliation", () => {
  it("atomically reconciles only unfinished running rows and returns the updated count", async () => {
    const reconciliationTime = fixedDate();
    const previouslyFinishedAt = new Date("2026-05-27T09:30:00.000Z");
    const rows: ReconciliationRow[] = [
      {
        status: CRAWL_RUN_STATUSES.RUNNING,
        finishedAt: null,
        errorMessage: null,
      },
      {
        status: CRAWL_RUN_STATUSES.RUNNING,
        finishedAt: previouslyFinishedAt,
        errorMessage: null,
      },
      {
        status: CRAWL_RUN_STATUSES.SUCCESS_CHANGED,
        finishedAt: null,
        errorMessage: null,
      },
    ];
    let updateManyArgs: ReconciliationUpdateManyArgs | null = null;
    const client: InterruptedCrawlRunReconciliationClient = {
      crawlRun: {
        updateMany: async (args) => {
          updateManyArgs = args;
          let count = 0;

          for (const row of rows) {
            if (row.status !== args.where.status || row.finishedAt !== args.where.finishedAt) {
              continue;
            }

            row.status = args.data.status;
            row.finishedAt = args.data.finishedAt;
            row.errorMessage = args.data.errorMessage;
            count += 1;
          }

          return { count };
        },
      },
    };

    const count = await reconcileInterruptedCrawlRuns({
      client,
      now: () => reconciliationTime,
    });

    expect(count).toBe(1);
    expect(updateManyArgs).toEqual({
      where: {
        status: CRAWL_RUN_STATUSES.RUNNING,
        finishedAt: null,
      },
      data: {
        status: CRAWL_RUN_STATUSES.FETCH_FAILED,
        finishedAt: reconciliationTime,
        errorMessage: CRAWL_RUN_INTERRUPTED_RECONCILED_MARKER,
      },
    });
    expect(rows).toEqual([
      {
        status: CRAWL_RUN_STATUSES.FETCH_FAILED,
        finishedAt: reconciliationTime,
        errorMessage: CRAWL_RUN_INTERRUPTED_RECONCILED_MARKER,
      },
      {
        status: CRAWL_RUN_STATUSES.RUNNING,
        finishedAt: previouslyFinishedAt,
        errorMessage: null,
      },
      {
        status: CRAWL_RUN_STATUSES.SUCCESS_CHANGED,
        finishedAt: null,
        errorMessage: null,
      },
    ]);
  });
});

interface FakeCrawlRun {
  id: string;
  status: CrawlRunStatusValue;
  startedAt: Date;
  finishedAt: Date | null;
  triggerType: string;
  errorMessage: string | null;
}

interface ReconciliationRow {
  status: CrawlRunStatusValue;
  finishedAt: Date | null;
  errorMessage: string | null;
}

type ReconciliationUpdateManyArgs = Parameters<
  InterruptedCrawlRunReconciliationClient["crawlRun"]["updateMany"]
>[0];

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
        errorMessage: null,
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
      if ("errorMessage" in data) {
        crawlRun.errorMessage = data.errorMessage ?? null;
      }

      return { id: crawlRun.id, status: crawlRun.status };
    },
    updateMany: async ({
      where,
      data,
    }: Parameters<CrawlRunWriteClient["crawlRun"]["updateMany"]>[0]) => {
      const crawlRun = this.crawlRuns.find(
        (candidate) =>
          candidate.id === where.id &&
          candidate.status === where.status &&
          candidate.finishedAt === where.finishedAt,
      );

      if (!crawlRun) {
        return { count: 0 };
      }

      crawlRun.status = data.status;
      crawlRun.finishedAt = data.finishedAt;
      crawlRun.errorMessage = data.errorMessage;
      return { count: 1 };
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
