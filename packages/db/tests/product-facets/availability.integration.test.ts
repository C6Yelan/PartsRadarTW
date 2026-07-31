// packages/db/tests/product-facets/availability.integration.test.ts
// 以 disposable PostgreSQL 驗證 SSD facet availability projection、同步 triggers 與固定 query plan。

import { randomUUID } from "node:crypto";
import { getPublicProductFacetAvailabilityTags } from "@partsradar/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createAvailableProductFacetTagsQuery,
  PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS,
  readAvailableProductFacetTags,
} from "../../src/product-facets/availability";
import {
  type ExplainPlanNode,
  totalSharedBuffers,
  walkPlan,
} from "../support/explain-plan";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!testDatabaseUrl || !migrationDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL and MIGRATION_DATABASE_URL are required for PostgreSQL integration tests.",
  );
}

const candidateTags = getPublicProductFacetAvailabilityTags(7);
const categoryIds = new Set<string>();
const productIds = new Set<string>();
const crawlRunIds = new Set<string>();
const snapshotIds = new Set<string>();
const CANDIDATE_HEAVY_ROWS_PER_TAG = 256;
const UNKNOWN_TAG_PRODUCT_COUNT = 2_048;
const MAX_PUBLIC_PLAN_SHARED_BLOCKS = candidateTags.length * 8;
let client: PrismaClient;
let maintenanceClient: PrismaClient;

beforeAll(() => {
  client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
  });
  maintenanceClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: migrationDatabaseUrl }),
  });
});

afterEach(async () => {
  await client.currentPrice.deleteMany({ where: { productId: { in: [...productIds] } } });
  await client.priceSnapshot.deleteMany({ where: { id: { in: [...snapshotIds] } } });
  await client.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await client.crawlRun.deleteMany({ where: { id: { in: [...crawlRunIds] } } });
  await client.sourceCategory.deleteMany({ where: { id: { in: [...categoryIds] } } });
  snapshotIds.clear();
  productIds.clear();
  crawlRunIds.clear();
  categoryIds.clear();
});

afterAll(async () => {
  await Promise.all([client.$disconnect(), maintenanceClient.$disconnect()]);
});

