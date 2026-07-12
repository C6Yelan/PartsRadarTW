// apps/web/app/products/[id]/metadata.ts
// 建立商品詳細頁的 Next.js metadata，限制只使用公開商品欄位組出 SEO 與分享預覽資訊。

import type { Prisma } from "@partsradar/db";
import { createPublicProductImagePath } from "@partsradar/shared";
import type { Metadata } from "next";
import { formatTwdPrice } from "../../_shared/formatting";
import { DEFAULT_PUBLIC_SITE_URL, resolvePublicSiteUrl } from "../../_shared/public-site";
import { formatTaipeiDateTime } from "../../_shared/time";
import { normalizeProductId } from "../../api/products/[id]/product-id";

const SITE_NAME = "PartsRadarTW";
const FALLBACK_TITLE = `商品資訊 | ${SITE_NAME}`;
const FALLBACK_DESCRIPTION = "原價屋電腦零件價格查詢工具";
const TITLE_MAX_LENGTH = 70;

const PRODUCT_METADATA_SELECT = {
  id: true,
  name: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
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

// 商品 metadata 查詢所需的最小 Prisma client contract，供 page 與測試注入。
export interface ProductMetadataReadClient {
  product: {
    findFirst(args: ProductMetadataFindFirstArgs): Promise<ProductMetadataRecord | null>;
  };
}

interface ProductMetadataOptions {
  publicSiteUrl?: string | null;
}

// 讀取商品公開欄位並建立詳細頁 metadata；無效 id、查無商品或查詢失敗時回退預設 metadata。
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

// 將商品 metadata record 轉成 Next.js Metadata，避免暴露 crawler 內部來源 URL 或非公開欄位。
export function buildProductDetailMetadata(
  product: ProductMetadataRecord,
  publicSiteUrl = DEFAULT_PUBLIC_SITE_URL,
): Metadata {
  if (!product.currentPrice) {
    return createFallbackProductMetadata(publicSiteUrl, product.id);
  }

  const productUrl = createAbsoluteUrl(publicSiteUrl, `/products/${product.id}`);
  const imageUrl = createAbsoluteUrl(publicSiteUrl, createPublicProductImagePath(product.id));
  const price = formatTwdPrice(product.currentPrice.priceSnapshot.price);
  const titleSuffix = ` - ${price} | ${SITE_NAME}`;
  const productName = truncateMetadataText(
    product.name,
    Math.max(1, TITLE_MAX_LENGTH - titleSuffix.length),
  );
  const title = `${productName}${titleSuffix}`;
  const description = `這項商品屬於「${product.sourceCategory.displayName}」分類，目前價格為 ${price}；價格資料更新於 ${formatTaipeiDateTime(product.currentPrice.lastSeenAt)}（台北時間）。資料整理自原價屋，實際售價與供貨狀況以來源頁面為準。`;

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

// 建立找不到商品或 metadata 查詢失敗時的安全預設 metadata。
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

// 將 metadata 使用的相對路徑轉成公開站台絕對 URL。
function createAbsoluteUrl(publicSiteUrl: string, path: string) {
  return new URL(path, `${publicSiteUrl}/`).toString();
}

// 壓縮 metadata title 中的商品名稱，並把價格與品牌保留在整體長度上限內。
function truncateMetadataText(value: string, maxLength: number) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
