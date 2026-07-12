// packages/db/tests/price-report/reader.integration.test.ts
// 以隔離 PostgreSQL 驗證停用分類不會進入共用近期價格報告。

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readRecentPriceReport } from "../../src/price-report";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
const categoryIds = [randomUUID(), randomUUID()];
const productIds = [randomUUID(), randomUUID()];
const crawlRunIds = [randomUUID(), randomUUID()];
const snapshotIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

describeWithDatabase("readRecentPriceReport PostgreSQL integration", () => {
  let client: PrismaClient;

  beforeAll(() => {
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl as string }),
    });
  });

  afterAll(async () => {
    await client.priceSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
    await client.product.deleteMany({ where: { id: { in: productIds } } });
    await client.crawlRun.deleteMany({ where: { id: { in: crawlRunIds } } });
    await client.sourceCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await client.$disconnect();
  });

  it("excludes price changes from disabled source categories", async () => {
    const baseIgrp = 1_000_000 + Math.floor(Math.random() * 1_000_000);
    const baselineAt = new Date("2030-01-01T00:00:00.000Z");
    const changedAt = new Date("2030-01-02T12:00:00.000Z");

    await client.sourceCategory.createMany({
      data: [
        {
          id: categoryIds[0],
          igrp: baseIgrp,
          sourceName: "Enabled integration category",
          displayName: "Enabled category",
          enabled: true,
        },
        {
          id: categoryIds[1],
          igrp: baseIgrp + 1,
          sourceName: "Disabled integration category",
          displayName: "Disabled category",
          enabled: false,
        },
      ],
    });
    await client.product.createMany({
      data: [
        {
          id: productIds[0],
          sourceCategoryId: categoryIds[0],
          ibuyToken: `integration-enabled-${productIds[0]}`,
          name: "Enabled category GPU",
          normalizedName: "enabled category gpu",
          sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=12",
          firstSeenAt: baselineAt,
          lastSeenAt: changedAt,
        },
        {
          id: productIds[1],
          sourceCategoryId: categoryIds[1],
          ibuyToken: `integration-disabled-${productIds[1]}`,
          name: "Disabled category GPU",
          normalizedName: "disabled category gpu",
          sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=12",
          firstSeenAt: baselineAt,
          lastSeenAt: changedAt,
        },
      ],
    });
    await client.crawlRun.createMany({
      data: [
        {
          id: crawlRunIds[0],
          status: "SUCCESS_CHANGED",
          triggerType: "MANUAL",
          startedAt: baselineAt,
          finishedAt: baselineAt,
        },
        {
          id: crawlRunIds[1],
          status: "SUCCESS_CHANGED",
          triggerType: "MANUAL",
          startedAt: changedAt,
          finishedAt: changedAt,
        },
      ],
    });
    await client.priceSnapshot.createMany({
      data: [
        {
          id: snapshotIds[0],
          productId: productIds[0],
          price: 10_000,
          capturedAt: baselineAt,
          crawlRunId: crawlRunIds[0],
        },
        {
          id: snapshotIds[1],
          productId: productIds[0],
          price: 9_000,
          capturedAt: changedAt,
          crawlRunId: crawlRunIds[1],
        },
        {
          id: snapshotIds[2],
          productId: productIds[1],
          price: 10_000,
          capturedAt: baselineAt,
          crawlRunId: crawlRunIds[0],
        },
        {
          id: snapshotIds[3],
          productId: productIds[1],
          price: 9_000,
          capturedAt: changedAt,
          crawlRunId: crawlRunIds[1],
        },
      ],
    });

    const report = await readRecentPriceReport(client, {
      since: new Date("2030-01-02T00:00:00.000Z"),
      until: new Date("2030-01-03T00:00:00.000Z"),
      filters: { includeNewProducts: false },
    });

    expect(report.priceChanges.map(({ productId }) => productId)).toEqual([productIds[0]]);
    expect(report.newProducts).toEqual([]);
  });
});