describe("product facet availability PostgreSQL integration", () => {
  it("transactionally tracks every eligibility predicate and filters unknown tags", async () => {
    const categoryId = await createCategory();
    const crawlRunId = await createCrawlRun();
    const supportedId = await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:about-1tb", "legacy:unknown"],
    });
    await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:4000", "capacity_bucket:4000"],
    });
    const inactiveId = await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:240-256"],
      isActive: false,
    });
    const excludedId = await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:480-512"],
      isExcluded: true,
    });
    const noPriceId = await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:about-2tb"],
      withCurrentPrice: false,
    });
    const movedId = await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:128"],
    });
    await createProduct(categoryId, crawlRunId, {
      filterTags: ["legacy:unknown"],
    });

    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([
      "capacity_bucket:128",
      "capacity_bucket:about-1tb",
      "capacity_bucket:4000",
    ]);

    const otherCategoryId = await createCategory({ igrp: 71 });
    await client.product.update({
      where: { id: movedId },
      data: { sourceCategoryId: otherCategoryId },
    });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.not.toContain(
      "capacity_bucket:128",
    );
    await client.product.update({
      where: { id: movedId },
      data: { sourceCategoryId: categoryId },
    });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toContain(
      "capacity_bucket:128",
    );

    await client.product.update({ where: { id: inactiveId }, data: { isActive: true } });
    await client.product.update({ where: { id: excludedId }, data: { isExcluded: false } });
    await createCurrentPriceForProduct(noPriceId, crawlRunId);
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([
      "capacity_bucket:128",
      "capacity_bucket:240-256",
      "capacity_bucket:480-512",
      "capacity_bucket:about-1tb",
      "capacity_bucket:about-2tb",
      "capacity_bucket:4000",
    ]);

    await client.product.update({
      where: { id: supportedId },
      data: { filterTags: ["capacity_bucket:8000", "legacy:unknown"] },
    });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([
      "capacity_bucket:128",
      "capacity_bucket:240-256",
      "capacity_bucket:480-512",
      "capacity_bucket:about-2tb",
      "capacity_bucket:4000",
      "capacity_bucket:8000",
    ]);

    await client.sourceCategory.update({ where: { id: categoryId }, data: { enabled: false } });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([]);
    await client.sourceCategory.update({ where: { id: categoryId }, data: { enabled: true } });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toContain(
      "capacity_bucket:8000",
    );
    await client.sourceCategory.update({ where: { id: categoryId }, data: { igrp: 72 } });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([]);
    await client.sourceCategory.update({ where: { id: categoryId }, data: { igrp: 7 } });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toContain(
      "capacity_bucket:8000",
    );

    await client.currentPrice.delete({ where: { productId: supportedId } });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.not.toContain(
      "capacity_bucket:8000",
    );

    const cascadeProductId = await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:8000"],
      withCurrentPrice: false,
    });
    await maintenanceClient.productFacetEligibleProduct.create({
      data: { igrp: 7, tag: "capacity_bucket:8000", productId: cascadeProductId },
    });
    await client.product.delete({ where: { id: cascadeProductId } });
    await expect(
      maintenanceClient.productFacetEligibleProduct.count({
        where: { productId: cascadeProductId },
      }),
    ).resolves.toBe(0);
  }, 30_000);

  it("rolls projection changes back with failed product transactions", async () => {
    const categoryId = await createCategory();
    const crawlRunId = await createCrawlRun();
    const productId = randomUUID();
    const snapshotId = randomUUID();
    productIds.add(productId);
    snapshotIds.add(snapshotId);

    await expect(
      client.$transaction(async (transaction) => {
        await transaction.product.create({
          data: createProductRow(productId, categoryId, ["capacity_bucket:128"]),
        });
        await transaction.priceSnapshot.create({
          data: createSnapshotRow(snapshotId, productId, crawlRunId, 1_000),
        });
        await transaction.currentPrice.create({
          data: createCurrentPriceRow(productId, snapshotId),
        });
        throw new Error("rollback projection");
      }),
    ).rejects.toThrow("rollback projection");

    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([]);
    await expect(client.productFacetEligibleProduct.count({ where: { productId } })).resolves.toBe(
      0,
    );
  });

  it("keeps small and candidate-heavy plans within fixed B-tree probe bounds", async () => {
    const categoryId = await createCategory();
    const crawlRunId = await createCrawlRun();

    await createTaggedProductBatch(categoryId, crawlRunId, {
      prefix: "small-supported",
      tags: candidateTags,
      countPerTag: 1,
    });
    await maintenanceClient.$executeRaw`ANALYZE product_facet_eligible_products`;
    const smallPlan = await explainAvailabilityQuery();

    await createTaggedProductBatch(categoryId, crawlRunId, {
      prefix: "supported",
      tags: candidateTags,
      countPerTag: CANDIDATE_HEAVY_ROWS_PER_TAG - 1,
    });
    await createTaggedProductBatch(categoryId, crawlRunId, {
      prefix: "inactive",
      tags: candidateTags,
      countPerTag: CANDIDATE_HEAVY_ROWS_PER_TAG,
      isActive: false,
    });
    await createTaggedProductBatch(categoryId, crawlRunId, {
      prefix: "excluded",
      tags: candidateTags,
      countPerTag: CANDIDATE_HEAVY_ROWS_PER_TAG,
      isExcluded: true,
    });
    await createTaggedProductBatch(categoryId, crawlRunId, {
      prefix: "no-current-price",
      tags: candidateTags,
      countPerTag: CANDIDATE_HEAVY_ROWS_PER_TAG,
      withCurrentPrice: false,
    });
    await createProductBatch(categoryId, crawlRunId, {
      prefix: "unknown",
      filterTags: Array.from({ length: UNKNOWN_TAG_PRODUCT_COUNT }, () => ["legacy:unknown"]),
    });
    await maintenanceClient.$executeRaw`ANALYZE product_facet_eligible_products`;

    const projectionCount = await client.productFacetEligibleProduct.count();
    const largePlan = await explainAvailabilityQuery();
    const projectedProduct = await client.productFacetEligibleProduct.findFirstOrThrow({
      select: { productId: true },
    });
    const maintenancePlanRows = await client.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON)
      SELECT tag
      FROM product_facet_eligible_products
      WHERE product_id = ${projectedProduct.productId}::uuid
    `;
    const maintenanceProbe = walkPlan(readExplainRoot(maintenancePlanRows)).find(
      (node) => node["Index Name"] === "product_facet_eligible_products_product_id_idx",
    );

    expect(projectionCount).toBe(candidateTags.length * CANDIDATE_HEAVY_ROWS_PER_TAG);
    assertFixedAvailabilityPlan(smallPlan);
    assertFixedAvailabilityPlan(largePlan);
    expect(maintenanceProbe).toMatchObject({
      "Actual Loops": 1,
      "Actual Rows": 1,
    });
  }, 60_000);

  it("fails closed when the transaction-local statement timeout is exceeded", async () => {
    let thrown: unknown;
    let elapsedMs = 0;

    await maintenanceClient.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        LOCK TABLE product_facet_eligible_products IN ACCESS EXCLUSIVE MODE
      `;
      const startedAt = Date.now();
      try {
        await readAvailableProductFacetTags(client, 7);
      } catch (error) {
        thrown = error;
      }
      elapsedMs = Date.now() - startedAt;
    });

    expect(thrown).toBeInstanceOf(Error);
    expect(elapsedMs).toBeGreaterThanOrEqual(PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS / 2);
    expect(elapsedMs).toBeLessThan(PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS + 4_000);
  }, 10_000);

  it("installs only the projection indexes needed by read and trigger maintenance plans", async () => {
    const runtimeRole = process.env.POSTGRES_RUNTIME_USER;
    if (!runtimeRole) {
      throw new Error("POSTGRES_RUNTIME_USER is required.");
    }
    const indexes = await maintenanceClient.$queryRaw<
      Array<{ indexdef: string; indexname: string; indisready: boolean; indisvalid: boolean }>
    >`
      SELECT
        index_relation.relname AS indexname,
        pg_get_indexdef(index_metadata.indexrelid) AS indexdef,
        index_metadata.indisready,
        index_metadata.indisvalid
      FROM pg_index AS index_metadata
      INNER JOIN pg_class AS index_relation
        ON index_relation.oid = index_metadata.indexrelid
      INNER JOIN pg_namespace AS namespace
        ON namespace.oid = index_relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND index_relation.relname IN (
          'product_facet_eligible_products_pkey',
          'product_facet_eligible_products_product_id_idx'
        )
      ORDER BY index_relation.relname
    `;
    const functions = await maintenanceClient.$queryRaw<
      Array<{
        owner_is_runtime: boolean;
        prosecdef: boolean;
        proname: string;
        public_execute_revoked: boolean;
        runtime_can_execute: boolean;
      }>
    >(
      Prisma.sql`
      SELECT
        procedure.proname,
        procedure.prosecdef,
        owner.rolname = ${runtimeRole} AS owner_is_runtime,
        has_function_privilege(${runtimeRole}, procedure.oid, 'EXECUTE') AS runtime_can_execute,
        NOT EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
          WHERE acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        ) AS public_execute_revoked
      FROM pg_proc AS procedure
      INNER JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      INNER JOIN pg_roles AS owner ON owner.oid = procedure.proowner
      WHERE namespace.nspname = current_schema()
        AND procedure.proname IN (
          'refresh_product_facet_eligible_product',
          'refresh_product_facet_eligible_category',
          'sync_product_facet_eligible_product',
          'sync_current_price_facet_eligibility',
          'sync_product_facet_eligible_category'
        )
      ORDER BY procedure.proname
    `,
    );

    expect(indexes).toEqual([
      expect.objectContaining({
        indexname: "product_facet_eligible_products_pkey",
        indexdef: expect.stringContaining("USING btree (igrp, tag, product_id)"),
        indisready: true,
        indisvalid: true,
      }),
      expect.objectContaining({
        indexname: "product_facet_eligible_products_product_id_idx",
        indexdef: expect.stringContaining("USING btree (product_id)"),
        indisready: true,
        indisvalid: true,
      }),
    ]);
    expect(functions).toHaveLength(5);
    expect(functions.every((candidate) => candidate.prosecdef)).toBe(true);
    expect(functions.every((candidate) => !candidate.owner_is_runtime)).toBe(true);
    expect(functions.every((candidate) => candidate.public_execute_revoked)).toBe(true);
    expect(functions.every((candidate) => !candidate.runtime_can_execute)).toBe(true);
  });
});

