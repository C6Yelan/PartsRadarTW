import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createProductMovementPageQuery,
  createProductMovementSummaryQuery,
  PRODUCT_MOVEMENT_CANDIDATE_LIMIT,
  PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS,
  ProductMovementWorkBudgetExceededError,
  readBoundedProductMovementPage,
  readBoundedProductMovementSummaries,
} from "../../src/product-movement";
import {
  type ExplainPlanNode,
  rowsExaminedPerLoop,
  totalSharedBuffers,
  walkPlan,
} from "../support/explain-plan";
import { seedCandidateHeavyFixture } from "./candidate-heavy-fixture";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");

const NOW = new Date("2031-07-31T12:00:00.000Z");
const PAGE_SIZE = 100;
const BOUNDED_CANDIDATES = 200;
const HIGH_HISTORY_OBSERVATIONS_PER_PRODUCT = 100;
const prefix = randomUUID();
const categoryId = randomUUID();
const crawlRunId = randomUUID();
const igrp = 8_000_000 + Math.floor(Math.random() * 1_000_000);
let client: PrismaClient;
let productIds: string[] = [];

beforeAll(async () => {
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
  await client.sourceCategory.create({
    data: { id: categoryId, igrp, sourceName: `${prefix}-source`, displayName: "Movement test" },
  });
  await client.crawlRun.create({
    data: { id: crawlRunId, triggerType: "MANUAL", startedAt: NOW },
  });
  await seedCandidateHeavyFixture({
    boundedCandidates: BOUNDED_CANDIDATES,
    candidateLimit: PRODUCT_MOVEMENT_CANDIDATE_LIMIT,
    categoryId,
    client,
    crawlRunId,
    highHistoryObservationsPerProduct: HIGH_HISTORY_OBSERVATIONS_PER_PRODUCT,
    now: NOW,
    pageSize: PAGE_SIZE,
    prefix,
  });
  productIds = await client.$queryRaw<Array<{ id: string }>>`
    SELECT product.id
    FROM pg_catalog.generate_series(1, ${PAGE_SIZE}) AS product_number
    INNER JOIN public.products AS product
      ON product.id = pg_catalog.md5(
        ${prefix} || ':product:' || product_number::text
      )::uuid
    ORDER BY product_number ASC
  `.then((rows) => rows.map((row) => row.id));
}, 60_000);

afterAll(async () => {
  if (!client) return;
  await client.currentPrice.deleteMany({ where: { product: { sourceCategoryId: categoryId } } });
  await client.priceSnapshot.deleteMany({ where: { product: { sourceCategoryId: categoryId } } });
  await client.product.deleteMany({ where: { sourceCategoryId: categoryId } });
  await client.crawlRun.deleteMany({ where: { id: crawlRunId } });
  await client.sourceCategory.deleteMany({ where: { id: categoryId } });
  await client.$disconnect();
}, 60_000);

