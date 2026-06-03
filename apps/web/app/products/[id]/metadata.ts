// apps/web/app/products/[id]/metadata.ts
import type { Prisma } from "@partsradar/db";
import { createPublicProductImagePath } from "@partsradar/shared";
import type { Metadata } from "next";
import { normalizeProductId } from "../../api/products/[id]/product-id";

const SITE_NAME = "PartsRadarTW";
const DEFAULT_PUBLIC_SITE_URL = "https://partsradar.net";
const FALLBACK_TITLE = `商品資訊 | ${SITE_NAME}`;
const FALLBACK_DESCRIPTION = "原價屋電腦零組件價格查詢工具";
const TITLE_PRODUCT_NAME_MAX_LENGTH = 88;

const PRODUCT_METADATA_SELECT = {
  id: true,
  name: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
        },
      },
    },
  },
  sourceCategory: {
    select: {
      displayName: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

export type ProductMetadataRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_METADATA_SELECT;
}>;
export type ProductMetadataFindFirstArgs = Omit<Prisma.ProductFindFirstArgs, "select"> & {
  select: typeof PRODUCT_METADATA_SELECT;
};

export interface ProductMetadataReadClient {
  product: {
    findFirst(args: ProductMetadataFindFirstArgs): Promise<ProductMetadataRecord | null>;
  };
}

interface ProductMetadataOptions {
  publicSiteUrl?: string | null;
}

export async function createProductDetailMetadata(
  client: ProductMetadataReadClient,
  productId: string,
  options: ProductMetadataOptions = {},
): Promise<Metadata> {
  const publicSiteUrl = resolvePublicSiteUrl(options.publicSiteUrl);
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return createFallbackProductMetadata(publicSiteUrl);
  }

  try {
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
      select: PRODUCT_METADATA_SELECT,
    });

    if (!product) {
      return createFallbackProductMetadata(publicSiteUrl, normalizedProductId);
    }

    return buildProductDetailMetadata(product, publicSiteUrl);
  } catch {
    return createFallbackProductMetadata(publicSiteUrl, normalizedProductId);
  }
}

export function buildProductDetailMetadata(
  product: ProductMetadataRecord,
  publicSiteUrl = DEFAULT_PUBLIC_SITE_URL,
): Metadata {
  if (!product.currentPrice) {
    return createFallbackProductMetadata(publicSiteUrl, product.id);
  }

  const productUrl = createAbsoluteUrl(publicSiteUrl, `/products/${product.id}`);
  const imageUrl = createAbsoluteUrl(publicSiteUrl, createPublicProductImagePath(product.id));
  const price = formatMetadataPrice(product.currentPrice.priceSnapshot.price);
  const title = `${truncateMetadataText(product.name, TITLE_PRODUCT_NAME_MAX_LENGTH)} - ${price} | ${SITE_NAME}`;
  const description = [
    product.sourceCategory.displayName,
    price,
    `價格資料更新：${formatTaipeiDateTime(product.currentPrice.lastSeenAt)}`,
  ].join(" | ");

  return {
    title,
    description,
    alternates: {
      canonical: productUrl,
    },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: SITE_NAME,
      locale: "zh_TW",
      url: productUrl,
      images: [
        {
          url: imageUrl,
          alt: product.name,
          type: "image/webp",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export function resolvePublicSiteUrl(publicSiteUrl?: string | null) {
  const candidate =
    publicSiteUrl?.trim() ||
    process.env.PARTSRADAR_PUBLIC_BASE_URL?.trim() ||
    DEFAULT_PUBLIC_SITE_URL;

  try {
    const url = new URL(candidate);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_PUBLIC_SITE_URL;
    }

    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

function createFallbackProductMetadata(publicSiteUrl: string, productId?: string): Metadata {
  const canonicalPath = productId ? `/products/${productId}` : "/";
  const canonical = createAbsoluteUrl(publicSiteUrl, canonicalPath);

  return {
    title: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
      type: "website",
      siteName: SITE_NAME,
      locale: "zh_TW",
      url: canonical,
    },
    twitter: {
      card: "summary",
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
    },
  };
}

function createAbsoluteUrl(publicSiteUrl: string, path: string) {
  return new URL(path, `${publicSiteUrl}/`).toString();
}

function formatMetadataPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

function formatTaipeiDateTime(value: Date) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Taipei",
  }).formatToParts(value);

  return `${getDateTimePart(parts, "year")}-${getDateTimePart(parts, "month")}-${getDateTimePart(
    parts,
    "day",
  )} ${getDateTimePart(parts, "hour")}:${getDateTimePart(parts, "minute")}`;
}

function getDateTimePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function truncateMetadataText(value: string, maxLength: number) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 3).trimEnd()}...`;
}
