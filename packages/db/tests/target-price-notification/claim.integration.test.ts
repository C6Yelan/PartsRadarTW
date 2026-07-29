// packages/db/tests/target-price-notification/claim.integration.test.ts
// 以 disposable PostgreSQL 驗證目標價通知的 bounded high-water scan、原子 claim 與並發語意。

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimDueTargetPriceNotifications,
  type TargetPriceNotificationClaimClient,
} from "../../src/target-price-notification";
import {
  createTargetPriceNotificationClaimQuery,
  createTargetPriceNotificationRoundInitializationQuery,
  enforceTargetPriceNotificationBoundedPlan,
} from "../../src/target-price-notification/claim";
import type { TargetPriceNotificationClaimQueryClient } from "../../src/target-price-notification/types";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!testDatabaseUrl || !migrationDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL and MIGRATION_DATABASE_URL are required for PostgreSQL integration tests.",
  );
}

const productIds = new Set<string>();
const snapshotIds = new Set<string>();
const watchIds = new Set<string>();
let categoryId: string;
let crawlRunId: string;
let client: PrismaClient;
let migrationClient: PrismaClient;

beforeAll(async () => {
  client = createClient(testDatabaseUrl);
  migrationClient = createClient(migrationDatabaseUrl);
  const category = await client.sourceCategory.create({
    data: {
      igrp: 1_500_000_000 + Math.floor(Math.random() * 100_000_000),
      sourceName: `target-claim-${randomUUID()}`,
      displayName: "Target claim integration",
    },
  });
  const crawlRun = await client.crawlRun.create({
    data: {
      status: "SUCCESS_CHANGED",
      triggerType: "MANUAL",
      finishedAt: new Date("2030-01-01T00:30:00.000Z"),
    },
  });
  categoryId = category.id;
  crawlRunId = crawlRun.id;
});

beforeEach(async () => {
  await resetScanState();
});

afterEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures();
  await client.crawlRun.delete({ where: { id: crawlRunId } });
  await client.sourceCategory.delete({ where: { id: categoryId } });
  await Promise.all([client.$disconnect(), migrationClient.$disconnect()]);
});

