// apps/crawler/src/scripts/ops/product-link-checker/candidates.ts

import { createCoolpcPurchaseUrl } from "@partsradar/shared";
import type { ProductLinkCheckerOptions } from "./options";
import {
  PRODUCT_LINK_KINDS,
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_SELECT,
  type ProductLinkCandidate,
  type ProductLinkHealthClient,
  type ProductLinkHealthRecord,
  type ProductLinkKindValue,
  type ProductLinkProductRecord,
} from "./types";

export async function readProductLinkCandidates(
  client: ProductLinkHealthClient,
  options: ProductLinkCheckerOptions,
  now = new Date(),
): Promise<ProductLinkCandidate[]> {
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
  const candidates = buildProductLinkCandidates(products, options, now);

  return options.limit === null ? candidates : candidates.slice(0, options.limit);
}

export function buildProductLinkCandidates(
  products: ProductLinkProductRecord[],
  options: ProductLinkCheckerOptions,
  now: Date,
): ProductLinkCandidate[] {
  const staleBefore = new Date(now.getTime() - options.staleAfterHours * 60 * 60 * 1000);
  const candidates: ProductLinkCandidate[] = [];

  for (const product of products) {
    const links = buildProductLinks(product, options);

    for (const link of links) {
      const existingHealth =
        product.linkHealthChecks.find((health) => health.linkKind === link.linkKind) ?? null;

      if (!shouldCheckLink(link.url, existingHealth, staleBefore)) {
        continue;
      }

      candidates.push({
        productId: product.id,
        productName: product.name,
        categoryLabel: `${product.sourceCategory.displayName} IGrp=${product.sourceCategory.igrp}`,
        linkKind: link.linkKind,
        url: link.url,
        existingHealth,
      });
    }
  }

  return candidates.sort(compareProductLinkCandidates);
}

function buildProductLinks(
  product: ProductLinkProductRecord,
  options: ProductLinkCheckerOptions,
): Array<{ linkKind: ProductLinkKindValue; url: string }> {
  const links: Array<{ linkKind: ProductLinkKindValue; url: string }> = [];

  if (options.kinds.includes(PRODUCT_LINK_KINDS.SOURCE)) {
    links.push({
      linkKind: PRODUCT_LINK_KINDS.SOURCE,
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    });
  }

  return links;
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

function compareProductLinkCandidates(
  left: ProductLinkCandidate,
  right: ProductLinkCandidate,
): number {
  const priorityOrder = getCandidatePriority(left) - getCandidatePriority(right);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const checkedAtOrder = getCandidateCheckedAtTime(left) - getCandidateCheckedAtTime(right);

  if (checkedAtOrder !== 0) {
    return checkedAtOrder;
  }

  const kindOrder = left.linkKind.localeCompare(right.linkKind);

  if (kindOrder !== 0) {
    return kindOrder;
  }

  return left.productId.localeCompare(right.productId);
}

function getCandidatePriority(candidate: ProductLinkCandidate): number {
  if (!candidate.existingHealth || candidate.existingHealth.url !== candidate.url) {
    return 0;
  }

  return candidate.existingHealth.status === PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR ? 1 : 2;
}

function getCandidateCheckedAtTime(candidate: ProductLinkCandidate): number {
  return candidate.existingHealth?.checkedAt.getTime() ?? 0;
}
