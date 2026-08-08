// scripts/e2e-visual-ssr-fixture.ts
// 建立或清除 mocked browser suite 在真實 SSR document boundary 所需的最小資料。

import { VISUAL_PRODUCT_FIXTURE } from "../apps/web/e2e/support/visual-product-fixture";
import { createPrismaClient } from "../packages/db/src/client";
import { validateTestDatabaseEnvironment } from "./test-database-safety.mjs";

const CRAWL_RUN_ID = "30000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "30000000-0000-4000-8000-000000000002";
const action = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

validateTestDatabaseEnvironment(process.env, { requiredUrls: ["DATABASE_URL"] });
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (action !== "seed" && action !== "cleanup") {
  throw new Error("Expected fixture action: seed or cleanup.");
}

const prisma = createPrismaClient(databaseUrl);

async function main() {
  const observedAt = new Date(VISUAL_PRODUCT_FIXTURE.observedAt);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.currentPrice.deleteMany({ where: { productId: VISUAL_PRODUCT_FIXTURE.id } });
      await tx.priceSnapshot.deleteMany({ where: { productId: VISUAL_PRODUCT_FIXTURE.id } });
      await tx.product.deleteMany({ where: { id: VISUAL_PRODUCT_FIXTURE.id } });
      await tx.crawlRun.deleteMany({ where: { id: CRAWL_RUN_ID } });
      await tx.sourceCategory.deleteMany({ where: { id: VISUAL_PRODUCT_FIXTURE.category.id } });

      if (action === "cleanup") return;

      await tx.sourceCategory.create({
        data: {
          id: VISUAL_PRODUCT_FIXTURE.category.id,
          igrp: VISUAL_PRODUCT_FIXTURE.category.igrp,
          sourceName: VISUAL_PRODUCT_FIXTURE.category.sourceName,
          displayName: VISUAL_PRODUCT_FIXTURE.category.displayName,
          enabled: true,
          lastCheckedAt: observedAt,
          lastSuccessAt: observedAt,
        },
      });
      await tx.crawlRun.create({
        data: {
          id: CRAWL_RUN_ID,
          status: "SUCCESS_CHANGED",
          triggerType: "MANUAL",
          startedAt: observedAt,
          finishedAt: observedAt,
        },
      });
      await tx.product.create({
        data: {
          id: VISUAL_PRODUCT_FIXTURE.id,
          sourceCategoryId: VISUAL_PRODUCT_FIXTURE.category.id,
          ibuyToken: "VISUAL-READY-PRODUCT",
          name: VISUAL_PRODUCT_FIXTURE.name,
          normalizedName: VISUAL_PRODUCT_FIXTURE.name.toLocaleLowerCase("zh-TW"),
          sourceUrl: "https://example.invalid/visual-ready-product",
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
        },
      });
      await tx.priceSnapshot.create({
        data: {
          id: SNAPSHOT_ID,
          productId: VISUAL_PRODUCT_FIXTURE.id,
          price: VISUAL_PRODUCT_FIXTURE.amount,
          capturedAt: observedAt,
          crawlRunId: CRAWL_RUN_ID,
        },
      });
      await tx.currentPrice.create({
        data: {
          productId: VISUAL_PRODUCT_FIXTURE.id,
          priceSnapshotId: SNAPSHOT_ID,
          lastSeenAt: observedAt,
          priceChangedAt: observedAt,
        },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main();
