// apps/web/app/api/products/[id]/response.ts
import {
  COOLPC_SOURCE_NAME,
  createCoolpcPurchaseUrl,
  createPublicProductImagePath,
} from "@partsradar/shared";

import type { ProductDetailRecord, ProductLinkHealthRecord } from "./data";

const PRODUCT_LINK_KINDS = {
  SOURCE: "SOURCE",
} as const;

export interface ProductDetailResponseBody {
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
    priceChangedAt: string;
  };
  source: {
    name: typeof COOLPC_SOURCE_NAME;
    url: string;
    health: ProductLinkHealthResponse | null;
  };
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
  firstSeenAt: string;
  lastSeenAt: string;
}

interface ProductLinkHealthResponse {
  status: "ok" | "broken" | "temporary_error";
  checkedAt: string;
  httpStatus: number | null;
}

export function toProductDetailResponse(product: ProductDetailRecord): ProductDetailResponseBody {
  if (!product.currentPrice) {
    throw new Error("Product detail query returned a product without current price.");
  }

  const purchaseUrl = createCoolpcPurchaseUrl(product.ibuyToken);

  return {
    id: product.id,
    name: product.name,
    category: {
      id: product.sourceCategory.id,
      igrp: product.sourceCategory.igrp,
      displayName: product.sourceCategory.displayName,
      sourceName: product.sourceCategory.sourceName,
    },
    image: toProductDetailImage(product),
    price: {
      amount: product.currentPrice.priceSnapshot.price,
      currency: product.currentPrice.priceSnapshot.currency,
      capturedAt: product.currentPrice.priceSnapshot.capturedAt.toISOString(),
      lastSeenAt: product.currentPrice.lastSeenAt.toISOString(),
      priceChangedAt: product.currentPrice.priceChangedAt.toISOString(),
    },
    source: {
      name: COOLPC_SOURCE_NAME,
      // Build the public purchase URL directly so stored crawler source URLs cannot leak.
      url: purchaseUrl,
      health: toProductLinkHealthResponse(
        product.linkHealthChecks,
        PRODUCT_LINK_KINDS.SOURCE,
        purchaseUrl,
      ),
    },
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
    firstSeenAt: product.firstSeenAt.toISOString(),
    lastSeenAt: product.lastSeenAt.toISOString(),
  };
}

function toProductDetailImage(product: ProductDetailRecord): ProductDetailResponseBody["image"] {
  if (!product.primaryImageUrl || !product.primaryImageCheckedAt) {
    return null;
  }

  return {
    url: createPublicProductImagePath(product.id),
    alt: product.name,
    capturedAt: product.primaryImageCheckedAt.toISOString(),
  };
}

function toProductLinkHealthResponse(
  linkHealthChecks: ProductLinkHealthRecord[],
  linkKind: ProductLinkHealthRecord["linkKind"],
  expectedUrl: string,
): ProductLinkHealthResponse | null {
  const health = linkHealthChecks.find(
    (candidate) => candidate.linkKind === linkKind && candidate.url === expectedUrl,
  );

  if (!health) {
    return null;
  }

  return {
    status: toPublicProductLinkHealthStatus(health.status),
    checkedAt: health.checkedAt.toISOString(),
    httpStatus: health.httpStatus,
  };
}

function toPublicProductLinkHealthStatus(
  status: ProductLinkHealthRecord["status"],
): ProductLinkHealthResponse["status"] {
  switch (status) {
    case "OK":
      return "ok";
    case "BROKEN":
      return "broken";
    case "TEMPORARY_ERROR":
      return "temporary_error";
  }
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
