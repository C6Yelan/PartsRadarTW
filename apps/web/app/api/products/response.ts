// apps/web/app/api/products/response.ts
import {
  COOLPC_SOURCE_NAME,
  createCoolpcPurchaseUrl,
  createPublicProductImagePath,
  toPublicIntroductionUrl,
} from "@partsradar/shared";
import {
  buildSourceStatusResponse,
  type SourceStatus,
  type SourceStatusCategoryRecord,
} from "../source-status/handler";
import {
  PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
  type ProductPriceMovementSnapshotRecord,
  type ProductRecord,
} from "./data";
import type { ProductVendorOption } from "./query";

interface ProductListResponseItem {
  id: string;
  name: string;
  category: {
    id: string;
    igrp: number;
    displayName: string;
    sourceName: string;
  };
  image: {
    url: string;
    alt: string;
    capturedAt: string;
  } | null;
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
  };
  priceMovement: {
    rangeDays: typeof PRODUCT_PRICE_MOVEMENT_RANGE_DAYS;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
  source: {
    name: typeof COOLPC_SOURCE_NAME;
    url: string;
  };
  introduction: {
    url: string;
  } | null;
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
}

export type ProductPriceMovement = ProductListResponseItem["priceMovement"];

export interface ProductsResponseBody {
  data: ProductListResponseItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    sourceStatus: SourceStatus;
    lastSuccessAt: string | null;
    vendors: ProductVendorOption[];
  };
}

export function buildProductSourceStatus(
  categories: SourceStatusCategoryRecord[],
  igrp: number | undefined,
  now: Date,
) {
  const sourceCategories =
    igrp === undefined ? categories : categories.filter((category) => category.igrp === igrp);

  return buildSourceStatusResponse(sourceCategories, now);
}

export function toProductResponseItem(product: ProductRecord): ProductListResponseItem {
  if (!product.currentPrice) {
    throw new Error("Product list query returned a product without current price.");
  }

  return {
    id: product.id,
    name: product.name,
    category: {
      id: product.sourceCategory.id,
      igrp: product.sourceCategory.igrp,
      displayName: product.sourceCategory.displayName,
      sourceName: product.sourceCategory.sourceName,
    },
    image: toProductListImage(product),
    price: {
      amount: product.currentPrice.priceSnapshot.price,
      currency: product.currentPrice.priceSnapshot.currency,
      capturedAt: product.currentPrice.priceSnapshot.capturedAt.toISOString(),
      lastSeenAt: product.currentPrice.lastSeenAt.toISOString(),
    },
    priceMovement: toProductPriceMovement(product, []),
    source: {
      name: COOLPC_SOURCE_NAME,
      // Build the public purchase URL directly so stored crawler source URLs cannot leak.
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    },
    introduction: toIntroductionResponse(product.introductionUrl),
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
  };
}

function toProductListImage(product: ProductRecord): ProductListResponseItem["image"] {
  if (!product.primaryImageUrl || !product.primaryImageCheckedAt) {
    return null;
  }

  return {
    // Product image paths come from shared code so list/detail/manual smoke output cannot drift.
    url: createPublicProductImagePath(product.id),
    alt: product.name,
    capturedAt: product.primaryImageCheckedAt.toISOString(),
  };
}

export function buildProductPriceMovementMap(
  products: ProductRecord[],
  snapshots: ProductPriceMovementSnapshotRecord[],
  now: Date,
) {
  const snapshotsByProductId = new Map<string, ProductPriceMovementSnapshotRecord[]>();

  for (const snapshot of snapshots) {
    const productSnapshots = snapshotsByProductId.get(snapshot.productId) ?? [];
    productSnapshots.push(snapshot);
    snapshotsByProductId.set(snapshot.productId, productSnapshots);
  }

  return new Map(
    products.map((product) => [
      product.id,
      toProductPriceMovement(product, snapshotsByProductId.get(product.id) ?? [], now),
    ]),
  );
}

export function toProductResponseItemWithMovement(
  product: ProductRecord,
  movement: ProductListResponseItem["priceMovement"],
): ProductListResponseItem {
  return {
    ...toProductResponseItem(product),
    priceMovement: movement,
  };
}

function toProductPriceMovement(
  product: ProductRecord,
  snapshots: ProductPriceMovementSnapshotRecord[],
  now = new Date(),
): ProductListResponseItem["priceMovement"] {
  if (!product.currentPrice) {
    throw new Error("Product list query returned a product without current price.");
  }

  const since = new Date(now.getTime() - PRODUCT_PRICE_MOVEMENT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const sortedSnapshots = [...snapshots].sort(
    (left, right) => left.capturedAt.getTime() - right.capturedAt.getTime(),
  );
  const snapshotsInRange = sortedSnapshots.filter(
    (snapshot) => snapshot.capturedAt.getTime() >= since.getTime(),
  );
  const baselineBeforeRange = sortedSnapshots.findLast(
    (snapshot) => snapshot.capturedAt.getTime() < since.getTime(),
  );
  const baseline = baselineBeforeRange ?? snapshotsInRange[0] ?? null;
  const currentPrice = product.currentPrice.priceSnapshot.price;

  if (!baseline || product.currentPrice.lastSeenAt.getTime() < since.getTime()) {
    return {
      rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
      deltaAmount: null,
      deltaPercent: null,
    };
  }

  const hasOnlyInitialObservation =
    snapshotsInRange.length === 1 &&
    snapshotsInRange[0].capturedAt.getTime() === product.currentPrice.lastSeenAt.getTime();

  if (!baselineBeforeRange && hasOnlyInitialObservation) {
    return {
      rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
      deltaAmount: null,
      deltaPercent: null,
    };
  }

  const deltaAmount = currentPrice - baseline.price;

  return {
    rangeDays: PRODUCT_PRICE_MOVEMENT_RANGE_DAYS,
    deltaAmount,
    deltaPercent:
      baseline.price === 0 ? null : Number(((deltaAmount / baseline.price) * 100).toFixed(2)),
  };
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toIntroductionResponse(
  introductionUrl: string | null,
): ProductListResponseItem["introduction"] {
  const publicIntroductionUrl = toPublicIntroductionUrl(introductionUrl);

  return publicIntroductionUrl ? { url: publicIntroductionUrl } : null;
}
