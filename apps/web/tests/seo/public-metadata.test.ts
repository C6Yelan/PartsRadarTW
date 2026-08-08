// apps/web/tests/seo/public-metadata.test.ts
// 驗證公開 origin、crawler 規則與穩定 sitemap 路由。

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_SITE_URL, resolvePublicSiteUrl } from "../../app/_shared/public-site";
import robots from "../../app/robots";
import { createSitemap, PRODUCT_SITEMAP_LIMIT, type SitemapReadClient } from "../../app/sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public site metadata routes", () => {
  it("normalizes trusted HTTP origins and falls back for invalid input", () => {
    expect(resolvePublicSiteUrl("https://preview.partsradar.net/path?q=1#status")).toBe(
      "https://preview.partsradar.net",
    );
    expect(resolvePublicSiteUrl("ftp://example.com")).toBe(DEFAULT_PUBLIC_SITE_URL);
    expect(resolvePublicSiteUrl("not a url")).toBe(DEFAULT_PUBLIC_SITE_URL);
  });

  it("uses the configured public origin when no explicit value is provided", () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", "https://staging.partsradar.net/deploy");

    expect(resolvePublicSiteUrl()).toBe("https://staging.partsradar.net");
  });

  it("publishes crawler rules without hiding the build-list noindex metadata", () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", DEFAULT_PUBLIC_SITE_URL);

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      sitemap: "https://partsradar.net/sitemap.xml",
    });
  });

  it("lists stable public pages and bounded canonical product URLs", async () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", DEFAULT_PUBLIC_SITE_URL);
    const lastSeenAt = new Date("2026-08-08T08:30:00.000Z");
    const client = fakeSitemapClient({
      categories: [{ igrp: 4 }],
      products: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          currentPrice: { lastSeenAt },
        },
      ],
    });

    const entries = await createSitemap(client);
    const urls = new Set(entries.map((entry) => entry.url));

    expect(urls).toEqual(
      new Set([
        "https://partsradar.net/",
        "https://partsradar.net/about",
        "https://partsradar.net/announcements",
        "https://partsradar.net/categories/cpu",
        "https://partsradar.net/discord",
        "https://partsradar.net/price-report",
        "https://partsradar.net/privacy",
        "https://partsradar.net/products/11111111-1111-4111-8111-111111111111",
        "https://partsradar.net/terms",
      ]),
    );
    expect(entries.at(-1)?.lastModified).toEqual(lastSeenAt);
    expect(client.lastCategoryFindManyArgs).toMatchObject({
      where: {
        enabled: true,
        igrp: { in: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16] },
      },
      orderBy: { igrp: "asc" },
      take: 12,
      select: { igrp: true },
    });
    expect(client.lastProductFindManyArgs).toMatchObject({
      where: {
        isActive: true,
        isExcluded: false,
        sourceCategory: { enabled: true },
        currentPrice: {
          is: {
            priceSnapshot: {
              price: {},
            },
          },
        },
      },
      orderBy: { id: "asc" },
      take: PRODUCT_SITEMAP_LIMIT,
      select: {
        id: true,
        currentPrice: { select: { lastSeenAt: true } },
      },
    });
    expect(
      [...urls].some(
        (url) => url.includes("?") || url.includes("/api/") || url.includes("/build-list"),
      ),
    ).toBe(false);
  });
});

type ProductSitemapFindManyArgs = Parameters<SitemapReadClient["product"]["findMany"]>[0];
type ProductSitemapRecord = Awaited<ReturnType<SitemapReadClient["product"]["findMany"]>>[number];
type CategorySitemapFindManyArgs = Parameters<SitemapReadClient["sourceCategory"]["findMany"]>[0];
type CategorySitemapRecord = Awaited<
  ReturnType<SitemapReadClient["sourceCategory"]["findMany"]>
>[number];

function fakeSitemapClient({
  categories,
  products,
}: {
  categories: CategorySitemapRecord[];
  products: ProductSitemapRecord[];
}) {
  const state = {
    lastCategoryFindManyArgs: null as CategorySitemapFindManyArgs | null,
    lastProductFindManyArgs: null as ProductSitemapFindManyArgs | null,
  };

  return {
    get lastCategoryFindManyArgs() {
      return state.lastCategoryFindManyArgs;
    },
    get lastProductFindManyArgs() {
      return state.lastProductFindManyArgs;
    },
    sourceCategory: {
      async findMany(args) {
        state.lastCategoryFindManyArgs = args;

        return categories;
      },
    },
    product: {
      async findMany(args) {
        state.lastProductFindManyArgs = args;

        return products;
      },
    },
  } satisfies SitemapReadClient & {
    lastCategoryFindManyArgs: CategorySitemapFindManyArgs | null;
    lastProductFindManyArgs: ProductSitemapFindManyArgs | null;
  };
}
