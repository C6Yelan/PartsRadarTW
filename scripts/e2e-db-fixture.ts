// scripts/e2e-db-fixture.ts
// 建立與清除 DB-backed public smoke 所需的最小隔離資料與本機圖片。

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPrismaClient } from "../packages/db/src/client";
import { validateTestDatabaseEnvironment } from "./test-database-safety.mjs";

const CATEGORY_ID = "20000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000002";
const CRAWL_RUN_ID = "20000000-0000-4000-8000-000000000003";
const OLD_SNAPSHOT_ID = "20000000-0000-4000-8000-000000000004";
const CURRENT_SNAPSHOT_ID = "20000000-0000-4000-8000-000000000005";
const IMAGE_BYTES = Uint8Array.from(
  Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA", "base64"),
);

const action = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
const storageDir = process.env.PRODUCT_IMAGE_STORAGE_DIR;

validateTestDatabaseEnvironment(process.env, { requiredUrls: ["DATABASE_URL"] });
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!storageDir) {
  throw new Error("PRODUCT_IMAGE_STORAGE_DIR is required.");
}
if (action !== "seed" && action !== "cleanup") {
  throw new Error("Expected fixture action: seed or cleanup.");
}

const prisma = createPrismaClient(databaseUrl);

async function main() {
  try {
    if (action === "seed") {
      const now = new Date();
      const oldCapturedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const currentCapturedAt = new Date(now.getTime() - 60 * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.sourceCategory.create({
          data: {
            id: CATEGORY_ID,
            igrp: 4,
            sourceName: "處理器 CPU",
            displayName: "CPU",
            enabled: true,
            lastCheckedAt: now,
            lastSuccessAt: now,
          },
        });
        await tx.crawlRun.create({
          data: {
            id: CRAWL_RUN_ID,
            status: "SUCCESS_CHANGED",
            triggerType: "MANUAL",
            startedAt: oldCapturedAt,
            finishedAt: currentCapturedAt,
          },
        });
        await tx.product.create({
          data: {
            id: PRODUCT_ID,
            sourceCategoryId: CATEGORY_ID,
            ibuyToken: "E2E-PUBLIC-SMOKE",
            name: "E2E 公開 API 測試處理器",
            normalizedName: "e2e 公開 api 測試處理器",
            vendorSlug: "e2e",
            vendorName: "E2E",
            primaryImageUrl: "https://example.invalid/e2e-product.webp",
            primaryImageCheckedAt: now,
            imageCachedAt: now,
            sourceUrl: "https://example.invalid/e2e-product",
            firstSeenAt: oldCapturedAt,
            lastSeenAt: currentCapturedAt,
          },
        });
        await tx.priceSnapshot.createMany({
          data: [
            {
              id: OLD_SNAPSHOT_ID,
              productId: PRODUCT_ID,
              price: 1200,
              capturedAt: oldCapturedAt,
              crawlRunId: CRAWL_RUN_ID,
            },
            {
              id: CURRENT_SNAPSHOT_ID,
              productId: PRODUCT_ID,
              price: 1000,
              capturedAt: currentCapturedAt,
              crawlRunId: CRAWL_RUN_ID,
            },
          ],
        });
        await tx.currentPrice.create({
          data: {
            productId: PRODUCT_ID,
            priceSnapshotId: CURRENT_SNAPSHOT_ID,
            lastSeenAt: currentCapturedAt,
            priceChangedAt: currentCapturedAt,
          },
        });
      });

      await mkdir(storageDir, { recursive: true });
      await writeFile(join(storageDir, `${PRODUCT_ID}.webp`), IMAGE_BYTES);
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.currentPrice.deleteMany({ where: { productId: PRODUCT_ID } });
        await tx.priceSnapshot.deleteMany({ where: { productId: PRODUCT_ID } });
        await tx.product.deleteMany({ where: { id: PRODUCT_ID } });
        await tx.crawlRun.deleteMany({ where: { id: CRAWL_RUN_ID } });
        await tx.sourceCategory.deleteMany({ where: { id: CATEGORY_ID } });
      });
      await rm(join(storageDir, `${PRODUCT_ID}.webp`), { force: true });
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