describe("target price notification PostgreSQL claim", () => {
  it("claims only rows that satisfy the complete due predicate matrix", async () => {
    const now = new Date("2030-01-01T01:00:00.000Z");
    const staleClaimBefore = new Date("2030-01-01T00:45:00.000Z");
    const reached = await createWatchFixture({ label: "reached", updatedOffsetMs: 1 });
    await createWatchFixture({ label: "above-target", price: 12_000, updatedOffsetMs: 2 });
    await createWatchFixture({ label: "inactive", isActive: false, updatedOffsetMs: 3 });
    await createWatchFixture({ label: "excluded", isExcluded: true, updatedOffsetMs: 4 });
    await createWatchFixture({ label: "no-current", hasCurrentPrice: false, updatedOffsetMs: 5 });
    await createWatchFixture({ label: "disabled", enabled: false, updatedOffsetMs: 6 });
    await createWatchFixture({
      label: "already-notified",
      lastNotifiedAt: new Date("2030-01-01T00:50:00.000Z"),
      updatedOffsetMs: 7,
    });
    await createWatchFixture({
      label: "fresh-claim",
      notificationClaimedAt: new Date("2030-01-01T00:55:00.000Z"),
      updatedOffsetMs: 8,
    });
    const stale = await createWatchFixture({
      label: "stale-claim",
      notificationClaimedAt: new Date("2030-01-01T00:40:00.000Z"),
      updatedOffsetMs: 9,
    });
    await createWatchFixture({
      label: "old-snapshot",
      notificationCursorAt: new Date("2030-01-01T00:40:00.000Z"),
      capturedAt: new Date("2030-01-01T00:30:00.000Z"),
      updatedOffsetMs: 10,
    });

    const originalVersions = await client.discordTargetPriceWatch.findMany({
      where: { id: { in: [reached.watchId, stale.watchId] } },
      select: { id: true, updatedAt: true },
    });
    const result = await claimDueTargetPriceNotifications(client, {
      claimedAt: now,
      staleClaimBefore,
      scanLimit: 256,
      claimLimit: 25,
    });

    expect(result.scannedCount).toBe(8);
    expect(result.watches.map(({ id }) => id)).toEqual([reached.watchId, stale.watchId]);
    expect(result.watches).toEqual([
      expect.objectContaining({
        id: reached.watchId,
        product: expect.objectContaining({
          currentPrice: {
            priceSnapshot: expect.objectContaining({ price: 9_000, currency: "TWD" }),
          },
        }),
      }),
      expect.objectContaining({ id: stale.watchId }),
    ]);
    expect(
      await client.discordTargetPriceWatch.findMany({
        where: { id: { in: [reached.watchId, stale.watchId] } },
        orderBy: { id: "asc" },
        select: { id: true, notificationClaimedAt: true, updatedAt: true },
      }),
    ).toEqual(
      originalVersions
        .map((watch) => ({ ...watch, notificationClaimedAt: now }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it("keeps both the scanned window and claimed result bounded at budget plus many", async () => {
    await expect(claimAt("2030-01-01T01:00:00.000Z", 12, 5)).resolves.toEqual({
      scannedCount: 0,
      watches: [],
    });
    const fixtures = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        createWatchFixture({
          label: `boundary-${index}`,
          updatedOffsetMs: index,
        }),
      ),
    );

    const result = await claimAt("2030-01-01T01:01:00.000Z", 12, 5);

    expect(result.scannedCount).toBe(12);
    expect(result.watches).toHaveLength(5);
    expect(result.watches.map(({ id }) => id)).toEqual(
      fixtures.slice(0, 5).map(({ watchId }) => watchId),
    );
  });

  it("rejects caller-supplied work budgets above the fixed maximum", async () => {
    await expect(
      claimDueTargetPriceNotifications(client, {
        claimedAt: new Date("2030-01-01T01:00:00.000Z"),
        staleClaimBefore: new Date("2030-01-01T00:45:00.000Z"),
        scanLimit: 257,
        claimLimit: 25,
      }),
    ).rejects.toThrow("work budget exceeds the fixed maximum");
    await expect(
      claimDueTargetPriceNotifications(client, {
        claimedAt: new Date("2030-01-01T01:00:00.000Z"),
        staleClaimBefore: new Date("2030-01-01T00:45:00.000Z"),
        scanLimit: 256,
        claimLimit: 26,
      }),
    ).rejects.toThrow("work budget exceeds the fixed maximum");
  });

  it("preserves stable due order across full claim batches without skipping rows", async () => {
    const fixtures = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createWatchFixture({
          label: `stable-order-${index}`,
          updatedOffsetMs: index,
        }),
      ),
    );
    const processed: string[] = [];

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const result = await claimAt(`2030-01-01T01:0${cycle}:00.000Z`, 12, 5);
      const claimedIds = result.watches.map(({ id }) => id);
      processed.push(...claimedIds);
      await markClaimedWatchesComplete(claimedIds);
    }

    expect(processed).toEqual(fixtures.map(({ watchId }) => watchId));
    expect(new Set(processed).size).toBe(fixtures.length);
  });

  it("finishes a fixed high-water round even while newer watches arrive", async () => {
    const initial = await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        createWatchFixture({
          label: `initial-${index}`,
          updatedOffsetMs: index,
        }),
      ),
    );
    const processed: string[] = [];
    let newTail: Array<{ productId: string; watchId: string }> = [];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const result = await claimAt(`2030-01-01T01:0${cycle}:00.000Z`, 3, 3);
      processed.push(...result.watches.map(({ id }) => id));
      await markClaimedWatchesComplete(result.watches.map(({ id }) => id));

      if (cycle === 0) {
        newTail = await Promise.all(
          Array.from({ length: 6 }, (_, index) =>
            createWatchFixture({
              label: `new-tail-${index}`,
              updatedOffsetMs: 10_000 + index,
            }),
          ),
        );
      }
    }

    expect(processed).toEqual(initial.map(({ watchId }) => watchId));
    expect(new Set(processed).size).toBe(initial.length);

    for (let cycle = 3; cycle < 5; cycle += 1) {
      const result = await claimAt(`2030-01-01T01:0${cycle}:00.000Z`, 3, 3);
      processed.push(...result.watches.map(({ id }) => id));
      await markClaimedWatchesComplete(result.watches.map(({ id }) => id));
    }

    expect(processed).toEqual([...initial, ...newTail].map(({ watchId }) => watchId));
    expect(new Set(processed).size).toBe(initial.length + newTail.length);
  });

  it("serializes two workers and atomically claims disjoint rows", async () => {
    const fixtures = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        createWatchFixture({
          label: `concurrent-${index}`,
          updatedOffsetMs: index,
        }),
      ),
    );
    const secondClient = createClient(testDatabaseUrl);
    const firstClaimed = createDeferred<void>();
    const releaseFirst = createDeferred<void>();
    const secondLockAttempted = createDeferred<void>();
    const firstWorker: TargetPriceNotificationClaimClient = {
      $transaction: (callback) =>
        client.$transaction(async (transaction) => {
          const result = await callback(transaction);
          firstClaimed.resolve(undefined);
          await releaseFirst.promise;
          return result;
        }),
    };
    const secondWorker: TargetPriceNotificationClaimClient = {
      $transaction: (callback) =>
        secondClient.$transaction((transaction) =>
          callback({
            $queryRaw: <T>(query: Prisma.Sql): Promise<T> => {
              if (query.sql.includes('AS "roundUpperUpdatedAt"')) {
                secondLockAttempted.resolve(undefined);
              }
              return transaction.$queryRaw<T>(query);
            },
          }),
        ),
    };
    let secondSettled = false;
    const firstPromise = claimAtWithClient(firstWorker, "2030-01-01T01:00:00.000Z", 40, 25);
    await firstClaimed.promise;
    const secondPromise = claimAtWithClient(
      secondWorker,
      "2030-01-01T01:00:00.000Z",
      40,
      25,
    ).finally(() => {
      secondSettled = true;
    });

    try {
      await secondLockAttempted.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(secondSettled).toBe(false);

      releaseFirst.resolve(undefined);
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      const firstIds = new Set(first.watches.map(({ id }) => id));
      const secondIds = new Set(second.watches.map(({ id }) => id));

      expect(first.scannedCount).toBe(40);
      expect(second.scannedCount).toBe(15);
      expect(firstIds.size + secondIds.size).toBe(fixtures.length);
      expect([...firstIds].filter((id) => secondIds.has(id))).toEqual([]);
    } finally {
      releaseFirst.resolve(undefined);
      await Promise.allSettled([firstPromise, secondPromise]);
      await secondClient.$disconnect();
    }
  });

  it("rolls cursor and claims back together, then reclaims the same rows", async () => {
    const fixtures = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        createWatchFixture({
          label: `rollback-${index}`,
          updatedOffsetMs: index,
        }),
      ),
    );
    let rolledBackIds: string[] = [];

    await expect(
      client.$transaction(async (transaction) => {
        const transactionAdapter: TargetPriceNotificationClaimClient = {
          $transaction: async (callback) => callback(transaction),
        };
        const result = await claimDueTargetPriceNotifications(transactionAdapter, {
          claimedAt: new Date("2030-01-01T01:00:00.000Z"),
          staleClaimBefore: new Date("2030-01-01T00:45:00.000Z"),
          scanLimit: 3,
          claimLimit: 3,
        });
        rolledBackIds = result.watches.map(({ id }) => id);
        throw new Error("rollback target claim integration transaction");
      }),
    ).rejects.toThrow("rollback target claim integration transaction");

    expect(
      await client.discordTargetPriceWatch.count({
        where: { notificationClaimedAt: { not: null } },
      }),
    ).toBe(0);
    const retried = await claimAt("2030-01-01T01:01:00.000Z", 3, 3);
    expect(rolledBackIds).toEqual(fixtures.map(({ watchId }) => watchId));
    expect(retried.watches.map(({ id }) => id)).toEqual(rolledBackIds);
  });

  it("recovers a committed claim after its worker crashes and the lease expires", async () => {
    const fixture = await createWatchFixture({
      label: "lease-recovery",
      updatedOffsetMs: 1,
    });
    const claimed = await claimAt("2030-01-01T01:00:00.000Z", 3, 3);

    expect(claimed.watches.map(({ id }) => id)).toEqual([fixture.watchId]);
    await expect(claimAt("2030-01-01T01:10:00.000Z", 3, 3)).resolves.toMatchObject({
      watches: [],
    });
    await expect(claimAt("2030-01-01T01:16:00.000Z", 3, 3)).resolves.toMatchObject({
      watches: [expect.objectContaining({ id: fixture.watchId })],
    });
  });

  it("keeps bounded planner settings local to the claim transaction", async () => {
    const before = await readPlannerSettings(client);
    const inside = await client.$transaction(async (transaction) => {
      await enforceTargetPriceNotificationBoundedPlan(transaction);
      return readPlannerSettings(transaction);
    });
    const after = await readPlannerSettings(client);

    expect(inside).toEqual({
      bitmapScan: "off",
      fromCollapseLimit: "1",
      indexOnlyScan: "on",
      indexScan: "on",
      joinCollapseLimit: "1",
      sequentialScan: "off",
    });
    expect(after).toEqual(before);
  });

  it("fails closed when the bounded partial index preflight is not ready", async () => {
    const queryClient: TargetPriceNotificationClaimQueryClient = {
      $queryRaw: async <T>() =>
        [
          {
            bitmapScan: "off",
            fromCollapseLimit: "1",
            indexOnlyScan: "on",
            indexReady: false,
            indexScan: "on",
            joinCollapseLimit: "1",
            sequentialScan: "off",
          },
        ] as unknown as T,
    };

    await expect(enforceTargetPriceNotificationBoundedPlan(queryClient)).rejects.toThrow(
      "bounded-plan guard was not applied",
    );
  });

  it("uses the pending scan index and materializes only the configured scale window", async () => {
    const scale = 2_048;
    const scanLimit = 64;
    const claimLimit = 25;
    const baseTime = new Date("2030-01-01T00:00:00.000Z").getTime();
    const products = Array.from({ length: scale }, (_, index) => {
      const productId = randomUUID();
      const snapshotId = randomUUID();
      const historySnapshotIds = Array.from({ length: 4 }, () => randomUUID());
      const watchId = randomUUID();
      productIds.add(productId);
      snapshotIds.add(snapshotId);
      for (const historySnapshotId of historySnapshotIds) {
        snapshotIds.add(historySnapshotId);
      }
      watchIds.add(watchId);

      return { productId, snapshotId, historySnapshotIds, watchId, index };
    });
    const lastProduct = products.at(-1);

    if (!lastProduct) {
      throw new Error("Target notification scale fixture is empty.");
    }

    await client.product.createMany({
      data: products.map(({ productId, index }) => ({
        id: productId,
        sourceCategoryId: categoryId,
        ibuyToken: `scale-${index}-${productId}`,
        name: `Scale target product ${index}`,
        normalizedName: `scale target product ${index}`,
        sourceUrl: `https://example.invalid/scale/${productId}`,
        firstSeenAt: new Date(baseTime),
        lastSeenAt: new Date(baseTime),
      })),
    });
    await client.priceSnapshot.createMany({
      data: products.flatMap(({ productId, snapshotId, historySnapshotIds, index }) => [
        {
          id: snapshotId,
          productId,
          price: index < 4 ? 9_000 : 12_000,
          capturedAt: new Date(baseTime + 30 * 60_000),
          crawlRunId,
        },
        ...historySnapshotIds.map((historySnapshotId, historyIndex) => ({
          id: historySnapshotId,
          productId,
          price: 13_000,
          capturedAt: new Date(baseTime - (historyIndex + 1) * 60_000),
          crawlRunId,
        })),
      ]),
    });
    await client.currentPrice.createMany({
      data: products.map(({ productId, snapshotId }) => ({
        productId,
        priceSnapshotId: snapshotId,
        lastSeenAt: new Date(baseTime + 30 * 60_000),
        priceChangedAt: new Date(baseTime + 30 * 60_000),
      })),
    });
    await client.discordTargetPriceWatch.createMany({
      data: products.map(({ productId, watchId, index }) => ({
        id: watchId,
        discordUserId: `scale-user-${index}`,
        productId,
        targetPrice: 10_000,
        notificationCursorAt: new Date(baseTime),
        createdAt: new Date(baseTime + index),
        updatedAt: new Date(baseTime + index),
      })),
    });
    await client.$executeRaw`
      UPDATE discord_target_price_watches
      SET enabled = false
      WHERE discord_user_id LIKE 'scale-user-%'
    `;
    await client.$executeRaw`
      UPDATE discord_target_price_watches
      SET enabled = true
      WHERE discord_user_id LIKE 'scale-user-%'
    `;
    await migrationClient.$executeRaw`
      ANALYZE discord_target_price_watches, products, current_prices, price_snapshots
    `;
    const initializationQuery = createTargetPriceNotificationRoundInitializationQuery(
      new Date("2030-01-01T00:45:00.000Z"),
    );
    const initializationPlan = await client.$transaction(async (transaction) => {
      await enforceTargetPriceNotificationBoundedPlan(transaction);
      return transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
        Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON) ${initializationQuery}`,
      );
    });
    const initializationPlanNodes = collectPlanNodes(initializationPlan);
    const highWaterIndexNodes = initializationPlanNodes.filter(
      (node) =>
        node["Index Name"] === "discord_target_price_watches_pending_scan_idx" &&
        node.Alias === "watch",
    );
    const unboundedHighWaterScans = initializationPlanNodes.filter(
      (node) =>
        String(node["Node Type"]).includes("Scan") &&
        node["Relation Name"] === "discord_target_price_watches" &&
        planNodeExaminedRows(node) > 1,
    );

    expect(highWaterIndexNodes).toHaveLength(1);
    expect(highWaterIndexNodes[0]?.["Scan Direction"]).toBe("Backward");
    expect(planNodeExaminedRows(highWaterIndexNodes[0] ?? {})).toBe(1);
    expect(unboundedHighWaterScans).toEqual([]);

    const claimQuery = createTargetPriceNotificationClaimQuery(
      {
        claimedAt: new Date("2030-01-01T01:00:00.000Z"),
        staleClaimBefore: new Date("2030-01-01T00:45:00.000Z"),
        scanLimit,
        claimLimit,
      },
      {
        cursorUpdatedAt: null,
        cursorWatchId: null,
        roundUpperUpdatedAt: new Date(baseTime + scale - 1),
        roundUpperWatchId: lastProduct.watchId,
      },
    );
    const plan = await client.$transaction(async (transaction) => {
      await enforceTargetPriceNotificationBoundedPlan(transaction);
      return transaction.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
        Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT JSON) ${claimQuery}`,
      );
    });
    const planText = JSON.stringify(plan);
    const planNodes = collectPlanNodes(plan);
    const scanCandidatesNode = planNodes.find(
      (node) => node["Subplan Name"] === "CTE scan_candidates",
    );
    const pendingScanNodes = planNodes.filter(
      (node) =>
        node["Index Name"] === "discord_target_price_watches_pending_scan_idx" &&
        node.Alias === "candidate",
    );
    const unboundedRelationScans = planNodes.filter(
      (node) =>
        String(node["Node Type"]).includes("Scan") &&
        ["discord_target_price_watches", "products", "current_prices", "price_snapshots"].includes(
          String(node["Relation Name"]),
        ) &&
        planNodeExaminedRows(node) > scanLimit * 2,
    );
    const oversizedSortOrHashNodes = planNodes.filter(
      (node) =>
        (node["Node Type"] === "Sort" || node["Node Type"] === "Hash") &&
        Number(node["Actual Rows"]) > scanLimit,
    );
    const indexes = await client.$queryRaw<Array<{ indexdef: string; indexname: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'discord_target_price_watches_pending_scan_idx'
    `;

    expect(planText).toContain("discord_target_price_watches_pending_scan_idx");
    expect(scanCandidatesNode?.["Actual Rows"]).toBe(scanLimit);
    expect(
      pendingScanNodes.reduce(
        (rows, node) => rows + Number(node["Actual Rows"]) * Number(node["Actual Loops"]),
        0,
      ),
    ).toBe(scanLimit);
    expect(unboundedRelationScans).toEqual([]);
    expect(oversizedSortOrHashNodes).toEqual([]);
    expect(claimQuery.sql).toContain("scan_candidates AS MATERIALIZED");
    expect(claimQuery.sql).toContain("FOR UPDATE OF watch SKIP LOCKED");
    expect(claimQuery.sql).not.toContain(products[0]?.productId);
    expect(indexes).toEqual([
      {
        indexname: "discord_target_price_watches_pending_scan_idx",
        indexdef: expect.stringContaining("(updated_at, id)"),
      },
    ]);
    expect(indexes[0]?.indexdef).toContain(
      "WHERE ((enabled = true) AND (last_notified_at IS NULL))",
    );
  });
});

function collectPlanNodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(collectPlanNodes);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const nested = Object.values(record).flatMap(collectPlanNodes);

  return typeof record["Node Type"] === "string" ? [record, ...nested] : nested;
}

function planNodeExaminedRows(node: Record<string, unknown>): number {
  return (
    (Number(node["Actual Rows"]) +
      Number(node["Rows Removed by Filter"] ?? 0) +
      Number(node["Rows Removed by Index Recheck"] ?? 0)) *
    Number(node["Actual Loops"])
  );
}

async function readPlannerSettings(client: {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}): Promise<{
  bitmapScan: string;
  fromCollapseLimit: string;
  indexOnlyScan: string;
  indexScan: string;
  joinCollapseLimit: string;
  sequentialScan: string;
}> {
  const settings = await client.$queryRaw<
    Array<{
      bitmapScan: string;
      fromCollapseLimit: string;
      indexOnlyScan: string;
      indexScan: string;
      joinCollapseLimit: string;
      sequentialScan: string;
    }>
  >(Prisma.sql`
    SELECT
      current_setting('enable_bitmapscan') AS "bitmapScan",
      current_setting('enable_seqscan') AS "sequentialScan",
      current_setting('enable_indexscan') AS "indexScan",
      current_setting('enable_indexonlyscan') AS "indexOnlyScan",
      current_setting('join_collapse_limit') AS "joinCollapseLimit",
      current_setting('from_collapse_limit') AS "fromCollapseLimit"
  `);
  const setting = settings[0];

  if (!setting) {
    throw new Error("PostgreSQL did not return planner settings.");
  }
  return setting;
}

function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

async function createWatchFixture({
  label,
  price = 9_000,
  targetPrice = 10_000,
  capturedAt = new Date("2030-01-01T00:30:00.000Z"),
  notificationCursorAt = new Date("2030-01-01T00:00:00.000Z"),
  notificationClaimedAt = null,
  lastNotifiedAt = null,
  enabled = true,
  isActive = true,
  isExcluded = false,
  hasCurrentPrice = true,
  updatedOffsetMs = 0,
}: {
  label: string;
  price?: number;
  targetPrice?: number;
  capturedAt?: Date;
  notificationCursorAt?: Date | null;
  notificationClaimedAt?: Date | null;
  lastNotifiedAt?: Date | null;
  enabled?: boolean;
  isActive?: boolean;
  isExcluded?: boolean;
  hasCurrentPrice?: boolean;
  updatedOffsetMs?: number;
}): Promise<{ productId: string; watchId: string }> {
  const productId = randomUUID();
  const watchId = randomUUID();
  const snapshotId = randomUUID();
  const updatedAt = new Date("2030-01-01T00:00:00.000Z");
  updatedAt.setTime(updatedAt.getTime() + updatedOffsetMs);
  productIds.add(productId);
  watchIds.add(watchId);

  await client.product.create({
    data: {
      id: productId,
      sourceCategoryId: categoryId,
      ibuyToken: `${label}-${productId}`,
      name: `Target claim ${label}`,
      normalizedName: `target claim ${label}`,
      sourceUrl: `https://example.invalid/target/${productId}`,
      isActive,
      isExcluded,
      firstSeenAt: updatedAt,
      lastSeenAt: updatedAt,
    },
  });
  if (hasCurrentPrice) {
    snapshotIds.add(snapshotId);
    await client.priceSnapshot.create({
      data: {
        id: snapshotId,
        productId,
        price,
        capturedAt,
        crawlRunId,
      },
    });
    await client.currentPrice.create({
      data: {
        productId,
        priceSnapshotId: snapshotId,
        lastSeenAt: capturedAt,
        priceChangedAt: capturedAt,
      },
    });
  }
  await client.discordTargetPriceWatch.create({
    data: {
      id: watchId,
      discordUserId: `integration-${label}-${watchId}`,
      productId,
      targetPrice,
      enabled,
      disabledAt: enabled ? null : updatedAt,
      lastNotifiedAt,
      notificationClaimedAt,
      notificationCursorAt,
      createdAt: updatedAt,
      updatedAt,
    },
  });

  return { productId, watchId };
}

