// packages/db/tests/price-report/reader.integration.test.ts
// 以 disposable PostgreSQL 驗證 price report readers 的查詢、排序與篩選語意。

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFailed } from "vitest";
import {
  PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
  type PriceReportWorkBudgetExceededError,
  readCrawlRunPriceChangeSummary,
  readRecentPriceReport,
} from "../../src/price-report";
import { enforcePriceReportBoundedPlan } from "../../src/price-report/reader";
import type { PriceReportQueryClient } from "../../src/price-report/types";
import { collectPlanNodes, totalRowsExamined } from "../support/explain-plan";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!testDatabaseUrl || !migrationDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL and MIGRATION_DATABASE_URL are required for PostgreSQL integration tests.",
  );
}

const categoryIds = new Set<string>();
const productIds = new Set<string>();
const crawlRunIds = new Set<string>();
let nextIgrp = 1_000_000 + Math.floor(Math.random() * 1_000_000);
let client: PrismaClient;
let migrationClient: PrismaClient;
let pendingScaleTest: Promise<void> | undefined;
let cleanupPromise: Promise<void> | undefined;

beforeAll(() => {
  client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
  });
  migrationClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: migrationDatabaseUrl }),
  });
});

afterEach(async () => {
  // Vitest timeout rejects its wrapper without cancelling the database work.
  cleanupPromise ??= (async () => {
    await Promise.allSettled(pendingScaleTest ? [pendingScaleTest] : []);
    await client.priceSnapshot.deleteMany({ where: { productId: { in: [...productIds] } } });
    await client.product.deleteMany({ where: { id: { in: [...productIds] } } });
    await client.crawlRun.deleteMany({ where: { id: { in: [...crawlRunIds] } } });
    await client.sourceCategory.deleteMany({ where: { id: { in: [...categoryIds] } } });
    productIds.clear();
    crawlRunIds.clear();
    categoryIds.clear();
    if (pendingScaleTest) {
      // The scale fixture's single-product statistics must not leak into later FK checks.
      await migrationClient.$executeRaw`ANALYZE price_snapshots`;
      pendingScaleTest = undefined;
    }
  })().finally(() => {
    cleanupPromise = undefined;
  });
  await cleanupPromise;
});

afterAll(async () => {
  await cleanupPromise;
  await Promise.all([client.$disconnect(), migrationClient.$disconnect()]);
});

