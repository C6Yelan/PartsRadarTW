import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createProductMovementPageQuery,
  createProductMovementSummaryQuery,
  PRODUCT_MOVEMENT_CANDIDATE_LIMIT,
  ProductMovementWorkBudgetExceededError,
  readBoundedProductMovementPage,
  readBoundedProductMovementSummaries,
} from "../../src/product-movement";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");

const NOW = new Date("2031-07-31T12:00:00.000Z");
const PAGE_SIZE = 100;
const BOUNDED_CANDIDATES = 200;
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
  await seedCandidateHeavyFixture();
  productIds = await client.$queryRaw<Array<{ id: string }>>`
    SELECT product.id
    FROM public.products AS product
    WHERE product.source_category_id = ${categoryId}::uuid
    ORDER BY product.id ASC
    LIMIT ${PAGE_SIZE}
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
          ${`${prefix}-token-8`}
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

    const plan = await explain(createProductMovementSummaryQuery(productIds, NOW));
    expect(plan["Actual Rows"] * plan["Actual Loops"]).toBeLessThanOrEqual(PAGE_SIZE);
    const snapshotProbes = walkPlan(plan).filter(
      (node) => node["Index Name"] === "price_snapshots_product_id_captured_at_id_idx",
    );
    expect(snapshotProbes.length).toBeGreaterThan(0);
    expect(snapshotProbes.every((node) => node["Actual Rows"] <= 2)).toBe(true);
    expect(snapshotProbes.every((node) => node["Actual Loops"] <= PAGE_SIZE)).toBe(true);
    expect(totalBuffers(plan)).toBeLessThan(50_000);
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
      expect(totalBuffers(plan)).toBeLessThan(100_000);
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
    const candidateNodes = walkPlan(plan).filter((node) => node["CTE Name"] === "candidates");
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
  if (sequenceNumber % 3 === 0) return { deltaAmount: -100, deltaPercent: -10 };
  if (sequenceNumber % 3 === 1) return { deltaAmount: 100, deltaPercent: 10 };
  return { deltaAmount: 0, deltaPercent: 0 };
}

async function explain(query: Prisma.Sql): Promise<PlanNode> {
  const rows = await client.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
    Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON) ${query}`,
  );
  const document = rows[0]?.["QUERY PLAN"];
  const root = Array.isArray(document) ? (document[0] as { Plan?: PlanNode } | undefined)?.Plan : null;
  if (!root) throw new Error("PostgreSQL did not return a structured movement plan.");
  for (const node of walkPlan(root)) {
    expect(Number.isFinite(node["Plan Rows"])).toBe(true);
    expect(Number.isFinite(node["Actual Rows"])).toBe(true);
    expect(Number.isFinite(node["Actual Loops"])).toBe(true);
  }
  return root;
}

interface PlanNode {
  "Actual Loops": number;
  "Actual Rows": number;
  "Alias"?: string;
  "CTE Name"?: string;
  "Index Name"?: string;
  "Node Type": string;
  "Plan Rows": number;
  "Plans"?: PlanNode[];
  "Relation Name"?: string;
  "Rows Removed by Filter"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
}

function walkPlan(root: PlanNode): PlanNode[] {
  return [root, ...(root.Plans ?? []).flatMap(walkPlan)];
}

function totalBuffers(root: PlanNode): number {
  return (root["Shared Hit Blocks"] ?? 0) + (root["Shared Read Blocks"] ?? 0);
}

function assertBoundedPlanWork(root: PlanNode): void {
  for (const node of walkPlan(root)) {
    if (node["Node Type"].includes("Sort") || node["Node Type"].includes("Hash")) {
      expect(node["Actual Rows"] * node["Actual Loops"]).toBeLessThanOrEqual(
        PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1,
      );
    }
    if (node["Rows Removed by Filter"] !== undefined) {
      expect(node["Rows Removed by Filter"] * node["Actual Loops"]).toBeLessThanOrEqual(
        PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1,
      );
    }
  }
}

