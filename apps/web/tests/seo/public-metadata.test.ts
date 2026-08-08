// apps/web/tests/seo/public-metadata.test.ts
// 驗證公開 origin、crawler 規則與穩定 sitemap 路由。

import { Children, isValidElement, type ReactElement, type ReactNode, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_SITE_URL, resolvePublicSiteUrl } from "../../app/_shared/public-site";
import HomePage, {
  createHomepageStructuredData,
  HOMEPAGE_DESCRIPTION,
  metadata as homeMetadata,
  serializeHomepageStructuredData,
} from "../../app/page";
import { metadata as priceReportMetadata } from "../../app/price-report/page";
import ProductExplorer from "../../app/product-explorer/ProductExplorer";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public site metadata routes", () => {
  it("publishes homepage metadata and structured data without a visible SEO intro", () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", DEFAULT_PUBLIC_SITE_URL);

    expect(homeMetadata).toMatchObject({
      title: "台灣電腦零件價格查詢與追蹤 | PartsRadarTW",
      description: HOMEPAGE_DESCRIPTION,
      alternates: {
        canonical: "/",
      },
    });
    expect(homeMetadata).not.toHaveProperty("keywords");

    const pageChildren = Children.toArray(HomePage().props.children);
    const script = pageChildren.find(isStructuredDataScript);
    const suspense = pageChildren.find(isSuspenseElement);

    if (!script || !suspense) {
      throw new Error("Expected homepage structured data and ProductExplorer boundary.");
    }

    const explorer = Children.only(suspense.props.children);
    if (!isValidElement<{ routeState: { category: string | null } }>(explorer)) {
      throw new Error("Expected ProductExplorer inside the homepage Suspense boundary.");
    }

    const serialized = script.props.children;
    const schema = JSON.parse(serialized);

    expect(explorer.type).toBe(ProductExplorer);
    expect(explorer.props).toEqual({ routeState: { category: null } });
    expect(script.props.id).toBe("website-structured-data");
    expect(script.props.type).toBe("application/ld+json");
    expect(schema).toEqual(createHomepageStructuredData());
    expect(schema).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "PartsRadarTW",
      url: "https://partsradar.net/",
      description: HOMEPAGE_DESCRIPTION,
      inLanguage: "zh-TW",
    });
    expect(serialized).not.toContain("<");
    expect(serialized).not.toMatch(/AggregateRating|Review|totalItems|productCount|userCount/);
    expect(serializeHomepageStructuredData("https://preview.partsradar.net/path?q=1")).toContain(
      '"url":"https://preview.partsradar.net/"',
    );
  });

  it("publishes the exact price-report metadata", () => {
    expect(priceReportMetadata).toMatchObject({
      title: "電腦零件降價與價格變動 | PartsRadarTW",
      description:
        "查看原價屋電腦零件近期降價、漲價與新增商品，掌握 CPU、顯示卡、SSD 等零件價格變動。",
      alternates: {
        canonical: "/price-report",
      },
    });
    expect(priceReportMetadata).not.toHaveProperty("keywords");
  });

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
      sitemap: [
        "https://partsradar.net/sitemap.xml",
        "https://partsradar.net/products/sitemap.xml",
      ],
    });
  });

  it("lists exactly the 16 frozen canonical URLs without dynamic metadata fields", () => {
    vi.stubEnv("PARTSRADAR_PUBLIC_BASE_URL", DEFAULT_PUBLIC_SITE_URL);

    const urls = new Set(sitemap().map((entry) => entry.url));

    expect(urls).toEqual(
      new Set([
        "https://partsradar.net/",
        "https://partsradar.net/about",
        "https://partsradar.net/categories/case",
        "https://partsradar.net/categories/cooler",
        "https://partsradar.net/categories/cpu",
        "https://partsradar.net/categories/external-storage",
        "https://partsradar.net/categories/fan-accessory",
        "https://partsradar.net/categories/gpu",
        "https://partsradar.net/categories/hard-drive",
        "https://partsradar.net/categories/liquid-cooling",
        "https://partsradar.net/categories/memory",
        "https://partsradar.net/categories/motherboard",
        "https://partsradar.net/categories/power-supply",
        "https://partsradar.net/categories/storage",
        "https://partsradar.net/discord",
        "https://partsradar.net/price-report",
      ]),
    );
    expect(urls.size).toBe(16);
    expect(sitemap().every((entry) => Object.keys(entry).length === 1)).toBe(true);
    expect(
      [...urls].some(
        (url) =>
          url.includes("/api/") ||
          url.includes("/products/") ||
          url.includes("?") ||
          url.endsWith("/announcements") ||
          url.endsWith("/privacy") ||
          url.endsWith("/terms"),
      ),
    ).toBe(false);
  });
});

function isStructuredDataScript(child: ReactNode): child is ReactElement<{
  children: string;
  id: string;
  type: string;
}> {
  return isValidElement(child) && child.type === "script";
}

function isSuspenseElement(child: ReactNode): child is ReactElement<{ children: ReactNode }> {
  return isValidElement(child) && child.type === Suspense;
}
