// apps/web/tests/api/products/[id]/price-history/price-history.integration.test.ts
// 以 disposable PostgreSQL 驗證價格歷史 actual query path、邊界語意與 index-only work bound。

import { randomUUID } from "node:crypto";
import { createPrismaClient, type PrismaClient } from "@partsradar/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  type ProductPriceHistoryReadClient,
  readBoundedPriceHistorySnapshots,
} from "../../../../../app/api/products/[id]/price-history/data";
import {
  PRICE_HISTORY_BUCKET_COUNT,
  PRICE_HISTORY_MAX_RESPONSE_POINTS,
  PRICE_HISTORY_RAW_PROBE_LIMIT,
  PRICE_HISTORY_SNAPSHOT_LIMIT,
} from "../../../../../app/api/products/[id]/price-history/limits";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!testDatabaseUrl || !migrationDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL and MIGRATION_DATABASE_URL are required for PostgreSQL integration tests.",
  );
}

interface CapturedRawQuery {
  strings: TemplateStringsArray;
  values: unknown[];
}

const productIds = new Set<string>();
let categoryId: string;
let crawlRunId: string;
let client: PrismaClient;
let adminClient: PrismaClient;

beforeAll(async () => {
  client = createPrismaClient(testDatabaseUrl);
  adminClient = createPrismaClient(migrationDatabaseUrl);
  categoryId = randomUUID();
  crawlRunId = randomUUID();
  const igrp = 8_000_000 + Math.floor(Math.random() * 1_000_000);

  await client.sourceCategory.create({
    data: {
      id: categoryId,
      igrp,
      sourceName: `RC12 integration ${igrp}`,
      displayName: `RC12 integration ${igrp}`,
    },
  });
  await client.crawlRun.create({
    data: {
      id: crawlRunId,
      status: "SUCCESS_CHANGED",
      triggerType: "MANUAL",
      startedAt: new Date("2031-01-01T00:00:00.000Z"),
      finishedAt: new Date("2031-01-01T00:00:00.000Z"),
    },
  });
});

afterEach(async () => {
  await client.priceSnapshot.deleteMany({
    where: {
      productId: {
        in: [...productIds],
      },
    },
  });
  await client.product.deleteMany({
    where: {
      id: {
        in: [...productIds],
      },
    },
  });
  productIds.clear();
}, 60_000);

afterAll(async () => {
  await client.crawlRun.delete({ where: { id: crawlRunId } });
  await client.sourceCategory.delete({ where: { id: categoryId } });
  await client.$disconnect();
  await adminClient.$disconnect();
}, 60_000);

