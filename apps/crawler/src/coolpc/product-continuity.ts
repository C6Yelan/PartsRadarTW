import type { ParsedCoolpcProduct } from "./parser";

const PROMOTION_LABELS = ["裝機價", "限組裝", "限搭機"] as const;
const PROMOTION_LABEL_PATTERN = new RegExp(
  `(?:[\\[【({]\\s*(?:${PROMOTION_LABELS.join("|")})\\s*[\\]】)}]|~\\s*(?:${PROMOTION_LABELS.join("|")})\\s*~)`,
  "giu",
);
const IDENTITY_PUNCTUATION_PATTERN = /[()[\]{}【】]/gu;
const PLACEHOLDER_IMAGE_NAME_PATTERN =
  /^(?:no[-_]?(?:image|img|photo|pic)|placeholder|spacer|blank|loading|default|none|null)$/i;

export interface ContinuityExistingProduct {
  id: string;
  sourceCategoryId: string;
  ibuyToken: string;
  name: string;
  primaryImageUrl: string | null;
  currentPrice: {
    priceSnapshot: {
      price: number;
      currency: ParsedCoolpcProduct["currency"];
    };
  } | null;
}

export function normalizeCoolpcContinuityName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(PROMOTION_LABEL_PATTERN, "")
    .toLowerCase()
    .replace(IDENTITY_PUNCTUATION_PATTERN, "")
    .replace(/\s+/gu, "");
}

export function isUsableCoolpcContinuityImageUrl(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) {
    return false;
  }

  let pathname: string;

  try {
    pathname = new URL(imageUrl).pathname;
  } catch {
    return false;
  }

  const filename = pathname.split("/").at(-1) ?? "";
  const basename = filename.replace(/\.[^.]+$/, "");
  return basename.length > 0 && !PLACEHOLDER_IMAGE_NAME_PATTERN.test(basename);
}

export function findCoolpcContinuityMatches<T extends ContinuityExistingProduct>(
  parsedProducts: readonly ParsedCoolpcProduct[],
  existingProducts: readonly T[],
): ReadonlyMap<string, T> {
  const snapshotIdentities = new Set(parsedProducts.map(productIdentityKey));
  const existingByIdentity = new Map(
    existingProducts.map((product) => [productIdentityKey(product), product]),
  );
  const newImageCounts = countUsableImages(parsedProducts);
  const oldCandidates = existingProducts.filter(
    (product) => !snapshotIdentities.has(productIdentityKey(product)),
  );
  const oldImageCounts = countUsableImages(oldCandidates);
  const oldCandidateByImage = new Map<string, T>();

  for (const product of oldCandidates) {
    if (
      isUsableCoolpcContinuityImageUrl(product.primaryImageUrl) &&
      oldImageCounts.get(productImageKey(product)) === 1
    ) {
      oldCandidateByImage.set(productImageKey(product), product);
    }
  }

  const matches = new Map<string, T>();

  for (const parsedProduct of parsedProducts) {
    if (
      existingByIdentity.has(productIdentityKey(parsedProduct)) ||
      !isUsableCoolpcContinuityImageUrl(parsedProduct.primaryImageUrl) ||
      newImageCounts.get(productImageKey(parsedProduct)) !== 1
    ) {
      continue;
    }

    const candidate = oldCandidateByImage.get(productImageKey(parsedProduct));
    const currentSnapshot = candidate?.currentPrice?.priceSnapshot;

    if (
      !candidate ||
      !currentSnapshot ||
      normalizeCoolpcContinuityName(candidate.name) !==
        normalizeCoolpcContinuityName(parsedProduct.name) ||
      currentSnapshot.price !== parsedProduct.price ||
      currentSnapshot.currency !== parsedProduct.currency
    ) {
      continue;
    }

    matches.set(parsedProduct.ibuyToken, candidate);
  }

  return matches;
}

function countUsableImages(
  products: readonly { sourceCategoryId: string; primaryImageUrl: string | null }[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const product of products) {
    if (!isUsableCoolpcContinuityImageUrl(product.primaryImageUrl)) {
      continue;
    }

    const key = productImageKey(product);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function productIdentityKey(product: { sourceCategoryId: string; ibuyToken: string }): string {
  return `${product.sourceCategoryId}\0${product.ibuyToken}`;
}

function productImageKey(product: {
  sourceCategoryId: string;
  primaryImageUrl: string | null;
}): string {
  return `${product.sourceCategoryId}\0${product.primaryImageUrl}`;
}
