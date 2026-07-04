// apps/crawler/src/scripts/ops/production-smoke/checks/product-health.ts
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