describe("price history PostgreSQL bounded read", () => {
  it("handles 0/1/limit/limit+1 and same-timestamp ties deterministically", async () => {
    for (const count of [0, 1, PRICE_HISTORY_SNAPSHOT_LIMIT, PRICE_HISTORY_RAW_PROBE_LIMIT]) {
      const productId = await createProduct(`Boundary ${count}`);
      const rows = createSnapshotRows(productId, count, {
        at: (index) => new Date(Date.UTC(2031, 0, 1, 0, 0, index)),
      });

      if (rows.length > 0) {
        await client.priceSnapshot.createMany({ data: rows });
      }

      const firstRead = await readBoundedPriceHistorySnapshots(toReadClient(), productId, null);
      const secondRead = await readBoundedPriceHistorySnapshots(toReadClient(), productId, null);

      expect(secondRead).toEqual(firstRead);
      expect(firstRead.snapshots.length).toBeLessThanOrEqual(PRICE_HISTORY_SNAPSHOT_LIMIT);

      if (count <= PRICE_HISTORY_SNAPSHOT_LIMIT) {
        expect(firstRead.downsampled).toBe(false);
        expect(firstRead.snapshots).toHaveLength(count);
      } else {
        expect(firstRead.downsampled).toBe(true);
        expect(firstRead.snapshots[0]?.id).toBe(rows[0]?.id);
        expect(firstRead.snapshots.at(-1)?.id).toBe(rows.at(-1)?.id);
      }
    }

    const tiedProductId = await createProduct("Same timestamp ties");
    const tiedRows = createSnapshotRows(tiedProductId, PRICE_HISTORY_RAW_PROBE_LIMIT, {
      at: () => new Date("2031-01-02T00:00:00.000Z"),
    });
    await client.priceSnapshot.createMany({ data: tiedRows.toReversed() });

    const tiedRead = await readBoundedPriceHistorySnapshots(toReadClient(), tiedProductId, null);
    const tiedRowsById = tiedRows.toSorted((left, right) => left.id.localeCompare(right.id));

    expect(tiedRead.downsampled).toBe(true);
    expect(tiedRead.snapshots.map(({ id }) => id)).toEqual([
      tiedRowsById[0]?.id,
      tiedRowsById.at(-1)?.id,
    ]);

    const rangedProductId = await createProduct("Finite since boundary");
    const rangedRows = [
      {
        id: randomUUID(),
        productId: rangedProductId,
        price: 9_000,
        capturedAt: new Date("2031-01-02T23:59:59.999Z"),
        crawlRunId,
      },
      {
        id: randomUUID(),
        productId: rangedProductId,
        price: 8_500,
        capturedAt: new Date("2031-01-03T00:00:00.000Z"),
        crawlRunId,
      },
      {
        id: randomUUID(),
        productId: rangedProductId,
        price: 8_000,
        capturedAt: new Date("2031-01-03T00:00:00.001Z"),
        crawlRunId,
      },
    ];
    await client.priceSnapshot.createMany({ data: rangedRows });

    const rangedRead = await readBoundedPriceHistorySnapshots(
      toReadClient(),
      rangedProductId,
      new Date("2031-01-03T00:00:00.000Z"),
    );

    expect(rangedRead.snapshots.map(({ id }) => id)).toEqual([
      rangedRows[1]?.id,
      rangedRows[2]?.id,
    ]);

    const bucketBoundaryProductId = await createProduct("Half-open bucket boundary");
    const bucketBoundaryId = "44444444-4444-4444-8444-444444444444";
    const bucketBoundaryRows = [
      {
        id: "44444444-4444-4444-8444-444444444440",
        productId: bucketBoundaryProductId,
        price: 10_000,
        capturedAt: new Date("2031-01-04T00:00:00.000Z"),
        crawlRunId,
      },
      ...Array.from({ length: PRICE_HISTORY_SNAPSHOT_LIMIT - 2 }, (_, index) => ({
        id: randomUUID(),
        productId: bucketBoundaryProductId,
        price: 9_500 + (index % 7),
        capturedAt: new Date("2031-01-04T00:00:00.500Z"),
        crawlRunId,
      })),
      {
        id: bucketBoundaryId,
        productId: bucketBoundaryProductId,
        price: 9_000,
        capturedAt: new Date("2031-01-04T00:00:01.000Z"),
        crawlRunId,
      },
      {
        id: "44444444-4444-4444-8444-444444444449",
        productId: bucketBoundaryProductId,
        price: 8_000,
        capturedAt: new Date("2031-01-04T00:02:06.000Z"),
        crawlRunId,
      },
    ];
    await client.priceSnapshot.createMany({ data: bucketBoundaryRows });

    const bucketBoundaryRead = await readBoundedPriceHistorySnapshots(
      toReadClient(),
      bucketBoundaryProductId,
      null,
    );

    expect(bucketBoundaryRead.downsampled).toBe(true);
    expect(bucketBoundaryRead.snapshots.map(({ id }) => id)).toContain(bucketBoundaryId);
  }, 60_000);

  it("bounds a synthetic high-cardinality result and uses only the required named index", async () => {
    const productId = await createProduct("Synthetic high cardinality");
    await adminClient.$executeRaw`
      INSERT INTO public.price_snapshots (
        id,
        product_id,
        price,
        currency,
        captured_at,
        crawl_run_id,
        created_at
      )
      SELECT
        pg_catalog.gen_random_uuid(),
        ${productId}::uuid,
        10_000 + (sequence_number % 101),
        'TWD'::public.currency,
        ${new Date("2031-01-03T00:00:00.000Z")}::timestamptz
          + sequence_number * interval '1 millisecond',
        ${crawlRunId}::uuid,
        pg_catalog.now()
      FROM pg_catalog.generate_series(0, 99_999) AS sequence_number
    `;
    await adminClient.$executeRaw`ANALYZE public.price_snapshots`;
    const endpoints = await client.priceSnapshot.findMany({
      where: { productId },
      select: { id: true, capturedAt: true },
      orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
      take: 1,
    });
    const latestEndpoints = await client.priceSnapshot.findMany({
      where: { productId },
      select: { id: true, capturedAt: true },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: 1,
    });
    const capturedQueries: CapturedRawQuery[] = [];
    const settingsBefore = await readPlannerSettings();

    const result = await readBoundedPriceHistorySnapshots(
      toReadClient(capturedQueries),
      productId,
      new Date("2031-01-03T00:00:00.000Z"),
    );
    const settingsAfter = await readPlannerSettings();
    const sampledQuery = capturedQueries.find(({ strings }) =>
      strings.join("?").includes('WITH "bounds" AS MATERIALIZED'),
    );
    const probeQuery = capturedQueries.find(({ strings }) => {
      const sql = strings.join("?");
      return (
        sql.includes("FROM public.") &&
        sql.includes('snapshot."captured_at" >= ?::timestamptz') &&
        sql.includes('ORDER BY snapshot."captured_at" ASC') &&
        sql.includes("LIMIT ?") &&
        !sql.includes('WITH "bounds" AS MATERIALIZED')
      );
    });
    const latestQuery = capturedQueries.find(({ strings }) => {
      const sql = strings.join("?");
      return (
        sql.includes("FROM public.") &&
        sql.includes('ORDER BY snapshot."captured_at" DESC') &&
        sql.includes("LIMIT 1") &&
        !sql.includes('WITH "bounds" AS MATERIALIZED')
      );
    });

    expect(result.downsampled).toBe(true);
    expect(result.snapshots.length).toBeLessThanOrEqual(PRICE_HISTORY_SNAPSHOT_LIMIT);
    expect(result.snapshots.length + 1).toBeLessThanOrEqual(PRICE_HISTORY_MAX_RESPONSE_POINTS);
    expect(result.snapshots[0]?.id).toBe(endpoints[0]?.id);
    expect(result.snapshots.at(-1)?.id).toBe(latestEndpoints[0]?.id);
    expect(settingsAfter).toEqual(settingsBefore);
    expect(sampledQuery).toBeDefined();
    expect(probeQuery).toBeDefined();
    expect(latestQuery).toBeDefined();

    const probePlan = await explainCapturedQuery(probeQuery as CapturedRawQuery);
    const probeNodes = collectPlanNodes(probePlan);
    const probeSnapshotScans = probeNodes.filter(
      (node) => node["Relation Name"] === "price_snapshots",
    );

    expect(probeNodes[0]?.["Actual Rows"]).toBe(PRICE_HISTORY_RAW_PROBE_LIMIT);
    expect(probeSnapshotScans).not.toHaveLength(0);
    expect(
      probeSnapshotScans.every(
        (node) =>
          (node["Node Type"] === "Index Scan" || node["Node Type"] === "Index Only Scan") &&
          node["Index Name"] === "price_snapshots_product_id_captured_at_id_idx" &&
          typeof node["Index Cond"] === "string" &&
          String(node["Index Cond"]).includes("product_id") &&
          String(node["Index Cond"]).includes("captured_at") &&
          examinedRows(node) <= PRICE_HISTORY_RAW_PROBE_LIMIT,
      ),
    ).toBe(true);
    expect(
      probeSnapshotScans.some(
        (node) => node["Node Type"] === "Seq Scan" || node["Node Type"] === "Bitmap Heap Scan",
      ),
    ).toBe(false);

    const latestPlan = await explainCapturedQuery(latestQuery as CapturedRawQuery);
    const latestSnapshotScans = collectPlanNodes(latestPlan).filter(
      (node) => node["Relation Name"] === "price_snapshots",
    );

    expect(latestPlan["Actual Rows"]).toBe(1);
    expect(latestSnapshotScans).not.toHaveLength(0);
    expect(
      latestSnapshotScans.every(
        (node) =>
          (node["Node Type"] === "Index Scan" || node["Node Type"] === "Index Only Scan") &&
          node["Index Name"] === "price_snapshots_product_id_captured_at_id_idx" &&
          typeof node["Index Cond"] === "string" &&
          String(node["Index Cond"]).includes("product_id") &&
          examinedRows(node) <= 1,
      ),
    ).toBe(true);

    const sampledPlan = await explainCapturedQuery(sampledQuery as CapturedRawQuery);
    const sampledNodes = collectPlanNodes(sampledPlan);
    const sampledSnapshotScans = sampledNodes.filter(
      (node) => node["Relation Name"] === "price_snapshots",
    );

    expect(sampledNodes[0]?.["Actual Rows"]).toBeLessThanOrEqual(PRICE_HISTORY_SNAPSHOT_LIMIT);
    expect(sampledSnapshotScans).not.toHaveLength(0);
    expect(
      sampledSnapshotScans.some(
        (node) => node["Node Type"] === "Seq Scan" || node["Node Type"] === "Bitmap Heap Scan",
      ),
    ).toBe(false);
    expect(
      sampledSnapshotScans.every(
        (node) =>
          (node["Node Type"] === "Index Scan" || node["Node Type"] === "Index Only Scan") &&
          node["Index Name"] === "price_snapshots_product_id_captured_at_id_idx" &&
          typeof node["Index Cond"] === "string" &&
          String(node["Index Cond"]).includes("product_id") &&
          examinedRows(node) <= Math.max(1, Number(node["Actual Loops"])),
      ),
    ).toBe(true);
    expect(
      sampledSnapshotScans.reduce((total, node) => total + examinedRows(node), 0),
    ).toBeLessThanOrEqual(2 + 2 * PRICE_HISTORY_BUCKET_COUNT);
    expect(
      sampledSnapshotScans.every(
        (node) =>
          Number(node["Rows Removed by Filter"] ?? 0) === 0 &&
          Number(node["Rows Removed by Index Recheck"] ?? 0) === 0,
      ),
    ).toBe(true);
    expect(
      sampledSnapshotScans
        .filter((node) => Number(node["Actual Loops"]) > 1)
        .every((node) => String(node["Index Cond"]).includes("captured_at")),
    ).toBe(true);
    expect(
      sampledNodes
        .filter((node) => node["Node Type"] === "Sort" || node["Node Type"] === "Materialize")
        .every((node) => Number(node["Actual Rows"]) <= PRICE_HISTORY_SNAPSHOT_LIMIT),
    ).toBe(true);
  }, 60_000);
});

