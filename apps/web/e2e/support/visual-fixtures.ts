// apps/web/e2e/support/visual-fixtures.ts
// 提供視覺 E2E 規格共用的不可變資料與回應 builders，不持有跨測試狀態。

import { getPublicProductFacetDefinitions } from "@partsradar/shared";

const VISUAL_BASE_URL = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100");

export const isVisualLoopback = ["127.0.0.1", "localhost", "::1"].includes(
  VISUAL_BASE_URL.hostname,
);

export const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
export const READY_ROUTE_SLUG = "visual-ready-product";
const PRICE_REPORT_WRAP_NAME = "AI PRO R9700 Creator / Lexar D400 / Type-C+A / USB3.1 G1";

const OBSERVED_AT = "2026-07-10T08:00:00.000Z";
const PRICE_REPORT_LONG_SPEC_NAME = "32GB(2920MHz/27cm/鼓風扇/註冊五年保)";

export function buildJsonResponse(body: unknown) {
  return {
    contentType: "application/json",
    body: JSON.stringify(body),
    status: 200,
  } as const;
}

export function buildVisualProduct() {
  return {
    id: PRODUCT_ID,
    name: "視覺驗證顯示卡 RTX",
    category: {
      id: "33333333-3333-4333-8333-333333333333",
      igrp: 12,
      displayName: "顯示卡",
      sourceName: "顯示卡 VGA",
    },
    image: null,
    price: {
      amount: 18_990,
      currency: "TWD",
      capturedAt: OBSERVED_AT,
      lastSeenAt: OBSERVED_AT,
    },
    source: {
      name: "coolpc",
      url: "https://coolpc.invalid/products/visual-layout",
    },
    status: {
      isActive: true,
      isExcluded: false,
      exclusionReason: null,
    },
    lastSeenAt: OBSERVED_AT,
  };
}

export function buildVisualCategories() {
  const product = buildVisualProduct();

  return {
    data: [
      {
        id: product.category.id,
        slug: "gpu",
        displayName: product.category.displayName,
        sourceName: product.category.sourceName,
        facets: [
          {
            key: "gpu_chip",
            label: "GPU 晶片",
            options: [
              { value: "nvidia", label: "NVIDIA" },
              { value: "amd", label: "AMD" },
            ],
          },
          {
            key: "vram_gb",
            label: "顯示記憶體",
            options: [
              { value: "8", label: "8 GB" },
              { value: "16", label: "16 GB" },
            ],
          },
        ],
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        slug: "cpu",
        displayName: "CPU",
        sourceName: "處理器 CPU",
        facets: [
          {
            key: "socket",
            label: "腳位",
            options: [
              { value: "lga1851", label: "LGA 1851" },
              { value: "lga1700", label: "LGA 1700" },
              { value: "am5", label: "AM5" },
              { value: "am4", label: "AM4" },
              { value: "str5", label: "sTR5 / Threadripper" },
            ],
          },
          {
            key: "cpu_family",
            label: "產品系列",
            options: [
              { value: "core-i3", label: "Intel Core i3" },
              { value: "core-i5", label: "Intel Core i5" },
            ],
          },
          {
            key: "integrated_graphics",
            label: "內建顯示",
            options: [
              { value: "yes", label: "有內顯" },
              { value: "no", label: "無內顯" },
            ],
          },
        ],
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        slug: "motherboard",
        displayName: "主機板",
        sourceName: "主機板 MB",
        facets: getPublicProductFacetDefinitions(5),
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        slug: "memory",
        displayName: "記憶體",
        sourceName: "記憶體 RAM",
        facets: getPublicProductFacetDefinitions(6),
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        slug: "storage",
        displayName: "SSD",
        sourceName: "固態 SSD",
        facets: getPublicProductFacetDefinitions(7),
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        slug: "hard-drive",
        displayName: "HDD",
        sourceName: "內接硬碟 HDD",
        facets: getPublicProductFacetDefinitions(8),
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        slug: "external-storage",
        displayName: "外接儲存",
        sourceName: "USB週邊 / 硬碟座 / 讀卡機",
        facets: getPublicProductFacetDefinitions(9),
      },
      {
        id: "10101010-1010-4010-8010-101010101010",
        slug: "cooler",
        displayName: "散熱器",
        sourceName: "散熱器",
        facets: getPublicProductFacetDefinitions(10),
      },
      {
        id: "11111111-1111-4111-8111-111111111110",
        slug: "liquid-cooling",
        displayName: "水冷",
        sourceName: "水冷",
        facets: getPublicProductFacetDefinitions(11),
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        slug: "case",
        displayName: "機殼",
        sourceName: "機殼 CASE",
        facets: getPublicProductFacetDefinitions(14),
      },
      {
        id: "15151515-1515-4515-8515-151515151515",
        slug: "power-supply",
        displayName: "電源供應器",
        sourceName: "電源供應器",
        facets: getPublicProductFacetDefinitions(15),
      },
      {
        id: "16161616-1616-4616-8616-161616161616",
        slug: "fan-accessory",
        displayName: "風扇 / 配件",
        sourceName: "風扇 / 配件",
        facets: getPublicProductFacetDefinitions(16),
      },
    ],
  };
}

