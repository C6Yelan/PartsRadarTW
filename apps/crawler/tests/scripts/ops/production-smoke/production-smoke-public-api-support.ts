// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-public-api-support.ts
// 提供 production smoke 測試共用的 public API stub。

import { vi } from "vitest";

// Stub public HTTP endpoints，讓 production smoke 測試可控制頁面、API、圖片與 rate-limit header 狀態。
export function stubHealthyPublicApi({
  buildListStatus = 200,
  categorySlugs = [
    "cpu",
    "motherboard",
    "memory",
    "storage",
    "hard-drive",
    "external-storage",
    "cooler",
    "liquid-cooling",
    "gpu",
    "case",
    "power-supply",
    "fan-accessory",
  ],
  includeCategoryFacets = true,
  imageStatus = 200,
  imageStatusByProductId = new Map<string, number>(),
  nullImageProductIds = new Set<string>(),
  productCount = 1,
  rateLimitClientSource = "cf",
}: {
  buildListStatus?: number;
  categorySlugs?: string[];
  includeCategoryFacets?: boolean;
  imageStatus?: number;
  imageStatusByProductId?: Map<string, number>;
  nullImageProductIds?: Set<string>;
  productCount?: number;
  rateLimitClientSource?: string;
} = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));

      if (url.pathname === "/") {
        return new Response("<!doctype html>", { status: 200 });
      }

      if (url.pathname === "/build-list") {
        return new Response("<!doctype html>", { status: buildListStatus });
      }

      if (url.pathname === "/api/source-status") {
        return Response.json({
          status: "ok",
          lastSuccessAt: "2026-06-02T11:50:00.000Z",
        });
      }

      if (url.pathname === "/api/categories") {
        return Response.json({
          data: categorySlugs.map((slug) => ({
            slug,
            ...(includeCategoryFacets
              ? { facets: [{ key: "example", options: [{ value: "yes" }] }] }
              : {}),
          })),
        });
      }

      if (url.pathname === "/api/products") {
        return Response.json(
          {
            data: Array.from({ length: productCount }, (_, index) => {
              const id = `product-${index + 1}`;

              return {
                id,
                image: nullImageProductIds.has(id)
                  ? null
                  : {
                      url: `/api/product-images/${id}.webp`,
                    },
              };
            }),
            pagination: { totalItems: 1 },
          },
          {
            headers: {
              "X-RateLimit-Client-Source": rateLimitClientSource,
              "X-RateLimit-Limit": "360",
              "X-RateLimit-Remaining": "359",
              "X-RateLimit-Reset": "1780411200",
            },
          },
        );
      }

      if (url.pathname === "/api/products/product-1") {
        return Response.json({ id: "product-1" });
      }

      const productImageMatch = url.pathname.match(/^\/api\/product-images\/(product-\d+)\.webp$/);

      if (productImageMatch) {
        const status = imageStatusByProductId.get(productImageMatch[1]) ?? imageStatus;

        return new Response(status === 200 ? "webp" : "not found", {
          status,
          headers: status === 200 ? { "content-type": "image/webp" } : undefined,
        });
      }

      if (url.pathname === "/api/products/product-1/price-history") {
        return Response.json({ points: [] });
      }

      return new Response("not found", { status: 404 });
    }),
  );
}