async function seedCandidateHeavyFixture(): Promise<void> {
  const candidateCount = PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1;
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.products (
      id, source_category_id, ibuy_token, name, normalized_name, vendor_slug, vendor_name,
      filter_tags, source_url, is_active, is_excluded, first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      ${categoryId}::uuid,
      ${prefix} || '-token-' || sequence_number::text,
      'Movement product ' || sequence_number::text,
      'movement product ' || sequence_number::text,
      CASE WHEN sequence_number <= ${BOUNDED_CANDIDATES} THEN 'bounded' ELSE 'overflow' END,
      'Movement vendor',
      ARRAY['gpu_chip:nvidia', CASE WHEN sequence_number % 2 = 0 THEN 'vram:12gb' ELSE 'vram:8gb' END]::text[],
      'https://example.invalid/' || sequence_number::text,
      sequence_number < ${candidateCount},
      FALSE,
      ${NOW}::timestamptz - interval '60 days',
      ${NOW}::timestamptz,
      ${NOW}::timestamptz,
      ${NOW}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.price_snapshots (
      id, product_id, price, currency, captured_at, crawl_run_id, created_at
    )
    SELECT
      pg_catalog.md5(${prefix} || ':baseline:' || sequence_number::text)::uuid,
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      1000,
      'TWD'::public.currency,
      ${NOW}::timestamptz - interval '40 days',
      ${crawlRunId}::uuid,
      ${NOW}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
    UNION ALL
    SELECT
      pg_catalog.md5(${prefix} || ':current:' || sequence_number::text)::uuid,
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      1000 + CASE WHEN sequence_number % 3 = 0 THEN -100 WHEN sequence_number % 3 = 1 THEN 100 ELSE 0 END,
      'TWD'::public.currency,
      ${NOW}::timestamptz - interval '1 hour',
      ${crawlRunId}::uuid,
      ${NOW}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.current_prices (
      product_id, price_snapshot_id, last_seen_at, price_changed_at, updated_at
    )
    SELECT
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      pg_catalog.md5(${prefix} || ':current:' || sequence_number::text)::uuid,
      ${NOW}::timestamptz - interval '30 minutes',
      ${NOW}::timestamptz - interval '1 hour',
      ${NOW}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.price_snapshots (
      id, product_id, price, currency, captured_at, crawl_run_id, created_at
    )
    SELECT
      pg_catalog.md5(
        ${prefix} || ':history:' || product_number::text || ':' || observation_number::text
      )::uuid,
      pg_catalog.md5(${prefix} || ':product:' || product_number::text)::uuid,
      1000 + observation_number,
      'TWD'::public.currency,
      ${NOW}::timestamptz - interval '29 days' + observation_number * interval '1 minute',
      ${crawlRunId}::uuid,
      ${NOW}::timestamptz
    FROM pg_catalog.generate_series(1, ${PAGE_SIZE}) AS product_number
    CROSS JOIN pg_catalog.generate_series(1, 100) AS observation_number
  `);
  await client.$executeRaw(Prisma.sql`
    UPDATE public.price_snapshots
    SET price = 0
    WHERE id = pg_catalog.md5(${prefix} || ':baseline:4')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM public.price_snapshots
    WHERE product_id = pg_catalog.md5(${prefix} || ':product:5')::uuid
      AND id <> pg_catalog.md5(${prefix} || ':current:5')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    UPDATE public.current_prices
    SET last_seen_at = ${NOW}::timestamptz - interval '1 hour'
    WHERE product_id = pg_catalog.md5(${prefix} || ':product:5')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM public.price_snapshots
    WHERE id = pg_catalog.md5(${prefix} || ':baseline:6')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    UPDATE public.current_prices
    SET last_seen_at = ${NOW}::timestamptz - interval '31 days'
    WHERE product_id = pg_catalog.md5(${prefix} || ':product:7')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM public.price_snapshots
    WHERE id = pg_catalog.md5(${prefix} || ':baseline:8')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.price_snapshots (
      id, product_id, price, currency, captured_at, crawl_run_id, created_at
    ) VALUES
      (
        '00000000-0000-4000-8000-000000000008'::uuid,
        pg_catalog.md5(${prefix} || ':product:8')::uuid,
        800,
        'TWD'::public.currency,
        ${NOW}::timestamptz - interval '40 days',
        ${crawlRunId}::uuid,
        ${NOW}::timestamptz
      ),
      (
        'ffffffff-ffff-4fff-bfff-ffffffffff08'::uuid,
        pg_catalog.md5(${prefix} || ':product:8')::uuid,
        500,
        'TWD'::public.currency,
        ${NOW}::timestamptz - interval '40 days',
        ${crawlRunId}::uuid,
        ${NOW}::timestamptz
      )
  `);
}
