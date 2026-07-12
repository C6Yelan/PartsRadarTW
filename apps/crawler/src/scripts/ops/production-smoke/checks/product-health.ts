// apps/crawler/src/scripts/ops/production-smoke/checks/product-health.ts
// 檢查 active 商品數與商品圖片快取缺漏。

import { access } from "node:fs/promises";
import { join } from "node:path";
import { countStatus, fail, ok, warn, worseStatus } from "../results";
import type { ProductionSmokeClient, ProductionSmokeOptions, SmokeCheckResult } from "../types";

// 確認 production DB 仍有可展示的 active 商品，避免 crawler 或資料寫入異常造成商品清空。
export async function checkActiveProductCount(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const count = await client.product.count({
    where: displayReadyProductWhere(),
  });
  const message = `${count} display-ready active product(s)`;

  return count < options.minActiveProducts
    ? fail("active products", message)
    : ok("active products", message);
}

// 檢查 display-ready active 商品是否缺少本地 WebP 圖片快取。
export async function checkMissingProductImages(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const products = await client.product.findMany({
    where: displayReadyProductWhere(),
    select: {
      id: true,
    },
  });
  let missingCount = 0;

  for (const product of products) {
    if (!(await pathExists(join(options.productImageStorageDir, `${product.id}.webp`)))) {
      missingCount += 1;
    }
  }

  const missingPercent = products.length === 0 ? 0 : (missingCount / products.length) * 100;
  const countBasedStatus = countStatus(
    missingCount,
    options.missingImageWarnCount,
    options.missingImageFailCount,
  );
  const percentBasedStatus = countStatus(
    missingPercent,
    options.missingImageWarnPercent,
    options.missingImageFailPercent,
  );

  return {
    name: "missing product images",
    status: worseStatus(countBasedStatus, percentBasedStatus),
    message: `${missingCount}/${products.length} (${missingPercent.toFixed(2)}%) display-ready product image(s) missing`,
  };
}

// 找出近期價格仍會引用、volume 已有 WebP，但 DB 尚未標記 cache-ready 的 inactive 商品。
export async function checkHistoricalImageCacheMetadata(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const retentionCutoff = new Date(
    now.getTime() - options.imageInactiveRetentionDays * 24 * 60 * 60 * 1000,
  );
  const products = await client.product.findMany({
    where: {
      isActive: false,
      primaryImageUrl: { not: null },
      imageCachedAt: null,
      priceSnapshots: { some: { capturedAt: { gte: retentionCutoff } } },
    },
    select: { id: true },
  });
  let driftCount = 0;

  for (const product of products) {
    if (await pathExists(join(options.productImageStorageDir, `${product.id}.webp`))) {
      driftCount += 1;
    }
  }

  const message = `${driftCount}/${products.length} recent inactive product image(s) have WebP files without cache-ready metadata`;
  return driftCount === 0
    ? ok("historical image cache metadata", message)
    : warn("historical image cache metadata", message);
}

// 定義 production smoke 中「可展示商品」的共用條件，供商品數與圖片快取檢查一致使用。
function displayReadyProductWhere() {
  return {
    isActive: true,
    primaryImageUrl: {
      not: null,
    },
    primaryImageCheckedAt: {
      not: null,
    },
    currentPrice: {
      isNot: null,
    },
  } as const;
}

// 檢查商品圖片快取檔是否存在；production smoke 只需要存在性，不讀取圖片內容。
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
