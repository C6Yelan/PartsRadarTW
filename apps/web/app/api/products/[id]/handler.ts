import type { Prisma } from "@partsradar/db";
import {
  COOLPC_SOURCE_NAME,
  createCoolpcPurchaseUrl,
  createPublicProductImagePath,
} from "@partsradar/shared";

import { internalErrorResponse, jsonOk, notFoundResponse } from "../../_shared/responses";
import { normalizeProductId } from "./product-id";

// Discussion links are display-only references, so low-quality marketplace/download
// targets are filtered before any stored URL reaches the public response.
const BLOCKED_DISCUSSION_HOST_SUFFIXES = [".shopee.tw"];
const BLOCKED_DISCUSSION_HOSTS = new Set(["shopee.tw"]);
const BLOCKED_DISCUSSION_PATH_KEYWORDS = [
  "driver",
  "drivers",
  "download",
  "downloads",
  "previous-drivers",
];
const DISCUSSION_QUERY_PARAMS_TO_STRIP = new Set([
  "access_token",
  "auth",
  "authorization",
  "fbclid",
  "gclid",
  "msclkid",
  "phpsessid",
  "session",
  "session_id",
  "sessionid",
  "sid",
  "token",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);
const PRODUCT_DETAIL_SELECT = {
  // Keep the detail endpoint on public-safe fields only. ibuyToken is selected
  // only to build the outbound CoolPC purchase URL; it is not returned directly.
  id: true,
  ibuyToken: true,
  name: true,
  primaryImageUrl: true,
  primaryImageCheckedAt: true,
  discussionUrl: true,
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
  discussion: {
    url: string;
  } | null;
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
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    },
    discussion: toDiscussionResponse(product.discussionUrl),
    status: {
      isActive: product.isActive,
      missingSince: toIsoStringOrNull(product.missingSince),
    },
    firstSeenAt: product.firstSeenAt.toISOString(),
    lastSeenAt: product.lastSeenAt.toISOString(),
  };
}

function toDiscussionResponse(
  discussionUrl: string | null,
): ProductDetailResponseBody["discussion"] {
  if (!discussionUrl) {
    return null;
  }

  try {
    const url = new URL(discussionUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    if (!isPublicDiscussionUrl(url)) {
      return null;
    }

    return { url: stripPrivateDiscussionUrlParts(url).toString() };
  } catch {
    return null;
  }
}

function isPublicDiscussionUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = url.pathname.toLowerCase();

  if (
    BLOCKED_DISCUSSION_HOSTS.has(hostname) ||
    BLOCKED_DISCUSSION_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return false;
  }

  if (pathname.endsWith(".pdf")) {
    return false;
  }

  return !BLOCKED_DISCUSSION_PATH_KEYWORDS.some((keyword) => pathname.includes(keyword));
}

function stripPrivateDiscussionUrlParts(url: URL): URL {
  const sanitizedUrl = new URL(url);
  // Fragments and common campaign/session params are not needed for attribution and may leak state.
  sanitizedUrl.hash = "";

  for (const key of Array.from(sanitizedUrl.searchParams.keys())) {
    if (DISCUSSION_QUERY_PARAMS_TO_STRIP.has(key.toLowerCase())) {
      sanitizedUrl.searchParams.delete(key);
    }
  }

  return sanitizedUrl;
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
