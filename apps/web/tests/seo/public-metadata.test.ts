// apps/web/tests/seo/public-metadata.test.ts
// 驗證公開 origin、crawler 規則與穩定 sitemap 路由。

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_SITE_URL, resolvePublicSiteUrl } from "../../app/_shared/public-site";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";

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