function toReadClient(capturedQueries: CapturedRawQuery[] = []): ProductPriceHistoryReadClient {
  return {
    product: {
      findFirst: (args) => client.product.findFirst(args),
    },
    $transaction: (callback, options) =>
      client.$transaction(
        (transaction) =>
          callback({
            $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => {
              capturedQueries.push({ strings, values });
              return transaction.$queryRaw<T>(strings, ...values);
            },
          }),
        options,
      ),
  };
}

async function createProduct(name: string): Promise<string> {
  const id = randomUUID();
  productIds.add(id);
  await client.product.create({
    data: {
      id,
      sourceCategoryId: categoryId,
      ibuyToken: `rc12-${id}`,
      name,
      normalizedName: name.toLocaleLowerCase(),
      sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=12",
      firstSeenAt: new Date("2031-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2031-01-04T00:00:00.000Z"),
    },
  });
  return id;
}

function createSnapshotRows(productId: string, count: number, { at }: { at(index: number): Date }) {
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    productId,
    price: 10_000 + (index % 101),
    capturedAt: at(index),
    crawlRunId,
  }));
}

async function readPlannerSettings() {
  const rows = await client.$queryRaw<
    Array<{
      seqScan: string;
      bitmapScan: string;
      indexScan: string;
      indexOnlyScan: string;
      statementTimeout: string;
    }>
  >`
    SELECT
      pg_catalog.current_setting('enable_seqscan') AS "seqScan",
      pg_catalog.current_setting('enable_bitmapscan') AS "bitmapScan",
      pg_catalog.current_setting('enable_indexscan') AS "indexScan",
      pg_catalog.current_setting('enable_indexonlyscan') AS "indexOnlyScan",
      pg_catalog.current_setting('statement_timeout') AS "statementTimeout"
  `;
  return rows[0];
}

