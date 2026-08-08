// apps/web/tests/products/metadata.test.ts
// 驗證商品詳細頁 metadata 的公開欄位、canonical URL、分享預覽與安全 fallback。

import { describe, expect, it, vi } from "vitest";
import type { ProductDetailBody } from "../../app/products/[id]/detail/types";
import {
  buildProductDetailMetadata,
  createProductDetailMetadata,
} from "../../app/products/[id]/metadata";
import {
  type ProductShareImageData,
  renderProductShareImageResponse,
} from "../../app/products/[id]/share-image";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const PUBLIC_SITE_URL = "https://partsradar.net";
const DESCRIPTION =
  "顯示卡｜目前 NT$ 6,990｜更新 2026-05-28 19:55（台北時間）。實際價格與供貨以原價屋為準。";

describe("product detail metadata", () => {
  it("builds product Open Graph metadata with clean canonical URL and image URL", () => {
    const metadata = buildProductDetailMetadata(product(), PUBLIC_SITE_URL);

    expect(metadata.title).toBe("GPU RTX 4070 - NT$ 6,990 | PartsRadarTW");
    expect(metadata.description).toBe(DESCRIPTION);
    expect(metadata.alternates?.canonical).toBe(`https://partsradar.net/products/${PRODUCT_ID}`);
    expect(metadata.openGraph).toMatchObject({
      title: "GPU RTX 4070",
      description: DESCRIPTION,
      type: "website",
      siteName: "PartsRadarTW",
      locale: "zh_TW",
      url: `https://partsradar.net/products/${PRODUCT_ID}`,
      images: [
        {
          url: `https://partsradar.net/products/${PRODUCT_ID}/opengraph-image`,
          alt: "GPU RTX 4070 價格分享卡",
          type: "image/png",
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "GPU RTX 4070",
      description: DESCRIPTION,
      images: [`https://partsradar.net/products/${PRODUCT_ID}/twitter-image`],
    });
    expect(JSON.stringify(metadata)).not.toContain("iBuyToken");
    expect(JSON.stringify(metadata)).not.toContain("raw_snapshot");
  });

  it("limits the complete title while preserving price and brand for long product names", () => {
    const metadata = buildProductDetailMetadata(
      product({
        name: `  ${"超長顯示卡型號 ".repeat(12)}  `,
        price: {
          amount: 6990,
          currency: "TWD",
          capturedAt: "2026-05-28T15:55:00.000Z",
          lastSeenAt: "2026-05-28T16:05:00.000Z",
        },
      }),
      PUBLIC_SITE_URL,
    );
    const title = String(metadata.title);

    expect(title.length).toBeLessThanOrEqual(70);
    expect(title).toContain("超長顯示卡型號");
    expect(title).toContain("…");
    expect(title.endsWith(" - NT$ 6,990 | PartsRadarTW")).toBe(true);
    expect(metadata.description).toContain("2026-05-29 00:05（台北時間）");
    expect(metadata.description).toContain("實際價格與供貨以原價屋為準");
    expect(metadata.description).toContain("｜");
    expect(metadata.openGraph?.title).not.toContain("PartsRadarTW");
  });

  it("reads the shared public product once with a normalized id", async () => {
    const readProduct = vi.fn(async () => product());
    const metadata = await createProductDetailMetadata(readProduct, PRODUCT_ID.toUpperCase(), {
      publicSiteUrl: "https://partsradar.net/products/old?returnTo=%2F%3Fcategory%3Dstorage",
    });

    expect(readProduct).toHaveBeenCalledTimes(1);
    expect(readProduct).toHaveBeenCalledWith(PRODUCT_ID);
    expect(metadata.alternates?.canonical).toBe(`https://partsradar.net/products/${PRODUCT_ID}`);
  });

  it("returns fallback metadata without a DB query for invalid product IDs", async () => {
    const readProduct = vi.fn(async () => product());
    const metadata = await createProductDetailMetadata(readProduct, "not-a-product-id", {
      publicSiteUrl: PUBLIC_SITE_URL,
    });

    expect(readProduct).not.toHaveBeenCalled();
    expect(metadata.title).toBe("商品資訊 | PartsRadarTW");
    expect(metadata.alternates?.canonical).toBe("https://partsradar.net/");
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "https://partsradar.net/products/share/opengraph-image",
        type: "image/png",
        width: 1200,
        height: 630,
      }),
    ]);
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["https://partsradar.net/products/share/twitter-image"],
    });
  });

  it("returns fallback metadata for missing products", async () => {
    const readProduct = vi.fn(async () => null);
    const metadata = await createProductDetailMetadata(readProduct, PRODUCT_ID, {
      publicSiteUrl: PUBLIC_SITE_URL,
    });

    expect(readProduct).toHaveBeenCalledTimes(1);
    expect(metadata.title).toBe("商品資訊 | PartsRadarTW");
    expect(metadata.alternates?.canonical).toBe(`https://partsradar.net/products/${PRODUCT_ID}`);
  });

  it("returns fallback metadata when the product metadata query fails", async () => {
    const metadata = await createProductDetailMetadata(
      async () => {
        throw new Error("DATABASE_URL=postgresql://partsradar:secret@db:5432/app iBuyToken=secret");
      },
      PRODUCT_ID,
      {
        publicSiteUrl: PUBLIC_SITE_URL,
      },
    );

    expect(metadata.title).toBe("商品資訊 | PartsRadarTW");
    expect(JSON.stringify(metadata)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(metadata)).not.toContain("iBuyToken");
  });
});

describe("product share image", () => {
  it("renders a 1200 by 630 PNG using only the cached product WebP", async () => {
    const response = await renderProductShareImageResponse({
      product: shareImageProduct(),
      imageBytes: Buffer.from(
        "UklGRlIAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAAFZQOCAqAAAAMAEAnQEqAQABAAFAJiWkAANwAP7+//8AAA==",
        "base64",
      ),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes.slice(1, 4))).toBe("PNG");
  });

  it("renders the branded product fallback when the cached image is missing", async () => {
    const response = await renderProductShareImageResponse({
      product: shareImageProduct(),
      imageBytes: null,
    });

    expect(response.headers.get("content-type")).toBe("image/png");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("safely renders a long product name without any source request", async () => {
    const response = await renderProductShareImageResponse({
      product: shareImageProduct({ name: "超長商品名稱 ".repeat(80) }),
      imageBytes: null,
    });

    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});

function shareImageProduct(overrides: Partial<ProductShareImageData> = {}): ProductShareImageData {
  return {
    id: PRODUCT_ID,
    name: "GPU RTX 4070",
    currentPrice: {
      lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
      priceSnapshot: {
        price: 6990,
      },
    },
    sourceCategory: {
      displayName: "顯示卡",
    },
    ...overrides,
  };
}

function product(overrides: Partial<ProductDetailBody> = {}): ProductDetailBody {
  return {
    id: PRODUCT_ID,
    name: "GPU RTX 4070",
    category: {
      id: "category-12",
      igrp: 12,
      displayName: "顯示卡",
      sourceName: "顯示卡 VGA",
    },
    image: null,
    price: {
      amount: 6990,
      currency: "TWD",
      capturedAt: "2026-05-28T11:45:00.000Z",
      lastSeenAt: "2026-05-28T11:55:00.000Z",
    },
    source: {
      name: "coolpc",
      url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    },
    status: {
      isActive: true,
      isExcluded: false,
      exclusionReason: null,
    },
    lastSeenAt: "2026-05-28T11:55:00.000Z",
    ...overrides,
  };
}
