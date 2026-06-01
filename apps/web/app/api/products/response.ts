import {
  COOLPC_SOURCE_NAME,
  createCoolpcCategoryUrl,
  createPublicProductImagePath,
} from "@partsradar/shared";
import {
  buildSourceStatusResponse,
  type SourceStatus,
  type SourceStatusCategoryRecord,
} from "../source-status/handler";
import type { ProductRecord } from "./data";
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
  };
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
  };
  source: {
    name: typeof COOLPC_SOURCE_NAME;
    url: string;
  };
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
}

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
  if (!product.primaryImageUrl || !product.primaryImageCheckedAt) {
    throw new Error("Product list query returned a product without primary image data.");
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
    image: {
      // Product image paths come from shared code so list/detail/manual smoke output cannot drift.
      url: createPublicProductImagePath(product.id),
      alt: product.name,
      capturedAt: product.primaryImageCheckedAt.toISOString(),
    },
    price: {
      amount: product.currentPrice.priceSnapshot.price,
      currency: product.currentPrice.priceSnapshot.currency,
      capturedAt: product.currentPrice.priceSnapshot.capturedAt.toISOString(),
      lastSeenAt: product.currentPrice.lastSeenAt.toISOString(),
    },
    source: {
      name: COOLPC_SOURCE_NAME,
      // Build from the official source helper so stored crawler URLs cannot leak session state.
      url: createCoolpcCategoryUrl(product.sourceCategory.igrp),
    },
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
  };
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
