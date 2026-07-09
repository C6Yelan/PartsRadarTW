// apps/web/tests/products/metadata.test.ts
// 驗證商品詳細頁 metadata 的公開欄位、canonical URL、分享預覽與安全 fallback。

import { describe, expect, it } from "vitest";
import {
  buildProductDetailMetadata,
  createProductDetailMetadata,
  type ProductMetadataFindFirstArgs,
  type ProductMetadataReadClient,
  type ProductMetadataRecord,
  resolvePublicSiteUrl,
} from "../../app/products/[id]/metadata";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const PUBLIC_SITE_URL = "https://partsradar.net";

describe("product detail metadata", () => {
  it("builds product Open Graph metadata with clean canonical URL and image URL", () => {
    const metadata = buildProductDetailMetadata(product(), PUBLIC_SITE_URL);

    expect(metadata.title).toBe("GPU RTX 4070 - NT$ 6,990 | PartsRadarTW");
    expect(metadata.description).toBe("顯示卡 | NT$ 6,990 | 價格資料更新：2026-05-28 19:55");
    expect(metadata.alternates?.canonical).toBe(`https://partsradar.net/products/${PRODUCT_ID}`);
    expect(metadata.openGraph).toMatchObject({
      title: "GPU RTX 4070 - NT$ 6,990 | PartsRadarTW",
      description: "顯示卡 | NT$ 6,990 | 價格資料更新：2026-05-28 19:55",
      type: "website",
      siteName: "PartsRadarTW",
      locale: "zh_TW",
      url: `https://partsradar.net/products/${PRODUCT_ID}`,
      images: [
        {
          url: `https://partsradar.net/api/product-images/${PRODUCT_ID}.webp`,
          alt: "GPU RTX 4070",
          type: "image/webp",
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "GPU RTX 4070 - NT$ 6,990 | PartsRadarTW",
      description: "顯示卡 | NT$ 6,990 | 價格資料更新：2026-05-28 19:55",
      images: [`https://partsradar.net/api/product-images/${PRODUCT_ID}.webp`],
    });
    expect(JSON.stringify(metadata)).not.toContain("iBuyToken");
    expect(JSON.stringify(metadata)).not.toContain("raw_snapshot");
  });

  it("queries public product fields for metadata without requiring image data", async () => {
    const client = fakeProductMetadataClient(product());
    const metadata = await createProductDetailMetadata(client, PRODUCT_ID.toUpperCase(), {
      publicSiteUrl: "https://partsradar.net/some-path?ignored=1",
    });

    expect(client.productFindFirstCallCount).toBe(1);
    expect(client.lastProductFindFirstArgs).toMatchObject({
      where: {
        id: PRODUCT_ID,
        sourceCategory: {
          enabled: true,
        },
        currentPrice: {
          isNot: null,
        },
      },
    });
    expect(client.lastProductFindFirstArgs?.select).not.toHaveProperty("ibuyToken");
    expect(client.lastProductFindFirstArgs?.select).not.toHaveProperty("sourceUrl");
    expect(client.lastProductFindFirstArgs?.select.currentPrice.select.lastSeenAt).toBe(true);
    expect(
      client.lastProductFindFirstArgs?.select.currentPrice.select.priceSnapshot.select,
    ).not.toHaveProperty("capturedAt");
    expect(metadata.alternates?.canonical).toBe(`https://partsradar.net/products/${PRODUCT_ID}`);
  });

  it("returns fallback metadata without a DB query for invalid product IDs", async () => {
    const client = fakeProductMetadataClient(product());
    const metadata = await createProductDetailMetadata(client, "not-a-product-id", {
      publicSiteUrl: PUBLIC_SITE_URL,
    });

    expect(client.productFindFirstCallCount).toBe(0);
    expect(metadata.title).toBe("商品資訊 | PartsRadarTW");
    expect(metadata.alternates?.canonical).toBe("https://partsradar.net/");
  });

  it("returns fallback metadata for missing products", async () => {
    const client = fakeProductMetadataClient(null);
    const metadata = await createProductDetailMetadata(client, PRODUCT_ID, {
      publicSiteUrl: PUBLIC_SITE_URL,
    });

    expect(client.productFindFirstCallCount).toBe(1);
    expect(metadata.title).toBe("商品資訊 | PartsRadarTW");
    expect(metadata.alternates?.canonical).toBe(`https://partsradar.net/products/${PRODUCT_ID}`);
  });

  it("returns fallback metadata when the product metadata query fails", async () => {
    const metadata = await createProductDetailMetadata(
      throwingProductMetadataClient(),
      PRODUCT_ID,
      {
        publicSiteUrl: PUBLIC_SITE_URL,
      },
    );

    expect(metadata.title).toBe("商品資訊 | PartsRadarTW");
    expect(JSON.stringify(metadata)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(metadata)).not.toContain("iBuyToken");
  });

  it("uses the public production origin when env input is absent or invalid", () => {
    expect(resolvePublicSiteUrl(null)).toBe("https://partsradar.net");
    expect(resolvePublicSiteUrl("ftp://example.com")).toBe("https://partsradar.net");
    expect(resolvePublicSiteUrl("https://preview.partsradar.net/path?q=1")).toBe(
      "https://preview.partsradar.net",
    );
  });
});

function fakeProductMetadataClient(productResult: ProductMetadataRecord | null) {
  const client = {
    lastProductFindFirstArgs: null as ProductMetadataFindFirstArgs | null,
    productFindFirstCallCount: 0,
    product: {
      async findFirst(args: ProductMetadataFindFirstArgs) {
        client.productFindFirstCallCount += 1;
        client.lastProductFindFirstArgs = args;

        return productResult;
      },
    },
  } satisfies ProductMetadataReadClient & {
    lastProductFindFirstArgs: ProductMetadataFindFirstArgs | null;
    productFindFirstCallCount: number;
  };

  return client;
}

function throwingProductMetadataClient() {
  return {
    product: {
      async findFirst() {
        throw new Error("DATABASE_URL=postgresql://partsradar:secret@db:5432/app iBuyToken=secret");
      },
    },
  } satisfies ProductMetadataReadClient;
}

function product(overrides: Partial<ProductMetadataRecord> = {}): ProductMetadataRecord {
  return {
    id: PRODUCT_ID,
    name: "GPU RTX 4070",
    currentPrice: {
      lastSeenAt: new Date("2026-05-28T11:55:00.000Z"),
      priceSnapshot: {
        price: 6990,
        currency: "TWD",
      },
    },
    sourceCategory: {
      displayName: "顯示卡",
    },
    ...overrides,
  };
}