async function claimAt(claimedAt: string, scanLimit: number, claimLimit: number) {
  return claimAtWithClient(client, claimedAt, scanLimit, claimLimit);
}

async function claimAtWithClient(
  claimClient: TargetPriceNotificationClaimClient,
  claimedAt: string,
  scanLimit: number,
  claimLimit: number,
) {
  const now = new Date(claimedAt);

  return claimDueTargetPriceNotifications(claimClient, {
    claimedAt: now,
    staleClaimBefore: new Date(now.getTime() - 15 * 60_000),
    scanLimit,
    claimLimit,
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) {
        throw new Error("Deferred promise resolver was not initialized.");
      }
      resolvePromise(value);
    },
  };
}

async function markClaimedWatchesComplete(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await client.discordTargetPriceWatch.updateMany({
    where: { id: { in: ids } },
    data: {
      lastNotifiedAt: new Date("2030-01-01T02:00:00.000Z"),
      notificationClaimedAt: null,
    },
  });
}

async function resetScanState(): Promise<void> {
  await client.discordTargetPriceNotificationScanState.update({
    where: { id: 1 },
    data: {
      cursorUpdatedAt: null,
      cursorWatchId: null,
      roundUpperUpdatedAt: null,
      roundUpperWatchId: null,
    },
  });
}

async function cleanupFixtures(): Promise<void> {
  const products = [...productIds];
  const snapshots = [...snapshotIds];
  const watches = [...watchIds];

  if (watches.length > 0) {
    await client.discordTargetPriceWatch.deleteMany({ where: { id: { in: watches } } });
  }
  if (products.length > 0) {
    await client.currentPrice.deleteMany({ where: { productId: { in: products } } });
  }
  if (snapshots.length > 0) {
    await client.priceSnapshot.deleteMany({ where: { id: { in: snapshots } } });
  }
  if (products.length > 0) {
    await client.product.deleteMany({ where: { id: { in: products } } });
  }
  productIds.clear();
  snapshotIds.clear();
  watchIds.clear();
  await resetScanState();
}
