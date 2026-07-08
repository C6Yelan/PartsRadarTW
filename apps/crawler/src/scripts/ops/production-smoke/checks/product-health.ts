// apps/crawler/src/scripts/ops/production-smoke/checks/product-health.ts
// 檢查 active 商品數、商品圖片快取缺漏與既有 link health 狀態。

import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_KINDS,
} from "../../product-link-checker/processor";
import { countStatus, fail, ok, thresholdCheck, worseStatus } from "../results";
import type {
  ProductionSmokeClient,
  ProductionSmokeOptions,
  SmokeCheckResult,
  SmokeStatus,
} from "../types";

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

  const message = `${missingCount}/${products.length} display-ready product image(s) missing`;

  return thresholdCheck(
    "missing product images",
    missingCount,
    options.missingImageWarnCount,
    options.missingImageFailCount,
    message,
  );
}

// 此檢查屬於 link health maintenance 功能線；後續整線移除時一併刪除或收斂。
export async function checkLinkHealth(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
): Promise<SmokeCheckResult> {
  const [sourceBrokenCount, sourceTemporaryCount] = await Promise.all([
    countActiveProductLinks(client, PRODUCT_LINK_KINDS.SOURCE, PRODUCT_LINK_HEALTH_STATUSES.BROKEN),
    countActiveProductLinks(
      client,
      PRODUCT_LINK_KINDS.SOURCE,
      PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
    ),
  ]);
  const status = [
    countStatus(
      sourceBrokenCount,
      options.sourceBrokenLinkWarnCount,
      options.sourceBrokenLinkFailCount,
    ),
    countStatus(
      sourceTemporaryCount,
      options.sourceTemporaryLinkWarnCount,
      options.sourceTemporaryLinkFailCount,
    ),
  ].reduce<SmokeStatus>(
    (currentStatus, nextStatus) => worseStatus(currentStatus, nextStatus),
    "OK",
  );

  return {
    name: "link health",
    status,
    message: `source broken=${sourceBrokenCount} temporary=${sourceTemporaryCount}`,
  };
}

// 此 helper 只服務 checkLinkHealth()，屬於 link health maintenance 功能線移除範圍。
async function countActiveProductLinks(
  client: ProductionSmokeClient,
  linkKind: (typeof PRODUCT_LINK_KINDS)[keyof typeof PRODUCT_LINK_KINDS],
  status: (typeof PRODUCT_LINK_HEALTH_STATUSES)[keyof typeof PRODUCT_LINK_HEALTH_STATUSES],
): Promise<number> {
  return client.productLinkHealth.count({
    where: {
      linkKind,
      status,
      product: {
        isActive: true,
      },
    },
  });
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
