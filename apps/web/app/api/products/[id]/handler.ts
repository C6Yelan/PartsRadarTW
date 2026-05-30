import type { Prisma } from "@partsradar/db";

import { internalErrorResponse, jsonOk, notFoundResponse } from "../../_shared/responses";

const COOLPC_SOURCE_NAME = "coolpc";
const COOLPC_PURCHASE_BASE_URL = "https://www.coolpc.com.tw/evaluate.php";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRODUCT_DETAIL_SELECT = {
  // Keep the detail endpoint on public-safe fields only. ibuyToken is selected
  // only to build the outbound CoolPC purchase URL; it is not returned directly.
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
  primaryImageCheckedAt: true,
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
  };
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
  firstSeenAt: string;
  lastSeenAt: string;
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

function normalizeProductId(productId: string): string | null {
  const value = productId.trim().toLowerCase();

  return UUID_PATTERN.test(value) ? value : null;
}

function toProductDetailResponse(product: ProductDetailRecord): ProductDetailResponseBody {
  if (!product.currentPrice) {
    throw new Error("Product detail query returned a product without current price.");
  }
  if (!product.primaryImageUrl || !product.primaryImageCheckedAt) {
    throw new Error("Product detail query returned a product without primary image data.");
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
      url: product.primaryImageUrl,
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
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    },
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
    firstSeenAt: product.firstSeenAt.toISOString(),
    lastSeenAt: product.lastSeenAt.toISOString(),
  };
}

function createCoolpcPurchaseUrl(ibuyToken: string): string {
  const url = new URL(COOLPC_PURCHASE_BASE_URL);
  url.searchParams.set("iBuy", ibuyToken);

  return url.toString();
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