async function explainCapturedQuery(query: CapturedRawQuery): Promise<Record<string, unknown>> {
  const explainQuery = prependExplain(query.strings);
  const rows = await adminClient.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT
        pg_catalog.set_config('enable_seqscan', 'off', true),
        pg_catalog.set_config('enable_bitmapscan', 'off', true),
        pg_catalog.set_config('enable_indexscan', 'on', true),
        pg_catalog.set_config('enable_indexonlyscan', 'on', true)
    `;
    return transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(explainQuery, ...query.values);
  });
  const document = rows[0]?.["QUERY PLAN"] as Array<{ Plan: Record<string, unknown> }> | undefined;
  const plan = document?.[0]?.Plan;

  if (!plan) {
    throw new Error("PostgreSQL did not return a JSON query plan.");
  }

  return plan;
}

function prependExplain(strings: TemplateStringsArray): TemplateStringsArray {
  const values = [...strings];
  values[0] = `EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON) ${values[0] ?? ""}`;
  Object.defineProperty(values, "raw", {
    value: [...values],
  });
  return values as unknown as TemplateStringsArray;
}

function collectPlanNodes(plan: Record<string, unknown>): Array<Record<string, unknown>> {
  const children = Array.isArray(plan.Plans) ? (plan.Plans as Array<Record<string, unknown>>) : [];
  return [plan, ...children.flatMap(collectPlanNodes)];
}

function examinedRows(node: Record<string, unknown>): number {
  return (
    (Number(node["Actual Rows"] ?? 0) +
      Number(node["Rows Removed by Filter"] ?? 0) +
      Number(node["Rows Removed by Index Recheck"] ?? 0)) *
    Math.max(1, Number(node["Actual Loops"] ?? 1))
  );
}
