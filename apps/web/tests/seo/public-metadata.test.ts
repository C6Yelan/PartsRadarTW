// apps/web/tests/seo/public-metadata.test.ts
// 驗證公開 origin、crawler 規則與穩定 sitemap 路由。

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_SITE_URL, resolvePublicSiteUrl } from "../../app/_shared/public-site";
import HomePage, { metadata as homeMetadata } from "../../app/page";
import { metadata as priceReportMetadata } from "../../app/price-report/page";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public site metadata routes", () => {
  it("publishes the exact homepage search-intent metadata and visible topic", () => {
    expect(homeMetadata).toMatchObject({
      title: "台灣電腦零件價格查詢與追蹤 | PartsRadarTW",
      description:
        "查詢原價屋 CPU、主機板、顯示卡、SSD 等電腦零件價格，支援規格篩選、近期價格變動與 Discord 目標價提醒。",
      alternates: {
        canonical: "/",
      },
    });
    expect(homeMetadata).not.toHaveProperty("keywords");

    const explorer = Children.only(HomePage().props.children);
    if (!isValidElement<{ children?: ReactNode }>(explorer)) {
      throw new Error("Expected ProductExplorer inside the homepage Suspense boundary.");
    }

    const topic = Children.only(explorer.props.children);
    if (!isValidElement<{ children?: ReactNode; className?: string }>(topic)) {
      throw new Error("Expected a visible homepage topic inside ProductExplorer.");
    }

    const topicChildren = Children.toArray(topic.props.children);
    const heading = topicChildren.find(isHeading);
    const description = topicChildren.find(isParagraph);

    expect(topic.props.className).toBe("home-topic");
    expect(heading?.props.children).toBe("台灣電腦零件價格查詢與追蹤");
    expect(description?.props.children).toBe(
      "查詢原價屋 CPU、主機板、顯示卡、SSD 等電腦零件價格，並使用規格篩選、近期價格變動與目標價提醒功能。",
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

function isHeading(child: ReactNode): child is ReactElement<{ children: ReactNode }> {
  return isValidElement<{ children: ReactNode }>(child) && child.type === "h1";
}

function isParagraph(child: ReactNode): child is ReactElement<{ children: ReactNode }> {
  return isValidElement<{ children: ReactNode }>(child) && child.type === "p";
}