function assertFixedAvailabilityPlan(root: ExplainPlanNode): void {
  const nodes = walkPlan(root);
  const limit = nodes.find(
    (node) => node["Node Type"] === "Limit" && node["Actual Loops"] === candidateTags.length,
  );
  const probes = nodes.filter(
    (node) => node["Index Name"] === "product_facet_eligible_products_pkey",
  );

  expect(root["Actual Rows"] * root["Actual Loops"]).toBe(candidateTags.length);
  expect(totalSharedBuffers(root)).toBeLessThanOrEqual(MAX_PUBLIC_PLAN_SHARED_BLOCKS);
  expect(limit).toMatchObject({
    "Actual Loops": candidateTags.length,
    "Actual Rows": 1,
  });
  expect(probes).toHaveLength(1);
  expect(probes[0]).toMatchObject({
    "Actual Loops": candidateTags.length,
    "Actual Rows": 1,
  });
  expect(nodes.some((node) => node["Node Type"].includes("Bitmap"))).toBe(false);
}

async function explainAvailabilityQuery(): Promise<ExplainPlanNode> {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET LOCAL enable_seqscan = off`;
    await transaction.$executeRaw`SET LOCAL enable_bitmapscan = off`;
    await transaction.$executeRaw`SET LOCAL enable_indexscan = on`;
    await transaction.$executeRaw`SET LOCAL enable_indexonlyscan = on`;
    const rows = await transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
      Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON)
        ${createAvailableProductFacetTagsQuery(7, candidateTags)}
      `,
    );
    return readExplainRoot(rows);
  });
}