describe("product movement PostgreSQL 18 bounds", () => {
  it("returns fixed per-page summaries with baseline, zero, and stable semantics", async () => {
    const summaries = await readBoundedProductMovementSummaries(readerClient(), productIds, NOW);
    expect(summaries).toHaveLength(PAGE_SIZE);
    expect(new Set(summaries.map(({ productId }) => productId)).size).toBe(PAGE_SIZE);
    expect(summaries.every(({ deltaPercent }) => deltaPercent === null || Number.isFinite(deltaPercent)))
      .toBe(true);
    const goldenRows = await client.$queryRaw<Array<{ id: string; ibuyToken: string }>>`
      SELECT product.id, product.ibuy_token AS "ibuyToken"
      FROM public.products AS product
      WHERE product.source_category_id = ${categoryId}::uuid
        AND product.ibuy_token IN (
          ${`${prefix}-token-1`}, ${`${prefix}-token-3`}, ${`${prefix}-token-4`},
          ${`${prefix}-token-5`}, ${`${prefix}-token-6`}, ${`${prefix}-token-7`},
          ${`${prefix}-token-8`}, ${`${prefix}-token-9`}, ${`${prefix}-token-10`},
          ${`${prefix}-token-11`}, ${`${prefix}-token-12`}, ${`${prefix}-token-13`},
          ${`${prefix}-token-14`}, ${`${prefix}-token-15`}, ${`${prefix}-token-16`},
          ${`${prefix}-token-17`}, ${`${prefix}-token-18`}, ${`${prefix}-token-19`}
        )
    `;
    const golden = await readBoundedProductMovementSummaries(
      readerClient(),
      goldenRows.map(({ id }) => id),
      NOW,
    );
    const byToken = new Map(
      goldenRows.map(({ id, ibuyToken }) => [
        ibuyToken,
        golden.find(({ productId }) => productId === id),
      ]),
    );
    expect(byToken.get(`${prefix}-token-1`)).toMatchObject({ deltaAmount: 100, deltaPercent: 10 });
    expect(byToken.get(`${prefix}-token-3`)).toMatchObject({ deltaAmount: -100, deltaPercent: -10 });
    expect(byToken.get(`${prefix}-token-4`)).toMatchObject({ deltaAmount: 1100, deltaPercent: null });
    expect(byToken.get(`${prefix}-token-5`)).toMatchObject({ deltaAmount: null, deltaPercent: null });
    expect(byToken.get(`${prefix}-token-6`)).toMatchObject({ deltaAmount: -101, deltaPercent: -10.09 });
    expect(byToken.get(`${prefix}-token-7`)).toMatchObject({ deltaAmount: null, deltaPercent: null });
    expect(byToken.get(`${prefix}-token-8`)).toMatchObject({ deltaAmount: 500, deltaPercent: 100 });
    expect(byToken.get(`${prefix}-token-9`)).toMatchObject({ deltaAmount: -23, deltaPercent: -14.37 });
    expect(byToken.get(`${prefix}-token-10`)).toMatchObject({ deltaAmount: 23, deltaPercent: 14.37 });
    expect(byToken.get(`${prefix}-token-11`)).toMatchObject({ deltaAmount: 1, deltaPercent: 3.13 });
    expect(byToken.get(`${prefix}-token-12`)).toMatchObject({ deltaAmount: -1, deltaPercent: -3.13 });
    expect(byToken.get(`${prefix}-token-13`)).toMatchObject({ deltaAmount: 1, deltaPercent: 16.67 });
    expect(byToken.get(`${prefix}-token-14`)).toMatchObject({ deltaAmount: -1, deltaPercent: -16.67 });
    expect(byToken.get(`${prefix}-token-15`)).toMatchObject({ deltaAmount: 0, deltaPercent: 0 });
    expect(byToken.get(`${prefix}-token-16`)).toMatchObject({ deltaAmount: 100, deltaPercent: 10 });
    expect(byToken.get(`${prefix}-token-17`)).toMatchObject({ deltaAmount: 200, deltaPercent: 10 });
    expect(byToken.get(`${prefix}-token-18`)).toMatchObject({ deltaAmount: -100, deltaPercent: -10 });
    expect(byToken.get(`${prefix}-token-19`)).toMatchObject({ deltaAmount: -200, deltaPercent: -10 });

    const plan = await explain(createProductMovementSummaryQuery(productIds, NOW));
    expect(plan["Actual Rows"] * plan["Actual Loops"]).toBeLessThanOrEqual(PAGE_SIZE);
    const snapshotProbes = walkPlan(plan).filter(
      (node) => node["Index Name"] === "price_snapshots_product_id_captured_at_id_idx",
    );
    expect(snapshotProbes.length).toBeGreaterThan(0);
    expect(snapshotProbes.every((node) => node["Actual Rows"] <= 2)).toBe(true);
    expect(snapshotProbes.every((node) => node["Actual Loops"] <= PAGE_SIZE)).toBe(true);
    expect(totalSharedBuffers(plan)).toBeLessThan(50_000);
    expect(
      walkPlan(plan).some(
        (node) =>
          node["Relation Name"] === "price_snapshots" &&
          (node["Node Type"] === "Seq Scan" || node["Node Type"] === "Bitmap Heap Scan"),
      ),
    ).toBe(false);
  });

  it("sorts and pages in PostgreSQL while keeping Node rows at page size", async () => {
    const candidates = await client.$queryRaw<Array<{ id: string; ibuyToken: string }>>`
      SELECT product.id, product.ibuy_token AS "ibuyToken"
      FROM public.products AS product
      WHERE product.source_category_id = ${categoryId}::uuid
        AND product.vendor_slug = 'bounded'
    `;
    for (const sort of ["price_drop_desc", "price_rise_desc"] as const) {
      const expectedIds = [...candidates]
        .sort((left, right) => compareExpectedMovement(sort, left, right))
        .map(({ id }) => id);
      for (const pageNumber of [1, 10]) {
        const page = await readBoundedProductMovementPage(readerClient(), {
          filters: {
            facetTags: ["gpu_chip:nvidia"],
            igrp,
            q: "movement",
            status: "active",
            vendors: ["bounded"],
          },
          sort,
          page: pageNumber,
          pageSize: 20,
          now: NOW,
        });
        expect(page.totalItems).toBe(BOUNDED_CANDIDATES);
        expect(page.productIds).toEqual(expectedIds.slice((pageNumber - 1) * 20, pageNumber * 20));
        expect(page.summaries).toHaveLength(20);
        expect(new Set(page.productIds).size).toBe(20);
      }

      const plan = await explain(
        createProductMovementPageQuery(
          {
            facetTags: ["gpu_chip:nvidia"],
            igrp,
            q: "movement",
            status: "active",
            vendors: ["bounded"],
          },
          sort,
          NOW,
          20,
          20,
        ),
      );
      expect(plan["Actual Rows"] * plan["Actual Loops"]).toBeLessThanOrEqual(20);
      const candidateNodes = walkPlan(plan).filter(
        (node) => node["CTE Name"] === "candidates" || node.Alias === "candidates",
      );
      expect(candidateNodes.length).toBeGreaterThan(0);
      expect(
        candidateNodes.every(
          (node) => node["Actual Rows"] * node["Actual Loops"] <= BOUNDED_CANDIDATES,
        ),
      ).toBe(true);
      expect(totalSharedBuffers(plan)).toBeLessThan(100_000);
      assertBoundedPlanWork(plan);
    }
  });

  it("accepts the exact candidate cap", async () => {
    const page = await readBoundedProductMovementPage(readerClient(), {
      filters: { facetTags: [], igrp, status: "active", vendors: [] },
      sort: "price_drop_desc",
      page: 1,
      pageSize: 20,
      now: NOW,
    });
    expect(page.totalItems).toBe(PRODUCT_MOVEMENT_CANDIDATE_LIMIT);
    expect(page.productIds).toHaveLength(20);
  });

  it("fails closed at cap plus one and does zero downstream history probes", async () => {
    await expect(
      readBoundedProductMovementPage(readerClient(), {
        filters: { facetTags: [], igrp, status: "all", vendors: [] },
        sort: "price_drop_desc",
        page: 1,
        pageSize: 20,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ProductMovementWorkBudgetExceededError);

    const plan = await explain(
      createProductMovementPageQuery(
        { facetTags: [], igrp, status: "all", vendors: [] },
        "price_drop_desc",
        NOW,
        0,
        20,
      ),
    );
    const historyProbes = walkPlan(plan).filter(
      (node) => node["Index Name"] === "price_snapshots_product_id_captured_at_id_idx",
    );
    expect(historyProbes.length).toBeGreaterThan(0);
    expect(historyProbes.every((node) => node["Actual Loops"] === 0)).toBe(true);
    const candidateNodes = walkPlan(plan).filter(
      (node) => node["CTE Name"] === "candidates",
    );
    expect(candidateNodes.some((node) => node["Actual Rows"] === PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1))
      .toBe(true);
    expect(plan["Actual Rows"] * plan["Actual Loops"]).toBe(1);
    assertBoundedPlanWork(plan);
  });
});

function readerClient() {
  return {
    $transaction: (callback, options) =>
      client.$transaction(
        (transaction) => callback({ $queryRaw: (query) => transaction.$queryRaw(query) }),
        options,
      ),
  } satisfies Parameters<typeof readBoundedProductMovementSummaries>[0];
}

function compareExpectedMovement(
  sort: "price_drop_desc" | "price_rise_desc",
  left: { id: string; ibuyToken: string },
  right: { id: string; ibuyToken: string },
): number {
  const leftMovement = expectedMovement(left.ibuyToken);
  const rightMovement = expectedMovement(right.ibuyToken);
  const direction = sort === "price_drop_desc" ? -1 : 1;
  const leftDirectional =
    leftMovement.deltaAmount !== null &&
    leftMovement.deltaPercent !== null &&
    leftMovement.deltaAmount * direction > 0 &&
    leftMovement.deltaPercent * direction > 0;
  const rightDirectional =
    rightMovement.deltaAmount !== null &&
    rightMovement.deltaPercent !== null &&
    rightMovement.deltaAmount * direction > 0 &&
    rightMovement.deltaPercent * direction > 0;
  if (leftDirectional !== rightDirectional) return leftDirectional ? -1 : 1;
  if (leftDirectional && rightDirectional) {
    const percentOrder =
      direction * ((rightMovement.deltaPercent ?? 0) - (leftMovement.deltaPercent ?? 0));
    if (percentOrder !== 0) return percentOrder;
    const amountOrder =
      direction * ((rightMovement.deltaAmount ?? 0) - (leftMovement.deltaAmount ?? 0));
    if (amountOrder !== 0) return amountOrder;
  }
  return left.id.localeCompare(right.id);
}

function expectedMovement(ibuyToken: string): {
  deltaAmount: number | null;
  deltaPercent: number | null;
} {
  const sequenceNumber = Number(ibuyToken.slice(ibuyToken.lastIndexOf("-") + 1));
  if (sequenceNumber === 4) return { deltaAmount: 1100, deltaPercent: null };
  if (sequenceNumber === 5 || sequenceNumber === 7) {
    return { deltaAmount: null, deltaPercent: null };
  }
  if (sequenceNumber === 6) return { deltaAmount: -101, deltaPercent: -10.09 };
  if (sequenceNumber === 8) return { deltaAmount: 500, deltaPercent: 100 };
  if (sequenceNumber === 9) return { deltaAmount: -23, deltaPercent: -14.37 };
  if (sequenceNumber === 10) return { deltaAmount: 23, deltaPercent: 14.37 };
  if (sequenceNumber === 11) return { deltaAmount: 1, deltaPercent: 3.13 };
  if (sequenceNumber === 12) return { deltaAmount: -1, deltaPercent: -3.13 };
  if (sequenceNumber === 13) return { deltaAmount: 1, deltaPercent: 16.67 };
  if (sequenceNumber === 14) return { deltaAmount: -1, deltaPercent: -16.67 };
  if (sequenceNumber === 15) return { deltaAmount: 0, deltaPercent: 0 };
  if (sequenceNumber === 16) return { deltaAmount: 100, deltaPercent: 10 };
  if (sequenceNumber === 17) return { deltaAmount: 200, deltaPercent: 10 };
  if (sequenceNumber === 18) return { deltaAmount: -100, deltaPercent: -10 };
  if (sequenceNumber === 19) return { deltaAmount: -200, deltaPercent: -10 };
  if (sequenceNumber % 3 === 0) return { deltaAmount: -100, deltaPercent: -10 };
  if (sequenceNumber % 3 === 1) return { deltaAmount: 100, deltaPercent: 10 };
  return { deltaAmount: 0, deltaPercent: 0 };
}

async function explain(query: Prisma.Sql): Promise<ExplainPlanNode> {
  const settingsBefore = await readPlannerSettings();
  const rows = await client.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`
      SELECT
        pg_catalog.set_config('enable_seqscan', 'off', true),
        pg_catalog.set_config('enable_bitmapscan', 'off', true),
        pg_catalog.set_config('enable_indexscan', 'on', true),
        pg_catalog.set_config('enable_indexonlyscan', 'on', true),
        pg_catalog.set_config(
          'statement_timeout',
          ${`${PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS}ms`},
          true
        )
    `);
    return transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON) ${query}`,
    );
  });
  await expect(readPlannerSettings()).resolves.toEqual(settingsBefore);
  const document = rows[0]?.["QUERY PLAN"];
  const root = Array.isArray(document)
    ? (document[0] as { Plan?: ExplainPlanNode } | undefined)?.Plan
    : null;
  if (!root) throw new Error("PostgreSQL did not return a structured movement plan.");
  for (const node of walkPlan(root)) {
    expect(Number.isFinite(node["Plan Rows"])).toBe(true);
    expect(Number.isFinite(node["Actual Rows"])).toBe(true);
    expect(Number.isFinite(node["Actual Loops"])).toBe(true);
  }
  return root;
}

async function readPlannerSettings() {
  return client.$queryRaw<
    Array<{
      bitmapScan: string;
      indexOnlyScan: string;
      indexScan: string;
      seqScan: string;
      statementTimeout: string;
    }>
  >`
    SELECT
      current_setting('enable_seqscan') AS "seqScan",
      current_setting('enable_bitmapscan') AS "bitmapScan",
      current_setting('enable_indexscan') AS "indexScan",
      current_setting('enable_indexonlyscan') AS "indexOnlyScan",
      current_setting('statement_timeout') AS "statementTimeout"
  `;
}

function assertBoundedPlanWork(root: ExplainPlanNode): void {
  const nodes = walkPlan(root);
  for (const node of nodes) {
    if (node["Node Type"].includes("Sort")) {
      expect(
        node["Actual Rows"],
        `unexpected plan work: ${JSON.stringify(node)}`,
      ).toBeLessThanOrEqual(PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1);
      expect(node["Actual Loops"]).toBeLessThanOrEqual(1);
    }
    if (node["Node Type"].includes("Hash")) {
      expect(node["Actual Rows"]).toBeLessThanOrEqual(
        PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1,
      );
      expect(node["Actual Loops"]).toBeLessThanOrEqual(2);
    }
    if (node["Rows Removed by Filter"] !== undefined) {
      expect(Number.isFinite(node["Rows Removed by Filter"])).toBe(true);
    }
  }

  expect(
    nodes.some(
      (node) =>
        node["Relation Name"] === "price_snapshots" &&
        (node["Node Type"] === "Seq Scan" || node["Node Type"] === "Bitmap Heap Scan"),
    ),
  ).toBe(false);

  const candidateGateNodes = nodes.filter(
    (node) => node["CTE Name"] === "candidate_gate" || node.Alias === "candidate_gate",
  );
  expect(candidateGateNodes.length).toBeGreaterThan(0);
  expect(
    candidateGateNodes.every(
      (node) =>
        node["Actual Rows"] * node["Actual Loops"] <=
        PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1,
    ),
  ).toBe(true);

  const candidateStateGuards = nodes.filter(
    (node) => node.Filter?.includes("total_items <= 4096"),
  );
  expect(candidateStateGuards.length).toBeGreaterThan(0);
  expect(
    candidateStateGuards.every(
      (node) =>
        (node["Rows Removed by Filter"] ?? 0) * node["Actual Loops"] <=
        PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1,
    ),
  ).toBe(true);

  const productScans = nodes.filter((node) => node["Relation Name"] === "products");
  expect(productScans.length).toBeGreaterThan(0);
  expect(
    productScans.every(
      (node) =>
        rowsExaminedPerLoop(node) <= PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1 &&
        node["Actual Loops"] <= 2,
    ),
  ).toBe(true);

  const currentPriceScans = nodes.filter(
    (node) => node["Relation Name"] === "current_prices",
  );
  expect(currentPriceScans.length).toBeGreaterThan(0);
  expect(
    currentPriceScans.every(
      (node) =>
        (rowsExaminedPerLoop(node) <= 1 &&
          node["Actual Loops"] <= PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1) ||
        (rowsExaminedPerLoop(node) <= PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1 &&
          node["Actual Loops"] <= 2),
    ),
  ).toBe(true);

  const currentSnapshotProbes = nodes.filter(
    (node) =>
      node["Relation Name"] === "price_snapshots" &&
      node["Index Name"] === "price_snapshots_pkey",
  );
  expect(currentSnapshotProbes.length).toBeGreaterThan(0);
  expect(
    currentSnapshotProbes.every(
      (node) =>
        rowsExaminedPerLoop(node) <= 1 &&
        node["Actual Loops"] <= PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1,
    ),
  ).toBe(true);

  const snapshotProbes = nodes.filter(
    (node) => node["Index Name"] === "price_snapshots_product_id_captured_at_id_idx",
  );
  expect(snapshotProbes.length).toBeGreaterThan(0);
  expect(snapshotProbes.every((node) => rowsExaminedPerLoop(node) <= 2)).toBe(true);
  expect(
    snapshotProbes.every(
      (node) => node["Actual Loops"] <= PRODUCT_MOVEMENT_CANDIDATE_LIMIT,
    ),
  ).toBe(true);
}