export function buildSourceStatusResponse(fixture: string | null) {
  return {
    source: "coolpc",
    status: fixture === "stale" ? "stale" : "ok",
    lastCheckedAt: OBSERVED_AT,
    lastSuccessAt: "2026-07-10T07:30:00.000Z",
    categories: [
      {
        igrp: 4,
        displayName: "CPU",
        sourceName: "處理器 CPU",
        status: "ok",
        lastCheckedAt: OBSERVED_AT,
        lastSuccessAt: "2026-07-10T07:50:00.000Z",
      },
      {
        igrp: 12,
        displayName: "顯示卡",
        sourceName: "顯示卡 VGA",
        status: fixture === "stale" ? "stale" : "ok",
        lastCheckedAt: OBSERVED_AT,
        lastSuccessAt: "2026-07-10T06:00:00.000Z",
      },
      {
        igrp: 7,
        displayName: "SSD",
        sourceName: "固態 SSD",
        status: fixture === "stale" ? "unavailable" : "ok",
        lastCheckedAt: OBSERVED_AT,
        lastSuccessAt: fixture === "stale" ? null : "2026-07-10T07:40:00.000Z",
      },
    ],
  };
}

export function buildProductListResponse(requestUrl: URL) {
  const product = buildVisualProduct();
  const pageNumber = Number(requestUrl.searchParams.get("page") ?? "1");
  const showsPriceRise = requestUrl.searchParams.get("sort") === "price_rise_desc";
  const vendorsByCategory = {
    cpu: [
      { slug: "intel", name: "Intel" },
      { slug: "amd", name: "AMD" },
      { slug: "asrock", name: "ASRock" },
      { slug: "gigabyte", name: "GIGABYTE" },
    ],
    motherboard: [
      { slug: "asus", name: "ASUS" },
      { slug: "msi", name: "MSI" },
    ],
    gpu: [
      { slug: "gigabyte", name: "GIGABYTE" },
      { slug: "sapphire", name: "SAPPHIRE" },
    ],
    "external-storage": [
      { slug: "kingston", name: "金士頓" },
      { slug: "gigastone", name: "GIGASTONE" },
      { slug: "adata", name: "威剛" },
    ],
  };
  const category = requestUrl.searchParams.get("category") ?? "";
  const selectedFacets = requestUrl.searchParams.getAll("facet");
  const motherboardChipset = selectedFacets.find((facet) => facet.startsWith("chipset:"));
  const responseProduct =
    category === "motherboard"
      ? {
          ...product,
          name:
            motherboardChipset === "chipset:w680"
              ? "測試 W680 工作站主機板"
              : "測試 H81 舊平台主機板",
          category: {
            id: "88888888-8888-4888-8888-888888888888",
            igrp: 5,
            displayName: "主機板",
            sourceName: "主機板 MB",
          },
        }
      : product;

  return {
    data: [
      {
        ...responseProduct,
        priceMovement: {
          rangeDays: 30,
          deltaAmount: showsPriceRise ? 300 : -300,
          deltaPercent: showsPriceRise ? 4.8 : -4.8,
        },
      },
    ],
    pagination: {
      page: pageNumber,
      pageSize: 20,
      totalItems: 400,
      totalPages: 20,
    },
    meta: {
      sourceStatus: "ok",
      lastSuccessAt: OBSERVED_AT,
      vendors: vendorsByCategory[category as keyof typeof vendorsByCategory] ?? [],
    },
  };
}

