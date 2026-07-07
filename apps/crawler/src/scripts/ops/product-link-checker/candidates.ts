// apps/crawler/src/scripts/ops/product-link-checker/candidates.ts
// 建立需要檢查的 product link health 候選，依既有健康狀態與過期時間排序。
// 此檔屬於 link health maintenance 功能線；後續整線移除時一併刪除或收斂。

import { createCoolpcPurchaseUrl } from "@partsradar/shared";
import type { ProductLinkCheckerOptions } from "./options";
import {
  PRODUCT_LINK_KINDS,
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_SELECT,
  type ProductPurchaseLinkTarget,
  type ProductLinkHealthClient,
  type ProductLinkHealthRecord,
  type ProductLinkKindValue,
  type ProductLinkProductRecord,
} from "./types";

export async function readProductPurchaseLinkTargets(
  client: ProductLinkHealthClient,
  options: ProductLinkCheckerOptions,
  now = new Date(),
): Promise<ProductPurchaseLinkTarget[]> {
  const products = await client.product.findMany({
    where: {
      isActive: true,
      primaryImageUrl: { not: null },
      primaryImageCheckedAt: { not: null },
      currentPrice: { isNot: null },
      sourceCategory: {
        enabled: true,
        ...(options.igrp === null ? {} : { igrp: options.igrp }),
      },
    },
    select: PRODUCT_LINK_SELECT,
    orderBy: [{ sourceCategory: { igrp: "asc" } }, { id: "asc" }],
    take: undefined,
  });
  const purchaseLinkTargets = buildProductPurchaseLinkTargets(products, options, now);

  return options.limit === null ? purchaseLinkTargets : purchaseLinkTargets.slice(0, options.limit);
}

export function buildProductPurchaseLinkTargets(
  products: ProductLinkProductRecord[],
  options: ProductLinkCheckerOptions,
  now: Date,
): ProductPurchaseLinkTarget[] {
  const staleBefore = new Date(now.getTime() - options.staleAfterHours * 60 * 60 * 1000);
  const purchaseLinkTargets: ProductPurchaseLinkTarget[] = [];

  for (const product of products) {
    const purchaseLinks = buildProductPurchaseLinks(product, options);

    for (const purchaseLink of purchaseLinks) {
      const existingHealth =
        product.linkHealthChecks.find((health) => health.linkKind === purchaseLink.linkKind) ??
        null;

      if (!shouldCheckLink(purchaseLink.url, existingHealth, staleBefore)) {
        continue;
      }

      purchaseLinkTargets.push({
        productId: product.id,
        productName: product.name,
        categoryLabel: `${product.sourceCategory.displayName} IGrp=${product.sourceCategory.igrp}`,
        linkKind: purchaseLink.linkKind,
        url: purchaseLink.url,
        existingHealth,
      });
    }
  }

  return purchaseLinkTargets.sort(compareProductPurchaseLinkTargets);
}

function buildProductPurchaseLinks(
  product: ProductLinkProductRecord,
  options: ProductLinkCheckerOptions,
): Array<{ linkKind: ProductLinkKindValue; url: string }> {
  const purchaseLinks: Array<{ linkKind: ProductLinkKindValue; url: string }> = [];

  if (options.kinds.includes(PRODUCT_LINK_KINDS.SOURCE)) {
    purchaseLinks.push({
      linkKind: PRODUCT_LINK_KINDS.SOURCE,
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    });
  }

  return purchaseLinks;
}

function shouldCheckLink(
  url: string,
  existingHealth: ProductLinkHealthRecord | null,
  staleBefore: Date,
): boolean {
  return (
    !existingHealth ||
    existingHealth.url !== url ||
    existingHealth.checkedAt.getTime() <= staleBefore.getTime()
  );
}

function compareProductPurchaseLinkTargets(
  left: ProductPurchaseLinkTarget,
  right: ProductPurchaseLinkTarget,
): number {
  const priorityOrder = getPurchaseLinkTargetPriority(left) - getPurchaseLinkTargetPriority(right);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const checkedAtOrder =
    getPurchaseLinkTargetCheckedAtTime(left) - getPurchaseLinkTargetCheckedAtTime(right);

  if (checkedAtOrder !== 0) {
    return checkedAtOrder;
  }

  const kindOrder = left.linkKind.localeCompare(right.linkKind);

  if (kindOrder !== 0) {
    return kindOrder;
  }

  return left.productId.localeCompare(right.productId);
}

function getPurchaseLinkTargetPriority(target: ProductPurchaseLinkTarget): number {
  if (!target.existingHealth || target.existingHealth.url !== target.url) {
    return 0;
  }

  return target.existingHealth.status === PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR ? 1 : 2;
}

function getPurchaseLinkTargetCheckedAtTime(target: ProductPurchaseLinkTarget): number {
  return target.existingHealth?.checkedAt.getTime() ?? 0;
}