describe("price report readers PostgreSQL integration", () => {
  it("excludes disabled categories and excluded products from recent and crawl-run reports", async () => {
    const baselineRunId = await createCrawlRun("2030-01-01T00:00:00.000Z");
    const changedRunId = await createCrawlRun("2030-01-02T12:00:00.000Z");
    const enabledProductId = await createProductWithHistory({
      name: "Enabled integration GPU",
      baselineRunId,
      changedRunId,
    });
    await createProductWithHistory({
      name: "Disabled integration GPU",
      baselineRunId,
      changedRunId,
      categoryEnabled: false,
    });
    await createProductWithHistory({
      name: "Excluded integration GPU",
      baselineRunId,
      changedRunId,
      isExcluded: true,
    });
    const rawQueries: Prisma.Sql[] = [];
    const readerClient = {
      priceSnapshot: client.priceSnapshot,
      $transaction: <T>(callback: (transaction: PriceReportQueryClient) => Promise<T>) =>
        client.$transaction((transaction) =>
          callback({
            priceSnapshot: transaction.priceSnapshot,
            $executeRaw: transaction.$executeRaw.bind(transaction),
            $queryRaw: async <T>(query: Prisma.Sql) => {
              rawQueries.push(query);
              return transaction.$queryRaw<T>(query);
            },
          }),
        ),
    };

    const recent = await readRecentPriceReport(readerClient, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: { includeNewProducts: false },
    });
    const crawlRun = await readCrawlRunPriceChangeSummary(readerClient, changedRunId);

    expect(recent.priceChanges.map(({ productId }) => productId)).toEqual([enabledProductId]);
    expect(recent.newProducts).toEqual([]);
    expect(crawlRun.changes.map(({ productId }) => productId)).toEqual([enabledProductId]);
    expect(crawlRun.newProducts).toEqual([]);
    expect(crawlRun.snapshotCount).toBe(1);
    expect(rawQueries).toHaveLength(3);
    expect(rawQueries[0]?.sql).toContain("bounded_current_snapshots AS MATERIALIZED");
    for (const query of rawQueries.slice(1)) {
      expect(query.sql).toContain("JOIN LATERAL");
      expect(query.sql).toContain("LIMIT 1");
    }
    for (const query of rawQueries) {
      expect(query.sql).not.toContain(enabledProductId);
      expect(query.values.length).toBeGreaterThan(0);
    }
  });

  it("uses the latest baseline and latest in-window snapshot for one product", async () => {
    const productId = await createProduct({
      name: "Multi-snapshot integration GPU",
      categoryId: await createCategory(),
    });
    const oldestRunId = await createCrawlRun("2030-01-01T00:00:00.000Z");
    const baselineRunId = await createCrawlRun("2030-01-01T23:00:00.000Z");
    const firstWindowRunId = await createCrawlRun("2030-01-02T01:00:00.000Z");
    const latestWindowRunId = await createCrawlRun("2030-01-02T02:00:00.000Z");

    await createSnapshot(productId, oldestRunId, 12_000, "2030-01-01T00:00:00.000Z");
    await createSnapshot(productId, baselineRunId, 11_000, "2030-01-01T23:00:00.000Z");
    await createSnapshot(productId, firstWindowRunId, 10_000, "2030-01-02T01:00:00.000Z");
    await createSnapshot(productId, latestWindowRunId, 9_000, "2030-01-02T02:00:00.000Z");

    const report = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: { includeNewProducts: false },
    });

    expect(report.priceChanges).toEqual([
      expect.objectContaining({
        productId,
        previousPrice: 10_000,
        currentPrice: 9_000,
        changedAt: new Date("2030-01-02T02:00:00.000Z"),
        delta: -1_000,
      }),
    ]);
  });

  it("selects the latest pre-window baseline by capturedAt and id descending", async () => {
    const productId = await createProduct({
      name: "Baseline ordering integration GPU",
      categoryId: await createCategory(),
    });
    const olderRunId = await createCrawlRun("2030-01-01T20:00:00.000Z");
    const tiedBaselineRunId = await createCrawlRun("2030-01-01T23:00:00.000Z");
    const windowRunId = await createCrawlRun("2030-01-02T02:00:00.000Z");

    await createSnapshot(productId, olderRunId, 12_000, "2030-01-01T20:00:00.000Z");
    await createSnapshot(productId, tiedBaselineRunId, 11_000, "2030-01-01T23:00:00.000Z", {
      id: "30000000-0000-4000-8000-000000000001",
    });
    await createSnapshot(productId, tiedBaselineRunId, 10_500, "2030-01-01T23:00:00.000Z", {
      id: "30000000-0000-4000-8000-000000000002",
    });
    await createSnapshot(productId, windowRunId, 9_000, "2030-01-02T02:00:00.000Z");

    const report = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: { includeNewProducts: false },
    });

    expect(report.priceChanges).toEqual([
      expect.objectContaining({
        productId,
        previousPrice: 10_500,
        currentPrice: 9_000,
        delta: -1_500,
      }),
    ]);
  });

  it("applies keyword token groups and category filters with PostgreSQL semantics", async () => {
    const baselineRunId = await createCrawlRun("2030-01-01T00:00:00.000Z");
    const changedRunId = await createCrawlRun("2030-01-02T12:00:00.000Z");
    const gpuIgrp = nextCategoryIgrp();
    const memoryIgrp = nextCategoryIgrp();
    const gpuCategoryId = await createCategory({ igrp: gpuIgrp });
    const memoryCategoryId = await createCategory({ igrp: memoryIgrp });
    const rtx5090Id = await createProductWithHistory({
      name: "華碩 ROG RTX 5090 測試卡",
      categoryId: gpuCategoryId,
      baselineRunId,
      changedRunId,
    });
    await createProductWithHistory({
      name: "微星 RTX 5080 測試卡",
      categoryId: gpuCategoryId,
      baselineRunId,
      changedRunId,
    });
    const ddr5Id = await createProductWithHistory({
      name: "芝奇 DDR5 6400 記憶體",
      categoryId: memoryCategoryId,
      baselineRunId,
      changedRunId,
    });

    const keywordReport = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: {
        categoryIgrps: [gpuIgrp, memoryIgrp],
        productKeyword: "rtx 5090, ddr5",
        includeNewProducts: false,
      },
    });
    const gpuOnlyReport = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: {
        categoryIgrps: [gpuIgrp],
        productKeyword: "rtx 5090, ddr5",
        includeNewProducts: false,
      },
    });

    expect(keywordReport.priceChanges.map(({ productId }) => productId).sort()).toEqual(
      [rtx5090Id, ddr5Id].sort(),
    );
    expect(gpuOnlyReport.priceChanges.map(({ productId }) => productId)).toEqual([rtx5090Id]);
  });

  it("fails closed at budget plus one with the real PostgreSQL query", ({ signal }) => {
    pendingScaleTest = (async () => {
      const categoryId = await createCategory();
      const productId = await createProduct({
        name: "Budget overflow integration GPU",
        categoryId,
      });
      const crawlRunId = await createCrawlRun("2030-01-02T02:00:00.000Z");
      const historicalRunId = await createCrawlRun("2029-01-01T00:00:00.000Z");
      await client.$transaction(async (transaction) => {
        await transaction.$executeRaw`
        INSERT INTO price_snapshots (id, product_id, price, captured_at, crawl_run_id)
        SELECT gen_random_uuid(), ${productId}::uuid, 10000 + sequence_number,
          ${new Date(1_893_542_400_000)}::timestamptz + sequence_number * interval '1 millisecond',
          ${crawlRunId}::uuid
        FROM generate_series(0, ${PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT}::integer) AS sequence_number
      `;
        await transaction.$executeRaw`
        INSERT INTO price_snapshots (id, product_id, price, captured_at, crawl_run_id)
        SELECT gen_random_uuid(), ${productId}::uuid, 8000 + sequence_number,
          ${new Date(1_735_689_600_000)}::timestamptz + sequence_number * interval '1 millisecond',
          ${historicalRunId}::uuid
        FROM generate_series(0, 16383) AS sequence_number
      `;
      });
      signal.throwIfAborted();
      await migrationClient.$executeRaw`ANALYZE price_snapshots`;

      const plans: Record<string, unknown> = {};
      onTestFailed(() => console.error("Price report EXPLAIN plans:", JSON.stringify(plans)));
      const { plan, crawlRunPlan, predecessorPlan } = await client.$transaction(
        async (transaction) => {
          await enforcePriceReportBoundedPlan(transaction);
          const plan = await transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON)
      WITH bounded_current_snapshots AS MATERIALIZED (
        SELECT snapshot.id, snapshot.product_id, snapshot.price, snapshot.currency, snapshot.captured_at
        FROM price_snapshots AS snapshot
        WHERE snapshot.captured_at >= ${new Date("2030-01-02T00:00:00.000Z")}
          AND snapshot.captured_at <= ${new Date("2030-01-03T00:00:00.000Z")}
        ORDER BY snapshot.captured_at ASC, snapshot.id ASC
        LIMIT ${PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1}
      )
      SELECT snapshot.id
      FROM bounded_current_snapshots AS snapshot
      JOIN products AS product ON product.id = snapshot.product_id
      JOIN source_categories AS category ON category.id = product.source_category_id
      ORDER BY snapshot.captured_at ASC, snapshot.id ASC
    `;
          plans.recent = plan;
          const crawlRunPlan = await transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON)
      SELECT snapshot.id
      FROM price_snapshots AS snapshot
      WHERE snapshot.crawl_run_id = ${crawlRunId}::uuid
      ORDER BY snapshot.captured_at ASC, snapshot.id ASC
      LIMIT ${PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1}
    `;
          plans.crawlRun = crawlRunPlan;
          const predecessorPlan = await transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON)
      SELECT snapshot.id
      FROM price_snapshots AS snapshot
      WHERE snapshot.product_id = ${productId}::uuid
        AND snapshot.captured_at < ${new Date("2030-01-03T00:00:00.000Z")}
      ORDER BY snapshot.captured_at DESC, snapshot.id DESC
      LIMIT 1
    `;
          plans.predecessor = predecessorPlan;
          return { plan, crawlRunPlan, predecessorPlan };
        },
      );
      await expect(
        readRecentPriceReport(client, {
          since: new Date("2030-01-02T00:00:00.000Z"),
          until: new Date("2030-01-03T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({
        name: "PriceReportWorkBudgetExceededError",
        scope: "recent_current",
        limit: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT,
        observedRows: PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
      } satisfies Partial<PriceReportWorkBudgetExceededError>);
      expect(
        collectPlanNodes(plan).find((node) => node["CTE Name"] === "bounded_current_snapshots"),
      ).toMatchObject({
        "Actual Rows": PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
        "Actual Loops": 1,
      });
      for (const currentPlan of [plan, crawlRunPlan]) {
        const nodes = collectPlanNodes(currentPlan);
        const snapshotScans = nodes.filter((node) => node["Relation Name"] === "price_snapshots");
        expect(snapshotScans).toHaveLength(1);
        expect(totalRowsExamined(snapshotScans[0])).toBe(PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1);
        for (const node of nodes.filter((node) =>
          ["Sort", "Hash", "CTE Scan"].includes(node["Node Type"]),
        )) {
          expect(totalRowsExamined(node)).toBeLessThanOrEqual(
            PRICE_REPORT_CURRENT_SNAPSHOT_LIMIT + 1,
          );
        }
      }
      const predecessorScans = collectPlanNodes(predecessorPlan).filter(
        (node) => node["Relation Name"] === "price_snapshots",
      );
      expect(predecessorScans).toHaveLength(1);
      expect(totalRowsExamined(predecessorScans[0])).toBe(1);
    })();
    return pendingScaleTest;
  });

  it("keeps the bounded planner policy local to the report transaction", async () => {
    const readSettings = () => client.$queryRaw<Array<Record<string, string>>>`
      SELECT current_setting('enable_seqscan') AS sequential,
        current_setting('enable_bitmapscan') AS bitmap,
        current_setting('enable_indexscan') AS index,
        current_setting('enable_indexonlyscan') AS index_only
    `;
    const before = await readSettings();
    const inside = await client.$transaction(async (transaction) => {
      await enforcePriceReportBoundedPlan(transaction);
      return transaction.$queryRaw<Array<Record<string, string>>>`
        SELECT current_setting('enable_seqscan') AS sequential,
          current_setting('enable_bitmapscan') AS bitmap,
          current_setting('enable_indexscan') AS index,
          current_setting('enable_indexonlyscan') AS index_only
      `;
    });
    expect(inside).toEqual([{ sequential: "off", bitmap: "off", index: "on", index_only: "on" }]);
    expect(await readSettings()).toEqual(before);
  });

  it("installs only the indexes proven by the final bounded query plans", async () => {
    const indexes = await client.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'price_snapshots_captured_at_id_idx',
          'price_snapshots_crawl_run_id_captured_at_id_idx',
          'price_snapshots_product_id_captured_at_id_idx'
        )
      ORDER BY indexname
    `;

    expect(indexes).toEqual([
      expect.objectContaining({
        indexname: "price_snapshots_captured_at_id_idx",
        indexdef: expect.stringContaining("(captured_at, id)"),
      }),
      expect.objectContaining({
        indexname: "price_snapshots_crawl_run_id_captured_at_id_idx",
        indexdef: expect.stringContaining("(crawl_run_id, captured_at, id)"),
      }),
      expect.objectContaining({
        indexname: "price_snapshots_product_id_captured_at_id_idx",
        indexdef: expect.stringContaining("(product_id, captured_at DESC, id DESC)"),
      }),
    ]);
  });
});