function readExplainRoot(rows: Array<{ "QUERY PLAN": unknown }>): ExplainPlanNode {
  const queryPlan = rows[0]?.["QUERY PLAN"];
  if (!Array.isArray(queryPlan)) {
    throw new Error("Expected PostgreSQL JSON query plan array.");
  }
  const root = (queryPlan[0] as { Plan?: ExplainPlanNode } | undefined)?.Plan;
  if (!root) {
    throw new Error("Expected PostgreSQL JSON query plan root.");
  }
  return root;
}

async function createCategory({ igrp = 7 }: { igrp?: number } = {}): Promise<string> {
  const id = randomUUID();
  categoryIds.add(id);
  await client.sourceCategory.create({
    data: {
      id,
      igrp,
      sourceName: "Integration SSD",
      displayName: "Integration SSD",
      enabled: true,
    },
  });
  return id;
}

async function createCrawlRun(): Promise<string> {
  const id = randomUUID();
  crawlRunIds.add(id);
  await client.crawlRun.create({
    data: {
      id,
      status: "SUCCESS_CHANGED",
      triggerType: "MANUAL",
      startedAt: new Date("2030-01-01T00:00:00.000Z"),
      finishedAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });
  return id;
}

async function createProduct(
  categoryId: string,
  crawlRunId: string,
  {
    filterTags,
    isActive = true,
    isExcluded = false,
    withCurrentPrice = true,
  }: {
    filterTags: string[];
    isActive?: boolean;
    isExcluded?: boolean;
    withCurrentPrice?: boolean;
  },
): Promise<string> {
  const productId = randomUUID();
  productIds.add(productId);
  await client.product.create({
    data: {
      ...createProductRow(productId, categoryId, filterTags),
      isActive,
      isExcluded,
    },
  });
  if (withCurrentPrice) {
    await createCurrentPriceForProduct(productId, crawlRunId);
  }
  return productId;
}

async function createCurrentPriceForProduct(productId: string, crawlRunId: string): Promise<void> {
  const snapshotId = randomUUID();
  snapshotIds.add(snapshotId);
  await client.priceSnapshot.create({
    data: createSnapshotRow(snapshotId, productId, crawlRunId, 1_000),
  });
  await client.currentPrice.create({
    data: createCurrentPriceRow(productId, snapshotId),
  });
}

function createProductRow(productId: string, categoryId: string, filterTags: string[]) {
  return {
    id: productId,
    sourceCategoryId: categoryId,
    ibuyToken: `facet-${productId}`,
    name: "Facet integration SSD",
    normalizedName: "facet integration ssd",
    filterTags,
    sourceUrl: "https://example.invalid/ssd",
    isActive: true,
    isExcluded: false,
    firstSeenAt: new Date("2030-01-01T00:00:00.000Z"),
    lastSeenAt: new Date("2030-01-01T00:00:00.000Z"),
  };
}

function createSnapshotRow(
  snapshotId: string,
  productId: string,
  crawlRunId: string,
  price: number,
) {
  return {
    id: snapshotId,
    productId,
    price,
    capturedAt: new Date("2030-01-01T00:00:00.000Z"),
    crawlRunId,
  };
}

function createCurrentPriceRow(productId: string, snapshotId: string) {
  return {
    productId,
    priceSnapshotId: snapshotId,
    lastSeenAt: new Date("2030-01-01T00:00:00.000Z"),
    priceChangedAt: new Date("2030-01-01T00:00:00.000Z"),
  };
}

async function createTaggedProductBatch(
  categoryId: string,
  crawlRunId: string,
  {
    prefix,
    tags,
    countPerTag,
    isActive = true,
    isExcluded = false,
    withCurrentPrice = true,
  }: {
    prefix: string;
    tags: readonly string[];
    countPerTag: number;
    isActive?: boolean;
    isExcluded?: boolean;
    withCurrentPrice?: boolean;
  },
): Promise<void> {
  await createProductBatch(categoryId, crawlRunId, {
    prefix,
    filterTags: tags.flatMap((tag) => Array.from({ length: countPerTag }, () => [tag])),
    isActive,
    isExcluded,
    withCurrentPrice,
  });
}

async function createProductBatch(
  categoryId: string,
  crawlRunId: string,
  {
    prefix,
    filterTags,
    isActive = true,
    isExcluded = false,
    withCurrentPrice = true,
  }: {
    prefix: string;
    filterTags: string[][];
    isActive?: boolean;
    isExcluded?: boolean;
    withCurrentPrice?: boolean;
  },
): Promise<void> {
  const productRows = filterTags.map((tags, index) => {
    const id = randomUUID();
    productIds.add(id);
    return {
      ...createProductRow(id, categoryId, tags),
      ibuyToken: `facet-${prefix}-${id}`,
      name: `Facet ${prefix} SSD ${index}`,
      normalizedName: `facet ${prefix} ssd ${index}`,
      isActive,
      isExcluded,
    };
  });
  await client.product.createMany({ data: productRows });
  if (!withCurrentPrice) {
    return;
  }

  const snapshotRows = productRows.map(({ id: productId }, index) => {
    const id = randomUUID();
    snapshotIds.add(id);
    return {
      ...createSnapshotRow(id, productId, crawlRunId, 2_000 + index),
      capturedAt: new Date(1_893_456_000_000 + index),
    };
  });
  await client.priceSnapshot.createMany({ data: snapshotRows });
  await client.currentPrice.createMany({
    data: snapshotRows.map(({ id: priceSnapshotId, productId, capturedAt }) => ({
      productId,
      priceSnapshotId,
      lastSeenAt: capturedAt,
      priceChangedAt: capturedAt,
    })),
  });
}