export function buildPriceHistoryResponse() {
  return {
    range: "90d",
    rangeDays: 90,
    points: [
      {
        amount: 21_990,
        observedAt: "2026-06-01T08:00:00.000Z",
        observationType: "price_snapshot",
      },
      {
        amount: 20_990,
        observedAt: "2026-06-12T08:00:00.000Z",
        observationType: "price_snapshot",
      },
      {
        amount: 19_990,
        observedAt: "2026-06-24T08:00:00.000Z",
        observationType: "price_snapshot",
      },
      {
        amount: 18_990,
        observedAt: OBSERVED_AT,
        observationType: "current_price_confirmation",
      },
    ],
  };
}

export function buildDefaultBuildListRefreshResponse() {
  const product = buildVisualProduct();

  return {
    data: [
      {
        id: product.id,
        name: product.name,
        image: product.image,
        category: { displayName: product.category.displayName },
        price: { amount: product.price.amount, currency: product.price.currency },
        source: { url: product.source.url },
        status: product.status,
        lastSeenAt: product.lastSeenAt,
      },
    ],
    missingProductIds: [],
  };
}

export function buildPriceReportResponse(requestUrl: URL) {
  const isEmpty = requestUrl.searchParams.get("q") === "empty";
  const isStale = requestUrl.searchParams.get("q") === "stale";
  const isUnavailable = requestUrl.searchParams.get("q") === "unavailable";
  const pageNumber = Number(requestUrl.searchParams.get("page") ?? "1");
  const selectedCategories = requestUrl.searchParams.getAll("category");
  const reportItems = [
    {
      productId: PRODUCT_ID,
      productName: PRICE_REPORT_WRAP_NAME,
      image: {
        url: "/favicon.svg",
        alt: PRICE_REPORT_WRAP_NAME,
      },
      category: { igrp: 16, slug: "fan-accessory", displayName: "風扇／配件" },
      previousPrice: 19_990,
      currentPrice: 18_990,
      currency: "TWD",
      deltaAmount: -1_000,
      deltaPercent: -5,
      changedAt: OBSERVED_AT,
      kind: "drop",
    },
    {
      productId: "22222222-2222-4222-8222-222222222222",
      productName: PRICE_REPORT_LONG_SPEC_NAME,
      image: null,
      category: { igrp: 4, slug: "cpu", displayName: "CPU" },
      previousPrice: 10_000,
      currentPrice: 10_500,
      currency: "TWD",
      deltaAmount: 500,
      deltaPercent: 5,
      changedAt: OBSERVED_AT,
      kind: "rise",
    },
    {
      productId: "33333333-3333-4333-8333-333333333333",
      productName: "視覺驗證顯示卡商品",
      image: null,
      category: { igrp: 12, slug: "gpu", displayName: "顯示卡" },
      previousPrice: 20_000,
      currentPrice: 19_000,
      currency: "TWD",
      deltaAmount: -1_000,
      deltaPercent: -5,
      changedAt: OBSERVED_AT,
      kind: "drop",
    },
  ]
    .filter(
      (item) => selectedCategories.length === 0 || selectedCategories.includes(item.category.slug),
    )
    .slice(0, selectedCategories.length === 0 ? 2 : undefined);

  return {
    data: isEmpty ? [] : reportItems,
    summary: {
      dropCount: isEmpty ? 0 : 20,
      riseCount: isEmpty ? 0 : 20,
      newProductCount: 0,
    },
    pagination: {
      page: pageNumber,
      pageSize: 20,
      totalItems: isEmpty ? 0 : 40,
      totalPages: isEmpty ? 0 : 2,
    },
    meta: {
      window: "24h",
      since: "2026-07-09T08:00:00.000Z",
      until: OBSERVED_AT,
      sourceStatus: isUnavailable ? "unavailable" : isStale ? "stale" : "ok",
      lastSuccessAt: isUnavailable ? null : OBSERVED_AT,
    },
  };
}
