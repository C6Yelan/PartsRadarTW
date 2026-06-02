// apps/web/app/api/products/[id]/handler.ts
import type { Prisma } from "@partsradar/db";
import {
  COOLPC_SOURCE_NAME,
  createCoolpcPurchaseUrl,
  createPublicProductImagePath,
  toPublicIntroductionUrl,
} from "@partsradar/shared";

import { internalErrorResponse, jsonOk, notFoundResponse } from "../../_shared/responses";
import { normalizeProductId } from "./product-id";

const PRODUCT_LINK_KINDS = {
  SOURCE: "SOURCE",
  INTRODUCTION: "INTRODUCTION",
} as const;

const PRODUCT_DETAIL_SELECT = {
  // Keep the detail endpoint on public-safe fields only. ibuyToken is selected
  // only to build the outbound CoolPC purchase URL; it is not returned directly.
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
  primaryImageCheckedAt: true,
  introductionUrl: true,
  isActive: true,
  missingSince: true,
  firstSeenAt: true,
  lastSeenAt: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceChangedAt: true,
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
          capturedAt: true,
        },
      },
    },
  },
  linkHealthChecks: {
    select: {
      linkKind: true,
      url: true,
      status: true,
      httpStatus: true,
      checkedAt: true,
    },
  },
  sourceCategory: {
    select: {
      id: true,
      igrp: true,
      displayName: true,
      sourceName: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

type ProductDetailRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_DETAIL_SELECT }>;
type ProductLinkHealthRecord = ProductDetailRecord["linkHealthChecks"][number];
type ProductDetailFindFirstArgs = Omit<Prisma.ProductFindFirstArgs, "select"> & {
  select: typeof PRODUCT_DETAIL_SELECT;
};

export interface ProductDetailReadClient {
  product: {
    findFirst(args: ProductDetailFindFirstArgs): Promise<ProductDetailRecord | null>;
  };
}

interface ProductDetailResponseBody {
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
    priceChangedAt: string;
  };
  source: {
    name: typeof COOLPC_SOURCE_NAME;
    url: string;
    health: ProductLinkHealthResponse | null;
  };
  introduction: {
    url: string;
    health: ProductLinkHealthResponse | null;
  } | null;
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

export function createGetProductHandler(
  client: ProductDetailReadClient,
): (productId: string) => Promise<Response> {
  return async (productId) => {
    try {
      const normalizedProductId = normalizeProductId(productId);

      if (!normalizedProductId) {
        return notFoundResponse();
      }

      const product = await client.product.findFirst({
        where: {
          id: normalizedProductId,
          sourceCategory: {
            enabled: true,
          },
          primaryImageUrl: {
            not: null,
          },
          primaryImageCheckedAt: {
            not: null,
          },
          currentPrice: {
            isNot: null,
          },
        },
        select: PRODUCT_DETAIL_SELECT,
      });

      if (!product) {
        return notFoundResponse();
      }

      return jsonOk<ProductDetailResponseBody>(toProductDetailResponse(product));
    } catch {
      return internalErrorResponse();
    }
  };
}

function toProductDetailResponse(product: ProductDetailRecord): ProductDetailResponseBody {
  if (!product.currentPrice) {
    throw new Error("Product detail query returned a product without current price.");
  }
  if (!product.primaryImageUrl || !product.primaryImageCheckedAt) {
    throw new Error("Product detail query returned a product without primary image data.");
  }

  const sourceUrl = createCoolpcPurchaseUrl(product.ibuyToken);

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
      url: createPublicProductImagePath(product.id),
      alt: product.name,
      capturedAt: product.primaryImageCheckedAt.toISOString(),
    },
    price: {
      amount: product.currentPrice.priceSnapshot.price,
      currency: product.currentPrice.priceSnapshot.currency,
      capturedAt: product.currentPrice.priceSnapshot.capturedAt.toISOString(),
      lastSeenAt: product.currentPrice.lastSeenAt.toISOString(),
      priceChangedAt: product.currentPrice.priceChangedAt.toISOString(),
    },
    source: {
      name: COOLPC_SOURCE_NAME,
      // Build from the official source helper so the public response exposes no stored crawler URL.
      url: sourceUrl,
      health: toProductLinkHealthResponse(
        product.linkHealthChecks,
        PRODUCT_LINK_KINDS.SOURCE,
        sourceUrl,
      ),
    },
    introduction: toIntroductionResponse(product.introductionUrl, product.linkHealthChecks),
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
    firstSeenAt: product.firstSeenAt.toISOString(),
    lastSeenAt: product.lastSeenAt.toISOString(),
  };
}

function toIntroductionResponse(
  introductionUrl: string | null,
  linkHealthChecks: ProductLinkHealthRecord[],
): ProductDetailResponseBody["introduction"] {
  const publicIntroductionUrl = toPublicIntroductionUrl(introductionUrl);

  if (!publicIntroductionUrl) {
    return null;
  }

  return {
    url: publicIntroductionUrl,
    health: toProductLinkHealthResponse(
      linkHealthChecks,
      PRODUCT_LINK_KINDS.INTRODUCTION,
      publicIntroductionUrl,
    ),
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
