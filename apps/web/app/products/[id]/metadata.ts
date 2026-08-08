// apps/web/app/products/[id]/metadata.ts
// 建立商品詳細頁的 Next.js metadata，限制只使用公開商品欄位組出 SEO 與分享預覽資訊。

import type { Metadata } from "next";
import { formatTwdPrice } from "../../_shared/formatting";
import { normalizeProductId } from "../../_shared/product-id";
import { DEFAULT_PUBLIC_SITE_URL, resolvePublicSiteUrl } from "../../_shared/public-site";
import { formatTaipeiDateTime } from "../../_shared/time";
import type { ProductDetailResponseBody } from "../../api/products/[id]/response";

const SITE_NAME = "PartsRadarTW";
const FALLBACK_TITLE = `商品資訊 | ${SITE_NAME}`;
const FALLBACK_DESCRIPTION = "原價屋電腦零件價格查詢工具";
const TITLE_MAX_LENGTH = 70;
const SHARE_TITLE_MAX_LENGTH = 96;
export const PRODUCT_SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const PRODUCT_SHARE_IMAGE_CONTENT_TYPE = "image/png";

interface ProductMetadataOptions {
  publicSiteUrl?: string | null;
}

export type ProductMetadataReader = (
  productId: string,
) => Promise<ProductDetailResponseBody | null>;

// 讀取商品公開欄位並建立詳細頁 metadata；無效 id、查無商品或查詢失敗時回退預設 metadata。
export async function createProductDetailMetadata(
  readProduct: ProductMetadataReader,
  productId: string,
  options: ProductMetadataOptions = {},
): Promise<Metadata> {
  const publicSiteUrl = resolvePublicSiteUrl(options.publicSiteUrl);
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return createFallbackProductMetadata(publicSiteUrl);
  }

  try {
    const product = await readProduct(normalizedProductId);

    if (!product) {
      return createFallbackProductMetadata(publicSiteUrl, normalizedProductId);
    }

    return buildProductDetailMetadata(product, publicSiteUrl);
  } catch {
    return createFallbackProductMetadata(publicSiteUrl, normalizedProductId);
  }
}

// 將公開商品 response 轉成 Next.js Metadata，避免暴露 crawler 內部來源 URL 或非公開欄位。
export function buildProductDetailMetadata(
  product: ProductDetailResponseBody,
  publicSiteUrl = DEFAULT_PUBLIC_SITE_URL,
): Metadata {
  const productUrl = createAbsoluteUrl(publicSiteUrl, `/products/${product.id}`);
  const openGraphImageUrl = createAbsoluteUrl(
    publicSiteUrl,
    `/products/${product.id}/opengraph-image`,
  );
  const twitterImageUrl = createAbsoluteUrl(publicSiteUrl, `/products/${product.id}/twitter-image`);
  const price = formatTwdPrice(product.price.amount);
  const titleSuffix = ` - ${price} | ${SITE_NAME}`;
  const productName = truncateMetadataText(
    product.name,
    Math.max(1, TITLE_MAX_LENGTH - titleSuffix.length),
  );
  const title = `${productName}${titleSuffix}`;
  const shareTitle = truncateMetadataText(product.name, SHARE_TITLE_MAX_LENGTH);
  const description = `${product.category.displayName}｜目前 ${price}｜更新 ${formatTaipeiDateTime(product.price.lastSeenAt)}（台北時間）。實際價格與供貨以原價屋為準。`;

  return {
    title,
    description,
    alternates: {
      canonical: productUrl,
    },
    openGraph: {
      title: shareTitle,
      description,
      type: "website",
      siteName: SITE_NAME,
      locale: "zh_TW",
      url: productUrl,
      images: [
        {
          url: openGraphImageUrl,
          alt: `${product.name} 價格分享卡`,
          type: PRODUCT_SHARE_IMAGE_CONTENT_TYPE,
          width: PRODUCT_SHARE_IMAGE_SIZE.width,
          height: PRODUCT_SHARE_IMAGE_SIZE.height,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [twitterImageUrl],
    },
  };
}

// 建立找不到商品或 metadata 查詢失敗時的安全預設 metadata。
function createFallbackProductMetadata(publicSiteUrl: string, productId?: string): Metadata {
  const canonicalPath = productId ? `/products/${productId}` : "/";
  const canonical = createAbsoluteUrl(publicSiteUrl, canonicalPath);
  const shareImageId = productId ?? "share";
  const openGraphImageUrl = createAbsoluteUrl(
    publicSiteUrl,
    `/products/${shareImageId}/opengraph-image`,
  );
  const twitterImageUrl = createAbsoluteUrl(
    publicSiteUrl,
    `/products/${shareImageId}/twitter-image`,
  );

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
      images: [
        {
          url: openGraphImageUrl,
          alt: "PartsRadarTW 原價屋零件價格查詢",
          type: PRODUCT_SHARE_IMAGE_CONTENT_TYPE,
          width: PRODUCT_SHARE_IMAGE_SIZE.width,
          height: PRODUCT_SHARE_IMAGE_SIZE.height,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
      images: [twitterImageUrl],
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