async function createProductWithHistory({
  name,
  baselineRunId,
  changedRunId,
  categoryEnabled = true,
  categoryIgrp = nextCategoryIgrp(),
  categoryId,
  isExcluded = false,
}: {
  name: string;
  baselineRunId: string;
  changedRunId: string;
  categoryEnabled?: boolean;
  categoryIgrp?: number;
  categoryId?: string;
  isExcluded?: boolean;
}) {
  const resolvedCategoryId =
    categoryId ?? (await createCategory({ enabled: categoryEnabled, igrp: categoryIgrp }));
  const productId = await createProduct({ name, categoryId: resolvedCategoryId, isExcluded });
  await createSnapshot(productId, baselineRunId, 10_000, "2030-01-01T00:00:00.000Z");
  await createSnapshot(productId, changedRunId, 9_000, "2030-01-02T12:00:00.000Z");
  return productId;
}

async function createCategory({
  enabled = true,
  igrp = nextCategoryIgrp(),
}: {
  enabled?: boolean;
  igrp?: number;
} = {}) {
  const id = randomUUID();
  categoryIds.add(id);
  await client.sourceCategory.create({
    data: {
      id,
      igrp,
      sourceName: `Integration category ${igrp}`,
      displayName: `Integration category ${igrp}`,
      enabled,
    },
  });
  return id;
}

