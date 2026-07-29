// packages/db/tests/product-facets/availability.integration.test.ts
// 以 disposable PostgreSQL 驗證 SSD facet availability 的語意、結果上限與 GIN query plan。

import { randomUUID } from "node:crypto";
import { getPublicProductFacetAvailabilityTags } from "@partsradar/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createAvailableProductFacetTagsQuery,
  readAvailableProductFacetTags,
} from "../../src/product-facets/availability";

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
const snapshotIds = new Set<string>();
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
  it("returns only bounded supported tags for enabled, active, included, priced SSD products", async () => {
    const categoryId = await createCategory();
    const crawlRunId = await createCrawlRun();

    await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:about-1tb", "legacy:unknown"],
    });
    await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:4000", "capacity_bucket:4000"],
    });
    await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:240-256"],
      isActive: false,
    });
    await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:480-512"],
      isExcluded: true,
    });
    await createProduct(categoryId, crawlRunId, {
      filterTags: ["capacity_bucket:about-2tb"],
      withCurrentPrice: false,
    });
    await createScaleProducts(categoryId, crawlRunId, 4_096);
    await maintenanceClient.$executeRaw`ANALYZE products`;

    const capturedQueries: Prisma.Sql[] = [];
    const availabilityClient = {
      $queryRaw: async <T>(query: Prisma.Sql) => {
        capturedQueries.push(query);
        return client.$queryRaw<T>(query);
      },
    };
    const availableTags = await readAvailableProductFacetTags(availabilityClient, 7);

    expect(availableTags).toEqual(["capacity_bucket:about-1tb", "capacity_bucket:4000"]);
    expect(availableTags).toHaveLength(2);
    expect(availableTags.length).toBeLessThanOrEqual(
      getPublicProductFacetAvailabilityTags(7).length,
    );
    expect(capturedQueries).toHaveLength(1);
    expect(capturedQueries[0]?.values).toContain(7);
    expect(capturedQueries[0]?.sql).not.toContain("capacity_bucket:about-1tb");

    const plan = await client.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
      Prisma.sql`EXPLAIN (COSTS, VERBOSE, FORMAT JSON) ${createAvailableProductFacetTagsQuery(
        7,
        getPublicProductFacetAvailabilityTags(7),
      )}`,
    );
    expect(JSON.stringify(plan)).toContain("products_filter_tags_idx");

    await client.sourceCategory.update({ where: { id: categoryId }, data: { enabled: false } });
    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([]);
  }, 30_000);
});

async function createCategory(): Promise<string> {
  const id = randomUUID();
  categoryIds.add(id);
  await client.sourceCategory.create({
    data: {
      id,
      igrp: 7,
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
): Promise<void> {
  const productId = randomUUID();
  productIds.add(productId);
  await client.product.create({
    data: {
      id: productId,
      sourceCategoryId: categoryId,
      ibuyToken: `facet-integration-${productId}`,
      name: "Facet integration SSD",
      normalizedName: "facet integration ssd",
      filterTags,
      sourceUrl: "https://example.invalid/ssd",
      isActive,
      isExcluded,
      firstSeenAt: new Date("2030-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });

  if (!withCurrentPrice) {
    return;
  }

  const snapshotId = randomUUID();
  snapshotIds.add(snapshotId);
  await client.priceSnapshot.create({
    data: {
      id: snapshotId,
      productId,
      price: 1_000,
      capturedAt: new Date("2030-01-01T00:00:00.000Z"),
      crawlRunId,
    },
  });
  await client.currentPrice.create({
    data: {
      productId,
      priceSnapshotId: snapshotId,
      lastSeenAt: new Date("2030-01-01T00:00:00.000Z"),
      priceChangedAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });
}

async function createScaleProducts(
  categoryId: string,
  crawlRunId: string,
  count: number,
): Promise<void> {
  const productRows = Array.from({ length: count }, (_, index) => {
    const id = randomUUID();
    productIds.add(id);
    return {
      id,
      sourceCategoryId: categoryId,
      ibuyToken: `facet-scale-${id}`,
      name: `Facet scale SSD ${index}`,
      normalizedName: `facet scale ssd ${index}`,
      filterTags: ["legacy:unknown"],
      sourceUrl: "https://example.invalid/ssd",
      isActive: true,
      isExcluded: false,
      firstSeenAt: new Date("2030-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2030-01-01T00:00:00.000Z"),
    };
  });
  const snapshotRows = productRows.map(({ id: productId }, index) => {
    const id = randomUUID();
    snapshotIds.add(id);
    return {
      id,
      productId,
      price: 2_000 + index,
      capturedAt: new Date(1_893_456_000_000 + index),
      crawlRunId,
    };
  });

  await client.product.createMany({ data: productRows });
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
