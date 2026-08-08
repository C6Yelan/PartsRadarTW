// apps/web/tests/seo/product-sitemap.test.ts
// 驗證 product sitemap 的公開 eligibility、canonical XML 與安全失敗行為。

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductSitemapReadClient } from "../../app/products/sitemap.xml/data";
import { PRODUCT_SITEMAP_QUERY, readPublicProductIds } from "../../app/products/sitemap.xml/data";
import {
  createProductSitemapResponse,
  createProductSitemapXml,
  PRODUCT_SITEMAP_REVALIDATE_SECONDS,
} from "../../app/products/sitemap.xml/response";

const PRODUCT_ID_1 = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID_2 = "22222222-2222-2222-2222-222222222222";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /products/sitemap.xml", () => {
  it("queries only deterministic public product UUIDs", async () => {
    const client = fakeProductSitemapClient([PRODUCT_ID_2, PRODUCT_ID_1]);

    await expect(readPublicProductIds(client)).resolves.toEqual([PRODUCT_ID_2, PRODUCT_ID_1]);
    expect(client.lastFindManyArgs).toEqual({
      where: {
        isExcluded: false,
        sourceCategory: {
          enabled: true,
        },
        currentPrice: {
          isNot: null,
        },
      },
      orderBy: {
        id: "asc",
      },
      select: {
        id: true,
      },
    });
    expect(PRODUCT_SITEMAP_QUERY.where).not.toHaveProperty("isActive");
    expect(PRODUCT_SITEMAP_QUERY.select).not.toHaveProperty("ibuyToken");
    expect(PRODUCT_SITEMAP_QUERY.select).not.toHaveProperty("sourceUrl");
  });

  it("uses the configured public origin and emits one sorted canonical URL per UUID", () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", "https://preview.partsradar.example/base?q=1");

    const xml = createProductSitemapXml([PRODUCT_ID_2, PRODUCT_ID_1, PRODUCT_ID_2]);
    const locations = extractLocations(xml);

    expect(locations).toEqual([
      `https://preview.partsradar.example/products/${PRODUCT_ID_1}`,
      `https://preview.partsradar.example/products/${PRODUCT_ID_2}`,
    ]);
    expect(new Set(locations).size).toBe(locations.length);
    expect(locations.every((url) => new URL(url).search === "")).toBe(true);
    expect(locations.every((url) => !url.includes("/api/"))).toBe(true);
    expect(xml).not.toContain("<lastmod>");
    expect(xml).not.toContain("partsradar.net");
  });

  it("keeps output deterministic across request times and input order", () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", "https://preview.partsradar.example");
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-09T00:00:00.000Z");
    const first = createProductSitemapXml([PRODUCT_ID_2, PRODUCT_ID_1]);

    vi.setSystemTime("2030-01-01T00:00:00.000Z");
    const second = createProductSitemapXml([PRODUCT_ID_1, PRODUCT_ID_2]);
    vi.useRealTimers();

    expect(second).toBe(first);
  });

  it("returns valid XML with the expected content type", async () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", "https://preview.partsradar.example");

    const response = await createProductSitemapResponse(async () => [PRODUCT_ID_1]);
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>https://preview.partsradar.example/products/${PRODUCT_ID_1}</loc>`);
    expect(xml.endsWith("</urlset>\n")).toBe(true);
  });

  it("returns a generic no-store 503 instead of an empty sitemap when the read fails", async () => {
    const response = await createProductSitemapResponse(async () => {
      throw new Error("Prisma stack with DATABASE_URL and iBuyToken");
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body).toBe("Service Unavailable");
    expect(body).not.toContain("DATABASE_URL");
    expect(body).not.toContain("<urlset");
  });

  it("uses a six-hour request-driven cache window", () => {
    expect(PRODUCT_SITEMAP_REVALIDATE_SECONDS).toBe(21_600);
  });
});

type ProductFindManyArgs = Parameters<ProductSitemapReadClient["product"]["findMany"]>[0];

function fakeProductSitemapClient(ids: string[]) {
  const state = {
    lastFindManyArgs: undefined as ProductFindManyArgs | undefined,
  };

  return {
    get lastFindManyArgs() {
      return state.lastFindManyArgs;
    },
    product: {
      async findMany(args) {
        state.lastFindManyArgs = args;

        return ids.map((id) => ({ id }));
      },
    },
  } satisfies ProductSitemapReadClient & { lastFindManyArgs?: ProductFindManyArgs };
}

function extractLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}