async function createProduct({
  name,
  categoryId,
  isExcluded = false,
}: {
  name: string;
  categoryId: string;
  isExcluded?: boolean;
}) {
  const id = randomUUID();
  productIds.add(id);
  await client.product.create({
    data: {
      id,
      sourceCategoryId: categoryId,
      ibuyToken: `integration-${id}`,
      name,
      normalizedName: name.toLocaleLowerCase(),
      sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=12",
      isExcluded,
      firstSeenAt: new Date("2030-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2030-01-02T12:00:00.000Z"),
    },
  });
  return id;
}

async function createCrawlRun(at: string) {
  const id = randomUUID();
  crawlRunIds.add(id);
  await client.crawlRun.create({
    data: {
      id,
      status: "SUCCESS_CHANGED",
      triggerType: "MANUAL",
      startedAt: new Date(at),
      finishedAt: new Date(at),
    },
  });
  return id;
}

async function createSnapshot(
  productId: string,
  crawlRunId: string,
  price: number,
  at: string,
  { id = randomUUID() }: { id?: string } = {},
) {
  await client.priceSnapshot.create({
    data: {
      id,
      productId,
      price,
      capturedAt: new Date(at),
      crawlRunId,
    },
  });
}

function nextCategoryIgrp() {
  nextIgrp += 1;
  return nextIgrp;
}
