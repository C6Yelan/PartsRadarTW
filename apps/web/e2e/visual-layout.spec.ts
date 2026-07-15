// apps/web/e2e/visual-layout.spec.ts
// 以本地 mock API 驗證指定 viewport 的主要頁面、focus、空狀態與水平 overflow。

import { getProductFacetDefinitions } from "@partsradar/shared";
import { expect, type Locator, type Page, type Route, type TestInfo, test } from "@playwright/test";

const visualBaseUrl = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100");
const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(visualBaseUrl.hostname);

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const READY_ROUTE_SLUG = "visual-ready-product";
const ERROR_ROUTE_SLUG = "visual-error-product";
const OBSERVED_AT = "2026-07-10T08:00:00.000Z";
const PRICE_REPORT_WRAP_NAME = "AI PRO R9700 Creator / Lexar D400 / Type-C+A / USB3.1 G1";
const PRICE_REPORT_LONG_SPEC_NAME = "32GB(2920MHz/27cm/鼓風扇/註冊五年保)";
let releasePriceReportLoading: (() => void) | null = null;
let holdNextProductsRequest = false;
let releaseHeldProductsRequest: (() => void) | null = null;

const product = {
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
  },
  lastSeenAt: OBSERVED_AT,
};

test.beforeEach(async ({ page }) => {
  test.skip(!isLoopback, "Visual layout tests only run against a loopback web server.");
  releasePriceReportLoading = null;
  holdNextProductsRequest = false;
  releaseHeldProductsRequest = null;

  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.pathname === "/api/categories") {
      await fulfillJson(route, {
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
            facets: getProductFacetDefinitions(5),
          },
          {
            id: "99999999-9999-4999-8999-999999999999",
            slug: "memory",
            displayName: "記憶體",
            sourceName: "記憶體 RAM",
            facets: getProductFacetDefinitions(6),
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            slug: "storage",
            displayName: "SSD",
            sourceName: "固態 SSD",
            facets: getProductFacetDefinitions(7),
          },
          {
            id: "66666666-6666-4666-8666-666666666666",
            slug: "hard-drive",
            displayName: "HDD",
            sourceName: "內接硬碟 HDD",
            facets: getProductFacetDefinitions(8),
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            slug: "external-storage",
            displayName: "外接儲存",
            sourceName: "USB週邊 / 硬碟座 / 讀卡機",
            facets: getProductFacetDefinitions(9),
          },
          {
            id: "10101010-1010-4010-8010-101010101010",
            slug: "cooler",
            displayName: "散熱器",
            sourceName: "散熱器",
            facets: getProductFacetDefinitions(10),
          },
          {
            id: "11111111-1111-4111-8111-111111111110",
            slug: "liquid-cooling",
            displayName: "水冷",
            sourceName: "水冷",
            facets: getProductFacetDefinitions(11),
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            slug: "case",
            displayName: "機殼",
            sourceName: "機殼 CASE",
            facets: getProductFacetDefinitions(14),
          },
          {
            id: "15151515-1515-4515-8515-151515151515",
            slug: "power-supply",
            displayName: "電源供應器",
            sourceName: "電源供應器",
            facets: getProductFacetDefinitions(15),
          },
          {
            id: "16161616-1616-4616-8616-161616161616",
            slug: "fan-accessory",
            displayName: "風扇 / 配件",
            sourceName: "風扇 / 配件",
            facets: getProductFacetDefinitions(16),
          },
        ],
      });
      return;
    }

    if (requestUrl.pathname === "/api/source-status") {
      const fixture = new URL(page.url()).searchParams.get("fixture");
      if (fixture === "error") {
        await route.fulfill({ status: 503, body: "" });
        return;
      }

      await fulfillJson(route, {
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
      });
      return;
    }

    if (requestUrl.pathname === "/api/products" && requestUrl.searchParams.get("q") === "error") {
      await route.fulfill({ status: 503, body: "" });
      return;
    }

    if (requestUrl.pathname === "/api/products") {
      const pageNumber = Number(requestUrl.searchParams.get("page") ?? "1");
      const showsPriceRise = requestUrl.searchParams.get("q") === "rise";
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
      if (holdNextProductsRequest) {
        holdNextProductsRequest = false;
        await new Promise<void>((resolve) => {
          releaseHeldProductsRequest = resolve;
        });
        releaseHeldProductsRequest = null;
      }
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
      await fulfillJson(route, {
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
      });
      return;
    }

    if (requestUrl.pathname === `/api/products/${ERROR_ROUTE_SLUG}`) {
      await route.fulfill({ status: 503, body: "" });
      return;
    }

    if (requestUrl.pathname === `/api/products/${READY_ROUTE_SLUG}`) {
      await fulfillJson(route, product);
      return;
    }

    if (requestUrl.pathname === `/api/products/${PRODUCT_ID}/price-history`) {
      await fulfillJson(route, {
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
      });
      return;
    }

    if (requestUrl.pathname === "/api/build-list/refresh") {
      await fulfillJson(route, {
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
      });
      return;
    }

    if (requestUrl.pathname === "/api/price-report") {
      if (requestUrl.searchParams.get("q") === "error") {
        await route.fulfill({ status: 503, body: "" });
        return;
      }

      if (requestUrl.searchParams.get("q") === "loading") {
        await new Promise<void>((resolve) => {
          releasePriceReportLoading = resolve;
        });
        releasePriceReportLoading = null;
      }

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
          (item) =>
            selectedCategories.length === 0 || selectedCategories.includes(item.category.slug),
        )
        .slice(0, selectedCategories.length === 0 ? 2 : undefined);

      await fulfillJson(route, {
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
      });
      return;
    }

    await route.fulfill({ status: 404, body: "" });
  });
});

test("shows separate SSD, HDD, and external-storage filters @desktop-only", async ({ page }) => {
  await page.goto("/?category=hard-drive");

  const categories = page.getByRole("radiogroup", { name: "分類" });
  await expect(categories.getByText("SSD", { exact: true })).toBeVisible();
  await expect(categories.getByText("HDD", { exact: true })).toBeVisible();
  await expect(categories.getByText("外接儲存", { exact: true })).toBeVisible();
  await expect(page.locator(".facet-filter").filter({ hasText: "硬碟用途" })).toBeVisible();

  await categories.getByText("外接儲存", { exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("category"))
    .toBe("external-storage");
  await expect(page.locator(".facet-filter").filter({ hasText: "商品類型" })).toBeVisible();
});

test("keeps the product toolbar compact and readable across its layout boundary @desktop-only", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => window.localStorage.clear());

  const viewports = [
    { width: 1760, height: 900 },
    { width: 1310, height: 800 },
    { width: 1309, height: 800 },
    { width: 1308, height: 800 },
    { width: 1280, height: 800 },
    { width: 1024, height: 800 },
    { width: 1000, height: 800 },
    { width: 900, height: 800 },
    { width: 800, height: 800 },
    { width: 761, height: 844 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ];
  const viewportDimensions: Array<{ clientWidth: number; scrollWidth: number; width: number }> = [];
  const groupSelector = [
    ".toolbar-controls > .toolbar-price-filter",
    ".toolbar-controls > .toolbar-status-filter",
    ".toolbar-controls > .vendor-filter",
    ".toolbar-controls > .facet-filter",
  ].join(", ");

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/?category=cpu");
    await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();

    const priceInputs = page.locator(".toolbar-price-grid input");
    await expect(priceInputs).toHaveCount(2);
    for (const input of await priceInputs.all()) {
      const placeholderFit = await input.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) return null;
        const styles = window.getComputedStyle(element);
        const context = document.createElement("canvas").getContext("2d");
        if (!context) return null;
        context.font = styles.font;
        return {
          availableWidth:
            element.clientWidth -
            Number.parseFloat(styles.paddingLeft) -
            Number.parseFloat(styles.paddingRight),
          placeholder: element.placeholder,
          textWidth: context.measureText(element.placeholder).width,
        };
      });
      expect(placeholderFit).not.toBeNull();
      expect(["最低價格", "最高價格"]).toContain(placeholderFit?.placeholder);
      expect(placeholderFit?.textWidth ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        placeholderFit?.availableWidth ?? 0,
      );
      await expect(input).toHaveCSS("text-align", "center");
    }

    const statusButtons = page.locator(".toolbar-segmented-control button");
    await expect(statusButtons).toHaveCount(3);
    for (const button of await statusButtons.all()) {
      const textLayout = await button.evaluate((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        whiteSpace: window.getComputedStyle(element).whiteSpace,
      }));
      expect(textLayout.whiteSpace).toBe("nowrap");
      expect(textLayout.scrollWidth).toBeLessThanOrEqual(textLayout.clientWidth);
      expect(textLayout.scrollHeight).toBeLessThanOrEqual(textLayout.clientHeight);
    }

    const controls = page.locator(".toolbar-controls");
    const controlsBox = await controls.boundingBox();
    const groupBoxes = await page.locator(groupSelector).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      }),
    );
    expect(controlsBox).not.toBeNull();
    expect(groupBoxes.length).toBe(6);

    if (viewport.width > 760) {
      const toolbarGap = await controls.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return { columnGap: styles.columnGap, rowGap: styles.rowGap };
      });
      expect(toolbarGap).toEqual({ columnGap: "8px", rowGap: "8px" });
      for (const input of await priceInputs.all()) {
        expect((await input.boundingBox())?.width).toBeCloseTo(92, 0);
      }
      expect((await page.locator(".toolbar-status-filter").boundingBox())?.width).toBeLessThan(300);
      expect((await page.locator(".vendor-menu-trigger").boundingBox())?.width).toBeCloseTo(112, 0);
      for (const trigger of await page.locator(".facet-menu-trigger").all()) {
        expect((await trigger.boundingBox())?.width).toBeCloseTo(112, 0);
      }
    }

    if (viewport.width === 1760) {
      const firstCenter = (groupBoxes[0].top + groupBoxes[0].bottom) / 2;
      expect(
        groupBoxes.every((box) => Math.abs((box.top + box.bottom) / 2 - firstCenter) <= 1),
      ).toBe(true);
      for (let index = 1; index < groupBoxes.length; index += 1) {
        expect(groupBoxes[index].left - groupBoxes[index - 1].right).toBeCloseTo(8, 0);
      }
      const lastGroup = groupBoxes.at(-1);
      expect(lastGroup).toBeDefined();
      expect(
        (controlsBox?.x ?? 0) + (controlsBox?.width ?? 0) - (lastGroup?.right ?? 0),
      ).toBeGreaterThan(20);
    } else if (viewport.width > 760) {
      if ([1280, 761].includes(viewport.width)) {
        expect(new Set(groupBoxes.map((box) => Math.round(box.top))).size).toBeGreaterThan(1);
      }
      for (const box of groupBoxes) {
        expect(box.width).toBeLessThanOrEqual(controlsBox?.width ?? 0);
      }
    } else {
      for (const box of groupBoxes) {
        expect(box.width).toBeCloseTo(controlsBox?.width ?? 0, 0);
      }
      const fullWidthControls = [
        page.locator(".toolbar-price-grid"),
        page.locator(".toolbar-segmented-control"),
        page.locator(".vendor-menu"),
        page.locator(".facet-menu").first(),
      ];
      for (const control of fullWidthControls) {
        const [controlBox, parentBox] = await Promise.all([
          control.boundingBox(),
          control.locator("..").boundingBox(),
        ]);
        expect(controlBox?.width).toBeCloseTo(parentBox?.width ?? 0, 0);
      }
    }

    for (let firstIndex = 0; firstIndex < groupBoxes.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < groupBoxes.length; secondIndex += 1) {
        const first = groupBoxes[firstIndex];
        const second = groupBoxes[secondIndex];
        const overlaps =
          first.left < second.right - 0.5 &&
          first.right > second.left + 0.5 &&
          first.top < second.bottom - 0.5 &&
          first.bottom > second.top + 0.5;
        expect(overlaps).toBe(false);
      }
    }

    const productRow = page.locator(".product-row").first();
    const tableHeader = page.locator(".table-header");
    const usesCompactTable = viewport.width <= 1309;
    if (usesCompactTable) {
      await expect(tableHeader).toBeHidden();
      await expect(productRow.locator(".row-price .cell-label")).toBeVisible();
    } else {
      await expect(tableHeader).toBeVisible();
      await expect(productRow.locator(".row-price .cell-label")).toBeHidden();
      const productHeaderAlignment = await tableHeader
        .locator("span")
        .nth(1)
        .evaluate((element) => {
          const range = document.createRange();
          const textNode = element.firstChild;
          if (!textNode) return null;
          range.selectNodeContents(textNode);
          const cellRect = element.getBoundingClientRect();
          const textRect = range.getBoundingClientRect();
          return {
            cellCenter: cellRect.left + cellRect.width / 2,
            textAlign: getComputedStyle(element).textAlign,
            textCenter: textRect.left + textRect.width / 2,
          };
        });
      expect(productHeaderAlignment?.textAlign).toBe("center");
      expect(
        Math.abs(
          (productHeaderAlignment?.cellCenter ?? 0) -
            (productHeaderAlignment?.textCenter ?? Number.POSITIVE_INFINITY),
        ),
      ).toBeLessThanOrEqual(2);
    }

    const paginationDisplay = await page
      .locator(".pagination-bar")
      .evaluate((element) => window.getComputedStyle(element).display);
    expect(paginationDisplay).toBe(viewport.width <= 760 ? "grid" : "flex");

    const productLink = productRow.getByRole("link", { name: product.name });
    const productNameLayout = await productLink.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        lineClamp: styles.webkitLineClamp,
        scrollWidth: element.scrollWidth,
        whiteSpace: styles.whiteSpace,
      };
    });
    expect(productNameLayout.whiteSpace).toBe("normal");
    expect(productNameLayout.lineClamp).toBe("2");
    expect(productNameLayout.scrollWidth).toBeLessThanOrEqual(productNameLayout.clientWidth);
    if (!usesCompactTable) {
      await expect(productRow.locator(".product-main")).toHaveCSS("text-align", "left");
    }
    await expect(productRow.locator(".row-price strong")).toContainText("NT$ 18,990");
    const movementText = await productRow.locator(".price-movement").innerText();
    expect(movementText).toBe("−NT$ 300 / −4.8%");
    const [amountText, percentText] = movementText.split(" / ");
    expect(amountText.charCodeAt(0)).toBe(0x2212);
    expect(percentText.charCodeAt(0)).toBe(0x2212);
    expect(amountText.startsWith("-")).toBe(false);
    expect(percentText.startsWith("-")).toBe(false);
    await expect(productRow.locator(".row-status .row-state")).toHaveText("目前上架");

    const rowContentLayout = await productRow.evaluate((element) => {
      const rowRect = element.getBoundingClientRect();
      const content = [
        ".product-image",
        ".product-main",
        ".row-price",
        ".row-movement",
        ".row-status",
        ".row-build-list",
      ];
      return content.map((selector) => {
        const child = element.querySelector(selector);
        if (!(child instanceof HTMLElement)) return { fits: false, selector };
        const rect = child.getBoundingClientRect();
        return {
          fits:
            rect.left >= rowRect.left - 0.5 &&
            rect.right <= rowRect.right + 0.5 &&
            rect.top >= rowRect.top - 0.5 &&
            rect.bottom <= rowRect.bottom + 0.5,
          rect: { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top },
          row: {
            bottom: rowRect.bottom,
            left: rowRect.left,
            right: rowRect.right,
            top: rowRect.top,
          },
          selector,
        };
      });
    });
    expect(rowContentLayout.filter(({ fits }) => !fits)).toEqual([]);

    await productRow.getByRole("button", { name: "加入", exact: true }).click();
    await expect(
      productRow.getByRole("button", { name: `從配單移除 ${product.name}` }),
    ).toBeVisible();
    await expect(productRow.locator(".row-price strong")).toBeVisible();
    await expect(productRow.locator(".row-status .row-state")).toBeVisible();

    const dimensions = await expectNoHorizontalOverflow(page);
    viewportDimensions.push({ ...dimensions, width: viewport.width });
  }

  console.log("toolbar/table viewport dimensions", viewportDimensions);

  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");
  await page.getByRole("button", { name: "全部商品" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBe("all");
  await page.getByRole("textbox", { name: "最低價格" }).fill("1000");
  await page.getByRole("textbox", { name: "最高價格" }).fill("2000");
  await expect(page.getByRole("textbox", { name: "最低價格" })).toHaveValue("1000");
  await expect(page.getByRole("textbox", { name: "最高價格" })).toHaveValue("2000");
  await page.getByRole("button", { name: "全部廠商" }).click();
  const vendorCheckbox = page.getByRole("checkbox", { name: "Intel" });
  await expect(vendorCheckbox).not.toBeChecked();
  await page.locator(".vendor-option").filter({ hasText: "Intel" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel");
  const socketFilter = page.locator(".facet-filter").filter({ hasText: "腳位" });
  await socketFilter.getByRole("button", { name: "全部" }).click();
  await page.getByRole("checkbox", { name: "LGA 1851" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["socket:lga1851"]);
});

test("keeps positive price movement signs consistent across desktop and mobile @desktop-only", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?category=gpu&q=rise");
    await expect(page.locator(".price-movement").first()).toHaveText("+NT$ 300 / +4.8%");
    await expectNoHorizontalOverflow(page);
  }
});

test("groups selected CPU facets and keeps the vendor chip first @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "腳位", ["LGA 1851", "LGA 1700"]);
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel");
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["socket:lga1851", "socket:lga1700"]);

  const summaryRow = page.locator(".active-filter-summary-row");
  const chips = summaryRow.locator(".active-filter-chip");
  await expect(chips).toHaveCount(2);
  await expect(chips).toHaveText(["廠商：Intel×", "腳位：LGA 1851、LGA 1700×"]);
  await expect(
    page.getByRole("button", { exact: true, name: "移除篩選：腳位：LGA 1851" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { exact: true, name: "移除篩選：腳位：LGA 1700" }),
  ).toHaveCount(0);
  await expect(summaryRow.getByRole("group", { name: "已選篩選條件" })).toBeVisible();
  const resetButton = summaryRow.getByRole("button", { name: "重設", exact: true });
  await expect(resetButton).toBeVisible();

  const [firstChipBox, resetBox] = await Promise.all([
    chips.first().boundingBox(),
    resetButton.boundingBox(),
  ]);
  expect(Math.abs((firstChipBox?.y ?? 0) - (resetBox?.y ?? 0))).toBeLessThanOrEqual(1);

  const pageTenUrl = new URL(page.url());
  pageTenUrl.searchParams.set("page", "10");
  await page.goto(`${pageTenUrl.pathname}${pageTenUrl.search}`);
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("10");

  await page.getByRole("button", { name: "移除篩選：腳位：LGA 1851、LGA 1700" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel");
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();

  await selectFacetOptions(page, "產品系列", ["Intel Core i3"]);
  await page.getByRole("button", { name: "移除篩選：廠商：Intel" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["cpu_family:core-i3"]);
});

test("orders and clears multiple vendors without changing other filters @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "AMD");
  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "內建顯示", ["有內顯"]);
  await page.getByRole("button", { name: "全部商品" }).click();

  const pageTenUrl = new URL(page.url());
  pageTenUrl.searchParams.set("page", "10");
  await page.goto(`${pageTenUrl.pathname}${pageTenUrl.search}`);

  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel,amd");
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel、AMD" })).toBeVisible();
  await page.getByRole("button", { name: "移除篩選：廠商：Intel、AMD" }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["integrated_graphics:yes"]);
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBe("all");
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect(page.getByRole("button", { name: "移除篩選：內建顯示：有內顯" })).toBeVisible();

  await page.getByRole("button", { name: "全部廠商" }).click();
  await expect(page.getByRole("checkbox", { name: "Intel" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "AMD" })).not.toBeChecked();
});

test("keeps the vendor menu open while multi-select requests reload @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  const vendorFilter = page.locator(".vendor-filter");
  await vendorFilter.locator(".vendor-menu-trigger").click();
  const popover = vendorFilter.getByRole("group", { name: "廠商篩選選單" });
  await expect(popover).toBeVisible();
  await expect(vendorFilter.locator(".vendor-menu-header")).toHaveCount(0);
  await expect(popover).not.toContainText("CPU");

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "Intel" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  await expect(page.locator(".skeleton-row").first()).toBeVisible();
  await expect(vendorFilter.getByRole("checkbox", { exact: true, name: "Intel" })).toBeChecked();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel");
  await expect(page.locator(".skeleton-row")).toHaveCount(0);

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "AMD" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  await expect(vendorFilter.getByRole("checkbox", { exact: true, name: "AMD" })).toBeChecked();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel,amd");
  await expect(page.locator(".skeleton-row")).toHaveCount(0);
  await expect(vendorFilter.locator(".vendor-menu-header")).toHaveCount(0);
  await expect(vendorFilter.getByRole("button", { name: "清除" })).toHaveCount(0);

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "Intel" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  await expect(
    vendorFilter.getByRole("checkbox", { exact: true, name: "Intel" }),
  ).not.toBeChecked();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("amd");
  await expect(page.locator(".skeleton-row")).toHaveCount(0);

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "AMD" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBeNull();
  await expect(page.locator(".skeleton-row")).toHaveCount(0);
  await expect(vendorFilter.locator(".vendor-menu-header")).toHaveCount(0);
  await expect(vendorFilter.locator('input[type="checkbox"]:checked')).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await vendorFilter.locator(".vendor-menu-trigger").click();
  await expect(popover).toBeVisible();
  await page.locator(".results-title").click();
  await expect(popover).toHaveCount(0);

  await selectVendor(page, "Intel");
  await switchCategory(page, "主機板", "motherboard");
  await expect(page.getByRole("checkbox", { exact: true, name: "Intel" })).toHaveCount(0);
  await expect(page.locator(".vendor-menu-trigger")).toHaveText(/全部廠商/);
  await switchCategory(page, "機殼", "case");
  await expect(page.locator(".vendor-filter-disabled")).toHaveText("無廠商資料");

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("motherboard");
  await expect(page.locator(".vendor-menu-trigger")).toBeEnabled();
  await page.goBack();
  await expectQueryFilters(page, { category: "cpu", facets: [], vendors: "intel" });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
});

test("groups non-CPU facets without clearing other definitions @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=gpu");

  await selectFacetOptions(page, "GPU 晶片", ["NVIDIA", "AMD"]);
  await selectFacetOptions(page, "顯示記憶體", ["16 GB"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["gpu_chip:nvidia", "gpu_chip:amd", "vram_gb:16"]);
  await expect(page.locator(".active-filter-chip")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "移除篩選：GPU 晶片：NVIDIA、AMD" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：顯示記憶體：16 GB" })).toBeVisible();

  await page.getByRole("button", { name: "移除篩選：GPU 晶片：NVIDIA、AMD" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual(["vram_gb:16"]);
  await expect(page.getByRole("button", { name: "移除篩選：顯示記憶體：16 GB" })).toBeVisible();
});

test("uses the active category definitions for memory chips @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=memory");

  await selectFacetOptions(page, "使用類型", ["桌上型", "筆記型"]);
  await selectFacetOptions(page, "記憶體規格", ["DDR5"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["module_type:desktop", "module_type:laptop", "memory_type:ddr5"]);
  await expect(
    page.getByRole("button", { name: "移除篩選：使用類型：桌上型、筆記型" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：記憶體規格：DDR5" })).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText("腳位");
});

test("keeps shared trigger widths and chevrons usable across categories @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });

  for (const category of ["cpu", "gpu", "memory", "external-storage"]) {
    await page.goto(`/?category=${category}`);
    const triggers = page.locator(".vendor-menu-trigger, .facet-menu-trigger");
    for (const trigger of await triggers.all()) {
      const layout = await trigger.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const textRect = element.querySelector("span")?.getBoundingClientRect();
        const chevronRect = element.querySelector(".filter-chevron")?.getBoundingClientRect();
        return { chevronRect, rect, textRect };
      });
      expect(layout.rect.width).toBeCloseTo(112, 0);
      expect(layout.textRect?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        layout.chevronRect?.left ?? 0,
      );
      expect(layout.chevronRect?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        layout.rect.right,
      );
    }
    await expectNoHorizontalOverflow(page);
  }

  await page.goto("/?category=cpu");
  await selectFacetOptions(page, "腳位", ["sTR5 / Threadripper"]);
  const longSummaryTrigger = page
    .locator(".facet-filter")
    .filter({ hasText: "腳位" })
    .getByRole("button", { name: "sTR5 / Threadripper" });
  const longSummaryLayout = await longSummaryTrigger.evaluate((element) => {
    const text = element.querySelector("span");
    const chevron = element.querySelector(".filter-chevron");
    if (!(text instanceof HTMLElement) || !(chevron instanceof SVGElement)) return null;
    const textStyles = window.getComputedStyle(text);
    return {
      accessibleText: element.textContent?.trim(),
      chevronLeft: chevron.getBoundingClientRect().left,
      scrollWidth: text.scrollWidth,
      textOverflow: textStyles.textOverflow,
      textRight: text.getBoundingClientRect().right,
      textWidth: text.clientWidth,
    };
  });
  expect(longSummaryLayout).not.toBeNull();
  expect(longSummaryLayout?.accessibleText).toContain("sTR5 / Threadripper");
  expect(longSummaryLayout?.textOverflow).toBe("ellipsis");
  expect(longSummaryLayout?.scrollWidth ?? 0).toBeGreaterThan(longSummaryLayout?.textWidth ?? 0);
  expect(longSummaryLayout?.textRight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    longSummaryLayout?.chevronLeft ?? 0,
  );
  await expectNoHorizontalOverflow(page);
});

test("sizes short facet popovers and separates semantic option groups @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  const socketFilter = page.locator(".facet-filter").filter({ hasText: "腳位" });
  await socketFilter.locator(".facet-menu-trigger").click();
  const socketPopover = socketFilter.locator(".facet-menu-popover");
  const socketLayout = await socketPopover.evaluate((popover) => {
    const option = [...popover.querySelectorAll(".facet-option")].find((candidate) =>
      candidate.textContent?.includes("sTR5 / Threadripper"),
    );
    const optionRect = option?.getBoundingClientRect();
    const textRect = option?.querySelector("span")?.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    return {
      clientWidth: popover.clientWidth,
      optionLeft: optionRect?.left,
      popoverRight: popoverRect.right,
      scrollWidth: popover.scrollWidth,
      textLeft: textRect?.left,
      textRight: textRect?.right,
      width: popoverRect.width,
    };
  });
  console.log("facet popover desktop layout", socketLayout);
  expect(socketLayout.width).toBeLessThanOrEqual(260);
  expect(socketLayout.width).toBeLessThan(300);
  expect(socketLayout.width).toBeGreaterThanOrEqual(200);
  expect(socketLayout.scrollWidth).toBeLessThanOrEqual(socketLayout.clientWidth);
  expect((socketLayout.textLeft ?? 0) - (socketLayout.optionLeft ?? 0)).toBeGreaterThanOrEqual(30);
  expect(socketLayout.textRight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    socketLayout.popoverRight - 10,
  );
  await expectNoHorizontalOverflow(page);
  await socketFilter.locator(".facet-menu-trigger").click();

  await switchCategory(page, "主機板", "motherboard");
  const chipsetFilter = page.locator(".facet-filter").filter({ hasText: "晶片組" });
  await chipsetFilter.locator(".facet-menu-trigger").click();
  const groups = chipsetFilter.locator(".facet-option-group");
  const headers = chipsetFilter.locator(".facet-option-group-header");
  await expect(groups).toHaveCount(6);
  await expect(chipsetFilter.getByRole("group")).toHaveCount(6);
  await expect(headers).toHaveText([
    "Intel·LGA 1700",
    "Intel·LGA 1851",
    "Intel·舊平台／工作站",
    "AMD·AM4",
    "AMD·AM5",
    "AMD·Threadripper",
  ]);
  await expect(chipsetFilter.locator(".facet-vendor-badge")).toHaveText([
    "Intel",
    "Intel",
    "Intel",
    "AMD",
    "AMD",
    "AMD",
  ]);
  await expect(headers.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(chipsetFilter.getByRole("checkbox")).toHaveCount(27);
  await expect(chipsetFilter.locator(".facet-option span")).toHaveText([
    "H610",
    "B760",
    "Z790",
    "H810",
    "B860",
    "Z890",
    "H81",
    "H110",
    "H310",
    "H510",
    "W680",
    "W790",
    "W880",
    "W890",
    "A520",
    "B550",
    "A620",
    "B650",
    "B650E",
    "B840",
    "B850",
    "X670",
    "X670E",
    "X870",
    "X870E",
    "TRX50",
    "WRX90",
  ]);
  const groupBorders = await groups.evaluateAll((elements) =>
    elements.map((element) => window.getComputedStyle(element).borderTopWidth),
  );
  expect(groupBorders).toEqual(["0px", "1px", "1px", "1px", "1px", "1px"]);
  const optionListScroll = await chipsetFilter
    .locator(".facet-option-list")
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
  expect(optionListScroll.scrollHeight).toBeGreaterThan(optionListScroll.clientHeight);

  for (const viewport of [
    { width: 1760, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await chipsetFilter.locator(".facet-menu-popover").evaluate((popover) => {
      const optionRects = [...popover.querySelectorAll<HTMLElement>(".facet-option")].map(
        (option) => ({
          label: option.textContent?.trim(),
          rect: option.getBoundingClientRect(),
        }),
      );
      const readRect = (label: string) =>
        optionRects.find((option) => option.label === label)?.rect;
      const groups = [...popover.querySelectorAll<HTMLElement>(".facet-option-group")];
      const firstGroupStyle = window.getComputedStyle(groups[0]);
      const popoverRect = popover.getBoundingClientRect();

      return {
        columns: firstGroupStyle.gridTemplateColumns.split(" ").length,
        dividerWidths: groups.slice(1).map((group) => group.getBoundingClientRect().width),
        firstGroupWidth: groups[0]?.getBoundingClientRect().width,
        headerLayouts: groups.map((group) => {
          const header = group.querySelector<HTMLElement>(".facet-option-group-header");
          const firstOption = group.querySelector<HTMLElement>(".facet-option");
          const headerRect = header?.getBoundingClientRect();
          return {
            bottom: headerRect?.bottom,
            firstOptionTop: firstOption?.getBoundingClientRect().top,
            position: header ? window.getComputedStyle(header).position : null,
            width: headerRect?.width,
          };
        }),
        h610: readRect("H610"),
        b760: readRect("B760"),
        z790: readRect("Z790"),
        h810: readRect("H810"),
        popoverClientWidth: popover.clientWidth,
        popoverScrollWidth: popover.scrollWidth,
        popoverWidth: popoverRect.width,
      };
    });
    expect(layout.columns).toBe(3);
    expect(layout.popoverWidth).toBeGreaterThanOrEqual(300);
    expect(layout.popoverWidth).toBeLessThanOrEqual(360);
    expect(layout.popoverScrollWidth).toBeLessThanOrEqual(layout.popoverClientWidth);
    expect(
      Math.max(layout.h610?.top ?? 0, layout.b760?.top ?? 0, layout.z790?.top ?? 0) -
        Math.min(layout.h610?.top ?? 0, layout.b760?.top ?? 0, layout.z790?.top ?? 0),
    ).toBeLessThanOrEqual(1);
    expect(layout.h610?.left ?? Number.POSITIVE_INFINITY).toBeLessThan(layout.b760?.left ?? 0);
    expect(layout.b760?.left ?? Number.POSITIVE_INFINITY).toBeLessThan(layout.z790?.left ?? 0);
    expect(layout.h810?.top ?? 0).toBeGreaterThan(layout.h610?.top ?? Number.POSITIVE_INFINITY);
    for (const dividerWidth of layout.dividerWidths) {
      expect(dividerWidth).toBeCloseTo(layout.firstGroupWidth ?? 0, 0);
    }
    for (const header of layout.headerLayouts) {
      expect(header.position).toBe("static");
      expect(header.width).toBeCloseTo(layout.firstGroupWidth ?? 0, 0);
      expect(header.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        header.firstOptionTop ?? 0,
      );
    }
    await expectNoHorizontalOverflow(page);
  }

  await chipsetFilter.getByRole("checkbox", { name: "H610" }).check();
  await chipsetFilter.getByRole("checkbox", { name: "W680" }).check();
  await chipsetFilter.getByRole("checkbox", { name: "WRX90" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:h610", "chipset:w680", "chipset:wrx90"]);
  await chipsetFilter.getByRole("checkbox", { name: "W680" }).uncheck();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:h610", "chipset:wrx90"]);
  await expect(chipsetFilter.locator(".facet-menu-popover")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("normalizes the removed motherboard socket catch-all and keeps chipset products reachable @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=motherboard&facet=socket%3Aother");

  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
  await expect(page.locator(".active-filter-chip")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /測試 H81 舊平台主機板/ })).toBeVisible();
  const socketFilter = page.locator(".facet-filter").filter({ hasText: "腳位" });
  await socketFilter.locator(".facet-menu-trigger").click();
  await expect(socketFilter.getByRole("checkbox")).toHaveCount(5);
  await expect(socketFilter.getByText("其他腳位", { exact: true })).toHaveCount(0);
  await expect(socketFilter.locator('input[value="other"]')).toHaveCount(0);
  await socketFilter.locator(".facet-menu-trigger").click();

  await selectFacetOptions(page, "晶片組", ["H81"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:h81"]);
  await expect(page.getByRole("link", { name: /測試 H81 舊平台主機板/ })).toBeVisible();
  await page.getByRole("button", { name: "移除篩選：晶片組：H81" }).click();
  await selectFacetOptions(page, "晶片組", ["W680"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:w680"]);
  await expect(page.getByRole("link", { name: /測試 W680 工作站主機板/ })).toBeVisible();
});

test("renders single-option facets as direct keyboard-operable controls @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=motherboard&page=10");

  const wifiControl = page.locator(".single-option-facet").filter({ hasText: "含 Wi-Fi" });
  const wifiCheckbox = wifiControl.getByRole("checkbox", { name: "含 Wi-Fi" });
  await expect(wifiControl).toBeVisible();
  await expect(page.locator(".facet-filter").filter({ hasText: "無線網路" })).toHaveCount(0);
  await expect(page.locator(".facet-menu-trigger").filter({ hasText: "無線網路" })).toHaveCount(0);
  await expect(wifiCheckbox).toHaveCSS("opacity", "0");
  await expect(wifiControl).toHaveCSS("min-height", "38px");
  await wifiCheckbox.focus();
  await expect(wifiCheckbox).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual(["wifi:yes"]);
  await expect(wifiControl).toHaveClass(/is-active/);
  const wifiActiveStyle = await wifiControl.evaluate((element) => {
    const styles = getComputedStyle(element);
    const indicator = getComputedStyle(element, "::before");
    return {
      background: styles.backgroundColor,
      border: styles.borderColor,
      indicatorBackground: indicator.backgroundColor,
      expectedBackground: getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-surface")
        .trim(),
      expectedIndicator: getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-strong")
        .trim(),
    };
  });
  expect(wifiActiveStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(wifiActiveStyle.border).not.toBe("");
  expect(wifiActiveStyle.indicatorBackground).not.toBe("rgba(0, 0, 0, 0)");
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect(page.getByRole("button", { name: "移除篩選：無線網路：含 Wi-Fi" })).toBeVisible();

  await switchCategory(page, "CPU", "cpu");
  await expect(page.locator(".single-option-facet")).toHaveCount(0);
  await expect(page.locator(".facet-filter").filter({ hasText: "內建顯示" })).toBeVisible();
  await switchCategory(page, "主機板", "motherboard");
  await expect(wifiCheckbox).toBeChecked();
  await wifiCheckbox.click();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);

  await wifiCheckbox.click();
  await page.getByRole("button", { name: "重設", exact: true }).click();
  await expect(wifiCheckbox).not.toBeChecked();
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);

  await switchCategory(page, "機殼", "case");
  await expect(page.locator(".single-option-facet").filter({ hasText: "支援背插" })).toBeVisible();
  await expect(page.locator(".single-option-facet").filter({ hasText: "含電源" })).toBeVisible();
  await expect(page.locator(".facet-filter").filter({ hasText: "支援主機板" })).toBeVisible();
});

test("preserves the two semantic memory-speed groups and their boundary @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=memory");

  const speedFilter = page.locator(".facet-filter").filter({ hasText: "頻率" });
  await speedFilter.locator(".facet-menu-trigger").click();
  const groups = speedFilter.locator(".facet-option-group");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0).locator(".facet-option span")).toHaveText([
    "1600 MHz",
    "2400 MHz",
    "2666 MHz",
    "3200 MHz",
    "3600 MHz",
    "4000 MHz",
  ]);
  await expect(groups.nth(1).locator(".facet-option span")).toHaveText([
    "4800 MHz",
    "5200 MHz",
    "5600 MHz",
    "6000 MHz",
    "6200 MHz",
    "6400 MHz",
    "6800 MHz",
    "7200 MHz",
    "8000 MHz",
    "8400 MHz",
  ]);
  await expect(groups.nth(1)).toHaveCSS("border-top-width", "1px");
  await speedFilter.getByRole("checkbox", { exact: true, name: "4800 MHz" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["speed_mhz:4800"]);
});

test("keeps capacity options category-specific and memory-safe @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=storage");

  await assertFacetOptionAvailability(page, "容量", {
    absent: ["32 GB", "64 GB", "3 TB", "10 TB", "30 TB"],
    present: ["128 GB", "1 TB", "2 TB", "4 TB", "8 TB"],
  });
  await selectFacetOptions(page, "容量", ["128 GB"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["capacity_gb:128"]);

  await switchCategory(page, "HDD", "hard-drive");
  await assertFacetOptionAvailability(page, "容量", {
    absent: ["32 GB", "64 GB", "128 GB", "256 GB", "480 GB", "512 GB"],
    present: ["500 GB", "1 TB", "5 TB", "30 TB"],
  });
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);

  await switchCategory(page, "外接儲存", "external-storage");
  await assertFacetOptionAvailability(page, "容量", {
    present: ["480 GB", "3 TB", "10 TB", "26 TB", "28 TB", "30 TB"],
  });
  await selectFacetOptions(page, "容量", ["3 TB"]);
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["capacity_gb:3000"]);

  await switchCategory(page, "SSD", "storage");
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["capacity_gb:128"]);
  await expect(page.getByRole("button", { name: "移除篩選：容量：128 GB" })).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText("3 TB");

  await switchCategory(page, "外接儲存", "external-storage");
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["capacity_gb:3000"]);
  await expect(page.getByRole("button", { name: "移除篩選：容量：3 TB" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("keeps grouped facet popovers full-width and category memory usable on mobile @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?category=motherboard");

  await selectVendor(page, "ASUS");
  const chipsetFilter = page.locator(".facet-filter").filter({ hasText: "晶片組" });
  await chipsetFilter.locator(".facet-menu-trigger").click();
  const [popoverBox, menuBox] = await Promise.all([
    chipsetFilter.locator(".facet-menu-popover").boundingBox(),
    chipsetFilter.locator(".facet-menu").boundingBox(),
  ]);
  expect(popoverBox?.width).toBeCloseTo(menuBox?.width ?? 0, 0);
  await expect(chipsetFilter.locator(".facet-option-group")).toHaveCount(6);
  const groupBorders = await chipsetFilter
    .locator(".facet-option-group")
    .evaluateAll((elements) =>
      elements.map((element) => window.getComputedStyle(element).borderTopWidth),
    );
  expect(groupBorders).toEqual(["0px", "1px", "1px", "1px", "1px", "1px"]);
  await chipsetFilter.getByRole("checkbox", { name: "B760" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:b760"]);
  await expectNoHorizontalOverflow(page);

  await chipsetFilter.locator(".facet-menu-trigger").click();
  const categoryPanel = page.locator(".filter-panel details");
  await categoryPanel.locator("summary").click();
  await switchCategory(page, "CPU", "cpu");
  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, {
    category: "motherboard",
    facets: ["chipset:b760"],
    vendors: "asus",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：ASUS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：晶片組：B760" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("keeps chipset and direct facet controls usable across responsive boundaries @desktop-only", async ({
  page,
}) => {
  const viewports = [
    { width: 1024, height: 800 },
    { width: 761, height: 844 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/?category=motherboard");
    const wifiControl = page.locator(".single-option-facet").filter({ hasText: "含 Wi-Fi" });
    const wifiBox = await wifiControl.boundingBox();
    expect(wifiBox?.height ?? 0).toBeGreaterThanOrEqual(viewport.width <= 760 ? 44 : 38);

    const chipsetFilter = page.locator(".facet-filter").filter({ hasText: "晶片組" });
    await chipsetFilter.locator(".facet-menu-trigger").click();
    const popover = chipsetFilter.locator(".facet-menu-popover");
    const responsiveLayout = await popover.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const firstGroup = element.querySelector<HTMLElement>(".facet-option-group");
      return {
        columns: firstGroup
          ? window.getComputedStyle(firstGroup).gridTemplateColumns.split(" ").length
          : 0,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
        width: element.clientWidth,
      };
    });
    expect(responsiveLayout.columns).toBe(viewport.width <= 760 ? 1 : 3);
    expect(responsiveLayout.left).toBeGreaterThanOrEqual(0);
    expect(responsiveLayout.right).toBeLessThanOrEqual(viewport.width);
    expect(responsiveLayout.scrollWidth).toBeLessThanOrEqual(responsiveLayout.width);
    const lastOption = chipsetFilter.getByRole("checkbox", { exact: true, name: "WRX90" });
    await lastOption.scrollIntoViewIfNeeded();
    await lastOption.check();
    await expect
      .poll(() => new URL(page.url()).searchParams.getAll("facet"))
      .toEqual(["chipset:wrx90"]);
    await expectNoHorizontalOverflow(page);
  }
});

test("wraps a complete grouped CPU socket chip on mobile @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?category=cpu");

  await selectFacetOptions(page, "腳位", [
    "LGA 1851",
    "LGA 1700",
    "AM5",
    "AM4",
    "sTR5 / Threadripper",
  ]);
  const expectedTags = [
    "socket:lga1851",
    "socket:lga1700",
    "socket:am5",
    "socket:am4",
    "socket:str5",
  ];
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual(expectedTags);
  const socketFilter = page.locator(".facet-filter").filter({ hasText: "腳位" });
  await expect(socketFilter.locator(".facet-menu")).toHaveClass(/is-open/);
  await socketFilter.locator(".facet-menu-trigger").click();
  await expect(socketFilter.locator(".facet-menu")).not.toHaveClass(/is-open/);

  const chip = page.getByRole("button", {
    name: "移除篩選：腳位：LGA 1851、LGA 1700、AM5、AM4、sTR5 / Threadripper",
  });
  await expect(page.locator(".active-filter-chip")).toHaveCount(1);
  await expect(chip).toBeVisible();
  await expect(chip.getByText("×")).toBeVisible();
  await expect(page.getByRole("button", { name: "重設", exact: true })).toBeVisible();
  const chipTextLayout = await chip
    .locator("span")
    .first()
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        lineCount: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
        scrollHeight: element.scrollHeight,
      };
    });
  expect(chipTextLayout.lineCount).toBeGreaterThan(1);
  expect(chipTextLayout.scrollHeight).toBeGreaterThan(16);
  await expectNoHorizontalOverflow(page);

  await chip.getByText("×").click();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
});

test("resets vendor, grouped facets, status, and page together @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "AMD");
  await selectFacetOptions(page, "腳位", ["LGA 1851", "LGA 1700"]);
  await selectFacetOptions(page, "產品系列", ["Intel Core i5"]);
  await page.getByRole("button", { name: "可能已下架" }).click();
  const selectedUrl = new URL(page.url());
  selectedUrl.searchParams.set("page", "10");
  await page.goto(`${selectedUrl.pathname}${selectedUrl.search}`);

  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("10");
  await expect(page.locator(".active-filter-chip")).toHaveCount(3);
  await page.getByRole("button", { name: "重設", exact: true }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "目前上架" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "可能已下架" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "全部廠商" }).click();
  await expect(page.getByRole("checkbox", { name: "Intel" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "AMD" })).not.toBeChecked();
  await page.getByRole("button", { name: "全部廠商" }).click();
  await assertFacetOptionsUnchecked(page, "腳位", ["LGA 1851", "LGA 1700"]);
  await assertFacetOptionsUnchecked(page, "產品系列", ["Intel Core i5"]);

  await page.getByRole("button", { name: "全部商品" }).click();
  const summaryRow = page.locator(".active-filter-summary-row");
  await expect(summaryRow).toBeVisible();
  await expect(summaryRow.getByRole("group", { name: "已選篩選條件" })).toHaveCount(0);
  await expect(summaryRow.getByRole("button", { name: "重設", exact: true })).toBeVisible();
});

test("keeps the header search independent from list filter reset @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  const searchInput = page.getByRole("searchbox", { name: "搜尋商品名稱" });
  await expect(searchInput).toHaveAttribute("autocomplete", "off");
  await expect(searchInput).not.toHaveAttribute("list", /.+/);
  await expect(page.locator(".topbar-search datalist, .topbar-search [role='listbox']")).toHaveCount(
    0,
  );

  await searchInput.fill("intel");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("intel");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "全部商品" }).click();
  const resetButton = page.getByRole("button", { name: "重設", exact: true });
  await expect(resetButton).toBeVisible();
  await searchInput.fill("intel core");
  await resetButton.click();

  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("intel");
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBeNull();
  await expect(searchInput).toHaveValue("intel core");
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);

  await page.getByRole("button", { name: "清除搜尋字詞" }).click();
  await expect(searchInput).toHaveValue("");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
});

test("remembers vendor and facet filters independently per category @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await page.getByRole("searchbox", { name: "搜尋商品名稱" }).fill("遊戲主機");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await page.getByRole("textbox", { name: "最低價格" }).fill("1000");
  await page.getByRole("textbox", { name: "最高價格" }).fill("20000");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        maxPrice: url.searchParams.get("maxPrice"),
        minPrice: url.searchParams.get("minPrice"),
      };
    })
    .toEqual({ maxPrice: "20000", minPrice: "1000" });
  await page.getByRole("button", { name: "全部商品" }).click();
  await page.getByRole("combobox", { name: "排序" }).selectOption("price_desc");
  await page.getByRole("combobox", { name: "每頁顯示" }).selectOption("50");
  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "腳位", ["LGA 1700"]);
  await selectFacetOptions(page, "產品系列", ["Intel Core i5"]);

  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700", "cpu_family:core-i5"],
    vendors: "intel",
  });
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        maxPrice: url.searchParams.get("maxPrice"),
        minPrice: url.searchParams.get("minPrice"),
        pageSize: url.searchParams.get("pageSize"),
        q: url.searchParams.get("q"),
        sort: url.searchParams.get("sort"),
        status: url.searchParams.get("status"),
      };
    })
    .toEqual({
      maxPrice: "20000",
      minPrice: "1000",
      pageSize: "50",
      q: "遊戲主機",
      sort: "price_desc",
      status: "all",
    });

  await page.getByRole("textbox", { name: "跳至" }).fill("10");
  await page.getByRole("button", { name: "前往" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("10");

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        maxPrice: url.searchParams.get("maxPrice"),
        minPrice: url.searchParams.get("minPrice"),
        pageSize: url.searchParams.get("pageSize"),
        q: url.searchParams.get("q"),
        sort: url.searchParams.get("sort"),
        status: url.searchParams.get("status"),
      };
    })
    .toEqual({
      maxPrice: "20000",
      minPrice: "1000",
      pageSize: "50",
      q: "遊戲主機",
      sort: "price_desc",
      status: "all",
    });

  await selectVendor(page, "ASUS");
  await selectFacetOptions(page, "腳位", ["AM5"]);
  await selectFacetOptions(page, "晶片組", ["B650"]);
  await expectQueryFilters(page, {
    category: "motherboard",
    facets: ["socket:am5", "chipset:b650"],
    vendors: "asus",
  });

  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700", "cpu_family:core-i5"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "移除篩選：產品系列：Intel Core i5" }),
  ).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText(/ASUS|AM5|B650/);
  await assertVendorCheckboxStates(page, { checked: ["Intel"], absent: ["ASUS"] });
  await assertFacetCheckboxStates(page, "腳位", { checked: ["LGA 1700"], unchecked: ["AM5"] });
  await assertFacetCheckboxStates(page, "產品系列", { checked: ["Intel Core i5"] });

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, {
    category: "motherboard",
    facets: ["socket:am5", "chipset:b650"],
    vendors: "asus",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：ASUS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：AM5" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：晶片組：B650" })).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText(/Intel|LGA 1700|Core i5/);
  await assertVendorCheckboxStates(page, { checked: ["ASUS"], absent: ["Intel"] });
  await assertFacetCheckboxStates(page, "腳位", { checked: ["AM5"], unchecked: ["LGA 1700"] });
  await assertFacetCheckboxStates(page, "晶片組", { checked: ["B650"] });
});

test("reset clears only the current category memory @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "腳位", ["LGA 1700"]);
  await switchCategory(page, "主機板", "motherboard");
  await selectVendor(page, "ASUS");
  await selectFacetOptions(page, "晶片組", ["B650"]);
  await page.getByRole("button", { name: "可能已下架" }).click();

  await page.getByRole("button", { name: "重設", exact: true }).click();
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBeNull();
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await assertVendorCheckboxStates(page, { unchecked: ["ASUS", "MSI"] });
  await assertFacetCheckboxStates(page, "晶片組", { unchecked: ["B650"] });

  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await assertVendorCheckboxStates(page, { unchecked: ["ASUS", "MSI"] });
  await assertFacetCheckboxStates(page, "晶片組", { unchecked: ["B650"] });
});

test("keeps URL and popstate filters ahead of category memory @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "腳位", ["LGA 1700"]);
  await switchCategory(page, "主機板", "motherboard");

  await page.evaluate(() => {
    window.history.pushState(null, "", "/?category=cpu&facet=socket%3Aam5&vendors=amd");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:am5"],
    vendors: "amd",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：AMD" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：AM5" })).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText(/Intel|LGA 1700/);
  await assertVendorCheckboxStates(page, { checked: ["AMD"], unchecked: ["Intel"] });
  await assertFacetCheckboxStates(page, "腳位", { checked: ["AM5"], unchecked: ["LGA 1700"] });

  await switchCategory(page, "主機板", "motherboard");
  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:am5"],
    vendors: "amd",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：AMD" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：AM5" })).toBeVisible();
});

test("uses the initial URL and drops other category memory after reload @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu&facet=socket%3Alga1700&vendors=intel");

  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();

  await switchCategory(page, "主機板", "motherboard");
  await selectVendor(page, "ASUS");
  await selectFacetOptions(page, "晶片組", ["B650"]);
  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });

  await page.reload();
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await assertVendorCheckboxStates(page, { unchecked: ["ASUS", "MSI"] });
  await assertFacetCheckboxStates(page, "晶片組", { unchecked: ["B650"] });
});

test("uses the shared topbar button for the price-report entry @desktop-only", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/build-list"]) {
      await page.goto(path);
      const topbar = page.locator(".topbar");
      const priceReportLink = topbar.getByRole("link", { name: "價格變動總覽", exact: true });
      const announcementLink = topbar.getByRole("link", { name: "公告", exact: true });
      await expect(priceReportLink).toHaveClass(/topbar-nav-link/);
      await expect(priceReportLink.locator(".price-report-topbar-icon")).toHaveCount(0);
      const [priceStyles, announcementStyles] = await Promise.all(
        [priceReportLink, announcementLink].map((link) =>
          link.evaluate((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
              background: style.backgroundColor,
              borderRadius: style.borderRadius,
              fontSize: style.fontSize,
              height: rect.height,
              paddingInline: style.paddingInline,
              whiteSpace: style.whiteSpace,
            };
          }),
        ),
      );
      expect(priceStyles).toEqual(announcementStyles);
      expect(priceStyles.whiteSpace).toBe("nowrap");
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("organizes Discord guidance by audience with progressive disclosure @desktop-only", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const viewports = [
    { width: 1760, height: 900 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1121, height: 800 },
    { width: 1120, height: 800 },
    { width: 1024, height: 800 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/discord");

    await expect(page.locator(".discord-actions .control-button")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "開始使用" })).toHaveCount(0);
    await expect(page.locator(".discord-local-nav")).toHaveCount(0);
    await expect(page.locator("#quick-start .discord-step-list > li")).toHaveCount(3);
    await expect(page.locator("#discord-user-guide .discord-command-summary-list > li")).toHaveCount(
      4,
    );
    await expect(page.locator("#discord-admin-guide .discord-command-summary-list > li")).toHaveCount(
      2,
    );
    await expect(page.getByLabel("公開報告必要權限")).toBeVisible();

    const audienceCards = page.locator(".discord-audience-card");
    await expect(audienceCards.nth(0).getByRole("link")).toHaveCount(1);
    await expect(audienceCards.nth(0).getByRole("link")).toHaveAttribute("href", "#quick-start");
    await expect(audienceCards.nth(1).getByRole("link")).toHaveCount(1);
    await expect(audienceCards.nth(1).getByRole("link")).toHaveAttribute(
      "href",
      "#discord-admin-guide",
    );
    const audienceCardBoxes = await Promise.all([
      audienceCards.nth(0).boundingBox(),
      audienceCards.nth(1).boundingBox(),
    ]);
    if (viewport.width > 760) {
      expect(audienceCardBoxes[0]?.y).toBeCloseTo(audienceCardBoxes[1]?.y ?? 0, 0);
    } else {
      expect(audienceCardBoxes[1]?.y ?? 0).toBeGreaterThan(
        audienceCardBoxes[0]?.y ?? Number.POSITIVE_INFINITY,
      );
    }

    const commandSummary = page.getByLabel("Discord 指令操作摘要");
    if (viewport.width > 520) {
      await expect(commandSummary.getByText("/public-report settings", { exact: true })).toBeVisible();
      await expect(commandSummary.getByText("/status", { exact: true })).toBeVisible();
    } else {
      await expect(commandSummary.locator(".discord-visual-frame")).toBeHidden();
    }

    for (const image of await page.locator(".discord-guide-image").all()) {
      expect((await image.getAttribute("alt"))?.trim().length).toBeGreaterThan(0);
    }
    if (viewport.width <= 760) {
      for (const sequence of await page
        .locator("#discord-user-guide .discord-command-guide-sequence")
        .all()) {
        const gaps = await sequence.evaluate((element) => {
          const summary = element.querySelector(".discord-command-summary-list");
          const notice = element.querySelector(".discord-screenshot-notice");
          const details = element.querySelector(".discord-command-details-list");
          if (!summary || !notice || !details) return null;

          return {
            display: getComputedStyle(element).display,
            noticeToDetails:
              details.getBoundingClientRect().top - notice.getBoundingClientRect().bottom,
            summaryToNotice:
              notice.getBoundingClientRect().top - summary.getBoundingClientRect().bottom,
          };
        });
        expect(gaps).not.toBeNull();
        expect(gaps?.display).toBe("grid");
        expect(gaps?.summaryToNotice).toBeCloseTo(10, 0);
        expect(gaps?.noticeToDetails).toBeCloseTo(10, 0);
      }
    }
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/discord");
  const userDetails = page.locator("#discord-user-guide details");
  await expect(userDetails.nth(0)).toHaveAttribute("open", "");
  await expect(userDetails.nth(1)).not.toHaveAttribute("open", "");
  await expect(page.getByAltText("即時價格報告預覽截圖")).toBeHidden();
  await userDetails.nth(1).locator("summary").focus();
  await userDetails.nth(1).locator("summary").press("Space");
  await expect(userDetails.nth(1)).toHaveAttribute("open", "");
  await expect(page.getByAltText("即時價格報告預覽截圖")).toBeVisible();

  const faqDetails = page.locator(".discord-faq-item");
  await expect(page.locator(".discord-faq-item[open]")).toHaveCount(0);
  await faqDetails.first().locator("summary").press("Enter");
  await expect(faqDetails.first()).toHaveAttribute("open", "");

  await page.getByRole("link", { name: "查看一般使用者教學" }).click();
  await expect(page.locator("#quick-start")).toBeInViewport();
  await page.getByRole("link", { name: "查看管理員教學" }).click();
  await expect(page.locator("#discord-admin-guide")).toBeInViewport();
});

test("keeps mobile price-history records readable and uses discount wording @desktop-only", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/products/${READY_ROUTE_SLUG}`);

    const badge = page.locator(".history-record-badge.is-down").first();
    await expect(badge).toHaveText("降價");
    await expect(page.getByText("下跌", { exact: true })).toHaveCount(0);
    await expect(page.locator(".history-record-row strong.is-down").first()).toContainText("−NT$");
    const badgeMetrics = await badge.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const textRect = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        height: rect.height,
        horizontalCenterOffset: Math.abs(
          rect.left + rect.width / 2 - (textRect.left + textRect.width / 2),
        ),
        minWidth: Number.parseFloat(style.minWidth),
        paddingLeft: Number.parseFloat(style.paddingLeft),
        verticalCenterOffset: Math.abs(
          rect.top + rect.height / 2 - (textRect.top + textRect.height / 2),
        ),
        whiteSpace: style.whiteSpace,
      };
    });
    expect(badgeMetrics.minWidth).toBeGreaterThanOrEqual(52);
    expect(badgeMetrics.height).toBeGreaterThanOrEqual(30);
    expect(badgeMetrics.paddingLeft).toBeGreaterThanOrEqual(10);
    expect(badgeMetrics.whiteSpace).toBe("nowrap");
    expect(badgeMetrics.horizontalCenterOffset).toBeLessThanOrEqual(1);
    expect(badgeMetrics.verticalCenterOffset).toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(page);
  }
});

test("uses compact custom price-report filters, aligned table typography, and conditional reset @desktop-only", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const viewports = [
    { width: 1760, height: 900 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1121, height: 800 },
    { width: 1120, height: 800 },
    { width: 1024, height: 800 },
    { width: 761, height: 844 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/price-report");
    await expect(page.getByRole("region", { name: "價格變動列表" })).toBeVisible();

    const pageBox = await page.locator(".price-report-page").boundingBox();
    const expectedGutter = viewport.width <= 760 ? 12 : viewport.width > 1712 ? 40 : 16;
    expect(pageBox?.x).toBeCloseTo(expectedGutter, 0);
    expect(viewport.width - (pageBox?.x ?? 0) - (pageBox?.width ?? 0)).toBeCloseTo(
      expectedGutter,
      0,
    );

    const filterGrid = page.locator(".price-report-filter-grid");
    await expect(filterGrid).toHaveCSS("display", "flex");
    const filterGap = await filterGrid.evaluate((element) => getComputedStyle(element).columnGap);
    expect(filterGap).toBe("8px");

    const expectedControlHeight = viewport.width <= 760 ? 44 : 38;
    for (const control of await page
      .locator(
        ".price-report-select-trigger, .price-report-keyword-input input, .price-report-keyword-input button, .price-report-type-options",
      )
      .all()) {
      expect((await control.boundingBox())?.height).toBeCloseTo(expectedControlHeight, 0);
    }

    if (viewport.width >= 1440) {
      const controlTops = await getPriceReportControlRects(page).then((rects) =>
        rects.map((rect) => rect.top),
      );
      expect(Math.max(...controlTops) - Math.min(...controlTops)).toBeLessThanOrEqual(2);
      const keywordWidth = await page
        .getByRole("searchbox", { name: "搜尋價格變動商品" })
        .evaluate((element) => element.getBoundingClientRect().width);
      const selectWidth = await page
        .getByRole("button", { name: "時間範圍" })
        .evaluate((element) => element.getBoundingClientRect().width);
      expect(keywordWidth).toBeGreaterThan(selectWidth);
    }

    const summary = page.locator(".price-report-summary");
    await expect(summary.locator(".price-report-summary-item")).toHaveCount(3);
    await expect(summary.locator(".price-report-summary-card")).toHaveCount(0);
    expect((await summary.boundingBox())?.height).toBeLessThanOrEqual(76);
    await expect(summary.locator(".price-report-summary-item").nth(1)).toHaveCSS(
      "border-left-style",
      "solid",
    );

    const tableHeader = page.locator(".price-report-table-header");
    if (viewport.width > 1120) {
      await expect(tableHeader).toBeVisible();
      expect((await tableHeader.boundingBox())?.height).toBeCloseTo(48, 0);
      for (const header of await tableHeader.locator("span").all()) {
        await expect(header).toHaveCSS("text-align", "center");
      }

      const product = page.locator(".price-report-product").first();
      const productCopy = product.locator(".price-report-product-copy");
      const productLink = productCopy.locator("a");
      await expect(product).toHaveCSS("text-align", "left");
      await expect(product).toHaveCSS("justify-content", "stretch");
      await expect(productCopy).toHaveCSS("text-align", "left");
      await expect(productLink).toHaveCSS("text-align", "left");

      const [productBox, imageBox, linkBox, categoryBox] = await Promise.all([
        product.boundingBox(),
        product.locator(".product-image").boundingBox(),
        productLink.boundingBox(),
        page.locator(".price-report-category").first().boundingBox(),
      ]);
      expect(linkBox?.x ?? 0).toBeGreaterThanOrEqual(
        (imageBox?.x ?? Number.POSITIVE_INFINITY) + (imageBox?.width ?? 0),
      );
      expect((linkBox?.x ?? Number.POSITIVE_INFINITY) + (linkBox?.width ?? 0)).toBeLessThanOrEqual(
        (productBox?.x ?? 0) + (productBox?.width ?? 0),
      );
      expect(
        (productBox?.x ?? Number.POSITIVE_INFINITY) + (productBox?.width ?? 0),
      ).toBeLessThanOrEqual(categoryBox?.x ?? 0);

      for (const cell of await page
        .locator(
          ".price-report-category, .price-report-previous, .price-report-current, .price-report-amount, .price-report-percent, .price-report-changed",
        )
        .all()) {
        await expect(cell).toHaveCSS("text-align", "center");
        const value = cell.locator("span:last-child");
        const [cellBox, valueBox] = await Promise.all([cell.boundingBox(), value.boundingBox()]);
        const cellCenter = (cellBox?.x ?? 0) + (cellBox?.width ?? 0) / 2;
        const valueCenter = (valueBox?.x ?? 0) + (valueBox?.width ?? 0) / 2;
        expect(Math.abs(cellCenter - valueCenter)).toBeLessThanOrEqual(2);
      }
    } else {
      await expect(tableHeader).toBeHidden();
      await expect(page.locator(".price-report-cell-label").first()).toBeVisible();
      await expect(page.locator(".price-report-product").first()).toHaveCSS("text-align", "left");
      await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
        "white-space",
        "normal",
      );
      await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
        "word-break",
        "normal",
      );
      await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
        "overflow-wrap",
        "break-word",
      );
      if (viewport.width <= 390) {
        const tokenLineCounts = await readTokenLineCounts(
          page.locator(".price-report-product-copy a").first(),
          ["AI", "PRO", "R9700", "Creator", "Lexar", "D400", "Type-C+A", "USB3.1", "G1"],
        );
        expect(Object.values(tokenLineCounts).every((lineCount) => lineCount === 1)).toBe(true);
        const longSpecTokenLineCounts = await readTokenLineCounts(
          page.locator(".price-report-product-copy a").nth(1),
          ["32GB", "2920MHz", "27cm"],
        );
        expect(Object.values(longSpecTokenLineCounts).every((lineCount) => lineCount === 1)).toBe(
          true,
        );
      }
      for (const cell of await page.locator(".price-report-value").all()) {
        const label = cell.locator(".price-report-cell-label");
        const value = cell.locator("span:last-child");
        const [cellBox, labelBox, valueBox] = await Promise.all([
          cell.boundingBox(),
          label.boundingBox(),
          value.boundingBox(),
        ]);
        expect((labelBox?.x ?? 0) + (labelBox?.width ?? 0)).toBeLessThanOrEqual(
          valueBox?.x ?? 0,
        );
        expect((valueBox?.x ?? Number.POSITIVE_INFINITY) + (valueBox?.width ?? 0)).toBeLessThanOrEqual(
          (cellBox?.x ?? 0) + (cellBox?.width ?? 0),
        );
      }
      await expect(page.getByRole("navigation", { name: "頁碼" })).toBeVisible();
    }
    const reportRow = page.locator(".price-report-row").first();
    await expect(reportRow.locator(".price-report-kind")).toHaveCount(0);
    await expect(reportRow.locator(".price-report-amount > span:last-child")).toHaveText(
      "−NT$ 1,000",
    );
    const reportRows = page.locator(".price-report-rows");
    const visibleBackground = await readVisibleBackground(reportRow);
    expect(visibleBackground.backgroundColor).toBe("rgb(13, 25, 34)");
    expect(visibleBackground.sourceClasses).toContain("price-report-rows");
    const [rowsBox, firstRowBox, lastRowBox] = await Promise.all([
      reportRows.boundingBox(),
      reportRow.boundingBox(),
      page.locator(".price-report-row").last().boundingBox(),
    ]);
    expect(rowsBox?.y).toBeCloseTo(firstRowBox?.y ?? 0, 1);
    expect((rowsBox?.y ?? 0) + (rowsBox?.height ?? 0)).toBeCloseTo(
      (lastRowBox?.y ?? 0) + (lastRowBox?.height ?? 0),
      1,
    );
    const rowBoxBeforeHover = await reportRow.boundingBox();
    const borderBeforeHover = (await readRowStyleSnapshot(reportRow)).borderBottomColor;
    await reportRow.hover();
    const rowBoxAfterHover = await reportRow.boundingBox();
    expect(rowBoxAfterHover?.x).toBeCloseTo(rowBoxBeforeHover?.x ?? 0, 1);
    expect(rowBoxAfterHover?.width).toBeCloseTo(rowBoxBeforeHover?.width ?? 0, 1);
    expect(rowBoxAfterHover?.height).toBeCloseTo(rowBoxBeforeHover?.height ?? 0, 1);
    expect((await readRowStyleSnapshot(reportRow)).borderBottomColor).toBe(borderBeforeHover);
    await page.mouse.move(0, 0);
    await expect(reportRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect((await readVisibleBackground(reportRow)).backgroundColor).toBe(
      visibleBackground.backgroundColor,
    );
    await expect(page.getByRole("status").filter({ hasText: "資料最後成功更新" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");
  const homeFacetFilter = page.locator(".facet-filter").filter({ hasText: "腳位" });
  await homeFacetFilter.locator(".facet-menu-trigger").click();
  const homeFacetOption = homeFacetFilter.locator(".facet-option").first();
  const homeFacetCheckbox = homeFacetOption.getByRole("checkbox");
  const homeFacetDefaultStyle = await readOptionStyleSnapshot(homeFacetOption);
  const homeFacetDefaultIndicator = await readIndicatorStyleSnapshot(homeFacetOption);
  await homeFacetCheckbox.check();
  const homeFacetActiveStyle = await readOptionStyleSnapshot(homeFacetOption);
  const homeFacetActiveIndicator = await readIndicatorStyleSnapshot(homeFacetOption);

  await page.goto("/price-report");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);
  await expect(page.locator('select[aria-label="時間範圍"]')).toHaveCount(0);
  await expect(page.locator('select[aria-label="商品分類"]')).toHaveCount(0);
  await expect(page.locator('select[aria-label="排序"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "篩選價格變動" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "價格變動篩選" })).toBeVisible();

  await selectPriceReportOption(page, "時間範圍", "最近 7 天");
  await expect.poll(() => new URL(page.url()).searchParams.get("window")).toBe("7d");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重設", exact: true }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("");

  await selectPriceReportOption(page, "排序", "降幅最大");
  await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("drop_percent_desc");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重設", exact: true }).click();

  await page.getByRole("checkbox", { name: "新品" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("type"))
    .toEqual(["drop", "rise", "new"]);
  await expect(page.getByRole("checkbox", { name: "新品" })).toBeChecked();
  await expect(page.getByRole("button", { name: "重設", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重設", exact: true }).click();

  await page.getByRole("searchbox", { name: "搜尋價格變動商品" }).fill("RTX");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "查詢" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("RTX");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("2");
  await page.getByRole("button", { name: "重設" }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "搜尋價格變動商品" })).toHaveValue("");

  await page.getByRole("searchbox", { name: "搜尋價格變動商品" }).fill("RTX");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);
  await page.goto("/price-report?page=2");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);

  await page.goto("/price-report");
  const categoryTrigger = page.getByRole("button", { name: /^商品分類，目前/ });
  await categoryTrigger.click();
  const categoryDialog = page.getByRole("dialog", { name: "商品分類選項" });
  const categoryPopover = page.getByRole("group", { name: "商品分類選項" });
  await expect(categoryDialog).toBeVisible();
  await expect(categoryPopover).toBeVisible();
  await expect(categoryPopover.getByRole("checkbox")).toHaveCount(12);
  const priceCategoryOption = categoryPopover
    .locator(".price-report-category-option")
    .filter({ hasText: "CPU" });
  const priceCategoryCheckbox = priceCategoryOption.getByRole("checkbox");
  const priceCategoryDefaultStyle = await readOptionStyleSnapshot(priceCategoryOption);
  expectStyleFields(priceCategoryDefaultStyle, homeFacetDefaultStyle, [
    "backgroundColor",
    "border",
    "borderRadius",
    "color",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "minHeight",
    "paddingLeft",
  ]);
  expect(priceCategoryDefaultStyle.letterSpacing).toBe(homeFacetDefaultStyle.letterSpacing);
  expect(priceCategoryDefaultStyle.textAlign).toBe("left");
  expect(priceCategoryDefaultStyle.whiteSpace).toBe("nowrap");
  expect(priceCategoryDefaultStyle.wordSpacing).toBe(homeFacetDefaultStyle.wordSpacing);
  expect(await readIndicatorStyleSnapshot(priceCategoryOption)).toEqual(
    homeFacetDefaultIndicator,
  );
  const categoryOverflow = await categoryDialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(categoryOverflow.scrollHeight).toBeGreaterThan(categoryOverflow.clientHeight);
  const typography = await categoryPopover.locator("label").evaluateAll((options) =>
    ["CPU", "SSD", "HDD", "主機板", "風扇 / 配件"].map((label) => {
      const option = options.find((candidate) => candidate.textContent?.trim() === label);
      if (!option) return null;
      const style = getComputedStyle(option);
      return {
        label,
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing,
        wordSpacing: style.wordSpacing,
      };
    }),
  );
  expect(typography.every((item) => item !== null)).toBe(true);
  expect(new Set(typography.map((item) => item?.fontFamily)).size).toBe(1);
  expect(new Set(typography.map((item) => item?.letterSpacing)).size).toBe(1);
  expect(new Set(typography.map((item) => item?.wordSpacing)).size).toBe(1);
  await categoryTrigger.focus();
  await categoryTrigger.press("Tab");
  await expect(categoryPopover.getByRole("checkbox").first()).toBeFocused();
  await priceCategoryCheckbox.focus();
  await expect(priceCategoryOption).toHaveCSS("outline-style", "solid");
  await expect(priceCategoryOption).toHaveCSS("outline-width", "2px");
  await priceCategoryCheckbox.press("Space");
  await expect(categoryPopover).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("category")).toEqual(["cpu"]);
  await expect(categoryTrigger).toHaveAccessibleName("商品分類，目前CPU");
  const priceCategoryActiveStyle = await readOptionStyleSnapshot(priceCategoryOption);
  expectStyleFields(priceCategoryActiveStyle, homeFacetActiveStyle, [
    "backgroundColor",
    "border",
    "color",
  ]);
  expect(await readIndicatorStyleSnapshot(priceCategoryOption)).toEqual(
    homeFacetActiveIndicator,
  );
  await categoryPopover.getByRole("checkbox", { name: "顯示卡" }).check();
  await expect(categoryPopover).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("category")).toEqual([
    "cpu",
    "gpu",
  ]);
  await expect(categoryTrigger).toHaveAccessibleName("商品分類，目前已選 2 項");
  await expect(
    page.locator(".price-report-category span:not(.price-report-cell-label)"),
  ).toHaveText(["CPU", "顯示卡"]);
  await categoryPopover.getByRole("checkbox", { name: "CPU" }).uncheck();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("category")).toEqual(["gpu"]);
  await categoryPopover.getByRole("checkbox", { name: "顯示卡" }).uncheck();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("category")).toEqual([]);
  await expect(categoryTrigger).toHaveAccessibleName("商品分類，目前全部分類");
  await categoryPopover.press("Escape");
  await expect(categoryPopover).toHaveCount(0);
  await expect(categoryTrigger).toBeFocused();
  await categoryTrigger.click();
  await page.locator(".price-report-results-heading h2").click();
  await expect(categoryPopover).toHaveCount(0);
  await categoryTrigger.press("Space");
  await expect(categoryPopover).toBeVisible();
  await categoryPopover.getByRole("checkbox", { name: "CPU" }).focus();
  await categoryPopover.getByRole("checkbox", { name: "CPU" }).press("Tab");
  await expect(categoryPopover.getByRole("checkbox", { name: "主機板" })).toBeFocused();
  await expect(categoryPopover).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/price-report");
  const mobileCategoryTrigger = page.getByRole("button", { name: /^商品分類，目前/ });
  const mobileCategoryControl = page.locator(".price-report-category-control");
  expect((await mobileCategoryTrigger.boundingBox())?.width).toBeCloseTo(
    (await mobileCategoryControl.boundingBox())?.width ?? 0,
    0,
  );
  await mobileCategoryTrigger.click();
  const mobileCategoryPopover = page.getByRole("group", { name: "商品分類選項" });
  for (const option of await mobileCategoryPopover.locator("label").all()) {
    expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const [optionBox, textBox] = await Promise.all([
      option.boundingBox(),
      option.locator("span").boundingBox(),
    ]);
    expect(textBox?.x ?? 0).toBeGreaterThanOrEqual((optionBox?.x ?? 0) + 31);
    expect((textBox?.x ?? 0) + (textBox?.width ?? 0)).toBeLessThanOrEqual(
      (optionBox?.x ?? 0) + (optionBox?.width ?? 0),
    );
  }
  await expectNoHorizontalOverflow(page);
  await mobileCategoryPopover.getByRole("checkbox", { name: "風扇 / 配件" }).check();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("fan-accessory");

  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/");
  const homeProductStyle = await readStyleSnapshot(page.locator(".product-main a").first());
  const homePriceStyle = await readStyleSnapshot(page.locator(".row-price strong").first());
  const homeMovementStyle = await readStyleSnapshot(page.locator(".price-movement").first());
  const homeValueStyle = await readStyleSnapshot(page.locator(".table-cell").first());
  const homeHeaderStyle = await readStyleSnapshot(page.locator(".table-header"));
  const homeRow = page.locator(".product-row").first();
  const homeResultsPanelStyle = await readStyleSnapshot(page.locator(".results-panel"));
  const homeProductTableStyle = await readStyleSnapshot(page.locator(".product-table"));
  const homeRowParentStyle = await readStyleSnapshot(homeRow.locator("..").first());
  const homeVisibleBackground = await readVisibleBackground(homeRow);
  const homeRowStyle = await readRowStyleSnapshot(homeRow);
  const homeRowBoxBeforeHover = await homeRow.boundingBox();
  const homeBorderBeforeHover = homeRowStyle.borderBottomColor;
  await homeRow.hover();
  await expect(homeRow).toHaveCSS("background-color", "rgba(22, 42, 56, 0.68)");
  const homeRowHoverBackground = (await readRowStyleSnapshot(homeRow)).backgroundColor;
  const homeRowBoxAfterHover = await homeRow.boundingBox();
  expect(homeRowBoxAfterHover).toEqual(homeRowBoxBeforeHover);
  expect((await readRowStyleSnapshot(homeRow)).borderBottomColor).toBe(homeBorderBeforeHover);
  await page.mouse.move(0, 0);
  await expect(homeRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect((await readVisibleBackground(homeRow)).backgroundColor).toBe(
    homeVisibleBackground.backgroundColor,
  );
  await homeRow.getByRole("button", { name: "加入" }).click();
  await expect(homeRow).toHaveClass(/is-in-build-list/);
  const selectedHomeRowStyle = await readStyleSnapshot(homeRow);
  expect(selectedHomeRowStyle.backgroundColor).not.toBe(homeVisibleBackground.backgroundColor);
  await expect(homeRow).toHaveCSS("box-shadow", /rgba\(120, 216, 149, 0\.44\)/);
  await page.goto("/price-report");

  const reportRow = page.locator(".price-report-row").first();
  const reportResultsStyle = await readStyleSnapshot(page.locator(".price-report-results"));
  const reportRowsStyle = await readStyleSnapshot(page.locator(".price-report-rows"));
  const reportRowParentStyle = await readStyleSnapshot(reportRow.locator("..").first());
  const reportVisibleBackground = await readVisibleBackground(reportRow);
  expect(homeResultsPanelStyle.backgroundColor).toBe("rgb(13, 25, 34)");
  expect(homeProductTableStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(homeRowParentStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(homeVisibleBackground.sourceClasses).toContain("results-panel");
  expect(reportResultsStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(reportRowsStyle.backgroundColor).toBe(homeResultsPanelStyle.backgroundColor);
  expect(reportRowParentStyle.backgroundColor).toBe(reportRowsStyle.backgroundColor);
  expect(reportVisibleBackground.backgroundColor).toBe(homeVisibleBackground.backgroundColor);
  expect(reportVisibleBackground.sourceClasses).toContain("price-report-rows");
  const reportRowStyle = await readRowStyleSnapshot(reportRow);
  expectStyleFields(reportRowStyle, homeRowStyle, [
    "backgroundColor",
    "transitionDuration",
    "transitionProperty",
  ]);
  const reportBorderBeforeHover = reportRowStyle.borderBottomColor;
  const reportRowBoxBeforeHover = await reportRow.boundingBox();
  await reportRow.hover();
  await expect(reportRow).toHaveCSS("background-color", homeRowHoverBackground);
  expect((await readRowStyleSnapshot(reportRow)).backgroundColor).toBe(homeRowHoverBackground);
  expect((await readRowStyleSnapshot(reportRow)).borderBottomColor).toBe(
    reportBorderBeforeHover,
  );
  expect(await reportRow.boundingBox()).toEqual(reportRowBoxBeforeHover);
  await page.mouse.move(0, 0);
  await expect(reportRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect((await readVisibleBackground(reportRow)).backgroundColor).toBe(
    reportVisibleBackground.backgroundColor,
  );
  await expect(page.locator(".price-report-row.is-in-build-list")).toHaveCount(0);

  const productStyle = await readStyleSnapshot(
    page.locator(".price-report-product-copy a").first(),
  );
  expectStyleFields(productStyle, homeProductStyle, [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "color",
  ]);

  for (const selector of [
    ".price-report-previous > span:last-child",
    ".price-report-current > span:last-child",
  ]) {
    const priceStyle = await readStyleSnapshot(page.locator(selector).first());
    expectStyleFields(priceStyle, homePriceStyle, [
      "fontSize",
      "fontWeight",
      "color",
      "fontVariantNumeric",
      "whiteSpace",
    ]);
  }

  for (const selector of [
    ".price-report-amount > span:last-child",
    ".price-report-percent > span:last-child",
  ]) {
    const movementStyle = await readStyleSnapshot(page.locator(selector).first());
    expectStyleFields(movementStyle, homeMovementStyle, [
      "fontSize",
      "fontWeight",
      "fontVariantNumeric",
      "whiteSpace",
    ]);
  }

  for (const selector of [
    ".price-report-category > span:last-child",
    ".price-report-changed > span:last-child",
  ]) {
    const valueStyle = await readStyleSnapshot(page.locator(selector).first());
    expectStyleFields(valueStyle, homeValueStyle, [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "color",
    ]);
    expect(valueStyle.textAlign).toBe("center");
  }

  const reportHeaderStyle = await readStyleSnapshot(page.locator(".price-report-table-header"));
  expectStyleFields(reportHeaderStyle, homeHeaderStyle, [
    "minHeight",
    "fontSize",
    "fontWeight",
    "color",
    "backgroundColor",
  ]);

  const dropMovementColor = await page
    .locator(".price-report-row.is-drop .price-report-amount > span:last-child")
    .evaluate((element) => getComputedStyle(element).color);
  const riseMovementColor = await page
    .locator(".price-report-row.is-rise .price-report-amount > span:last-child")
    .evaluate((element) => getComputedStyle(element).color);
  expect(dropMovementColor).toBe("rgb(104, 226, 145)");
  expect(riseMovementColor).toBe("rgb(255, 138, 145)");
  expect(reportHeaderStyle.backgroundColor).toBe("rgb(20, 37, 50)");
  await expect(page.locator(".price-report-source-status")).toHaveCSS(
    "background-color",
    "rgb(16, 28, 38)",
  );
  await expect(page.locator(".price-report-summary")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".pagination-bar")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );

  await page.goto("/price-report?q=stale");
  await expect(page.locator(".price-report-source-warning")).toHaveCSS(
    "background-color",
    "rgba(122, 92, 28, 0.2)",
  );
});

test("presents build-list summary, categories, actions, and data status in one sidebar @desktop-only", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const cpuOneId = "11111111-1111-4111-8111-111111111111";
  const cpuTwoId = "22222222-2222-4222-8222-222222222222";
  const gpuId = "33333333-3333-4333-8333-333333333333";
  const missingId = "44444444-4444-4444-8444-444444444444";

  await page.route("**/api/build-list/refresh", async (route) => {
    await fulfillJson(route, {
      data: [
        buildListProduct(cpuOneId, "CPU 零件一", "CPU", 1_000, true),
        buildListProduct(cpuTwoId, "未勾選主機板", "主機板", 2_000, false),
        buildListProduct(gpuId, "顯示卡零件", "顯示卡", 3_000, true),
      ],
      missingProductIds: [missingId],
    });
  });
  await page.addInitScript(
    ({ ids, observedAt }) => {
      window.localStorage.setItem(
        "partsradartw:build-list:v3",
        JSON.stringify(
          ids.map((productId, index) => ({
            productId,
            quantity: index === 0 ? 2 : 1,
            includeInExport: index !== 1,
            order: index,
            addedAt: observedAt,
            updatedAt: observedAt,
          })),
        ),
      );
    },
    { ids: [cpuOneId, cpuTwoId, gpuId, missingId], observedAt: OBSERVED_AT },
  );

  for (const viewport of [
    { width: 1760, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 800 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/build-list");
    const sidebar = page.getByLabel("配單摘要與操作");
    await expect(page.getByText("5 件商品", { exact: true })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "配單摘要" })).toBeVisible();
    await expect(sidebar.getByText("NT$ 5,000")).toBeVisible();
    await expect(sidebar.getByText("品項數").locator("..")).toContainText("3");
    await expect(sidebar.getByText("零件數").locator("..")).toContainText("4");
    await expect(sidebar.getByText("匯出品項")).toHaveCount(0);
    await expect(sidebar.getByText("可能已下架")).toHaveCount(0);
    await expect(sidebar.getByText("資料待確認").locator("..")).toContainText("1");
    await expect(sidebar.getByLabel("CPU，1 個品項，共 2 件")).toContainText("2 件");
    await expect(sidebar.getByLabel("顯示卡，1 個品項，共 1 件")).toContainText("1 件");
    await expect(sidebar).not.toContainText("主機板");
    await expect(sidebar.getByRole("button", { name: "下載 Excel（3）" })).toBeEnabled();
    await expect(sidebar.getByRole("button", { name: "重新整理商品資料" })).toBeEnabled();
    await expect(sidebar.getByText("配單只儲存在此瀏覽器，不會跨裝置同步。")).toBeVisible();
    await expect(sidebar).not.toContainText(/相容性|瓦數|運費|稅金|折扣/);

    const sideColumn = page.locator(".build-list-side-column");
    await expect(sideColumn).toHaveCSS("position", viewport.width > 900 ? "sticky" : "static");
    const overflowStyles = await sideColumn.evaluate((element) => ({
      sidebar: getComputedStyle(element).overflowY,
      summary: getComputedStyle(element.firstElementChild as Element).overflowY,
    }));
    expect(["auto", "scroll"]).not.toContain(overflowStyles.sidebar);
    expect(["auto", "scroll"]).not.toContain(overflowStyles.summary);
    for (const action of await sidebar.locator(".build-list-summary-actions button").all()) {
      expect((await action.boundingBox())?.width).toBeCloseTo(
        (await action.locator("..").boundingBox())?.width ?? 0,
        0,
      );
    }
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/build-list");
  const sidebar = page.getByLabel("配單摘要與操作");
  await page.getByRole("checkbox", { name: "將 CPU 零件一 加入下載配單" }).uncheck();
  await expect(sidebar.getByText("品項數").locator("..")).toContainText("2");
  await expect(sidebar.getByText("零件數").locator("..")).toContainText("2");
  await expect(sidebar.getByText("NT$ 3,000")).toBeVisible();
  await expect(sidebar.getByLabel(/CPU，/)).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "下載 Excel（2）" })).toBeEnabled();

  await page.locator(".build-list-export-toggle input:checked").first().uncheck();
  await page.locator(".build-list-export-toggle input:checked").first().uncheck();
  await expect(sidebar.getByText("NT$ 0")).toBeVisible();
  await expect(sidebar.getByText("品項數").locator("..")).toContainText("0");
  await expect(sidebar.getByText("零件數").locator("..")).toContainText("0");
  await expect(sidebar.getByRole("heading", { name: "零件構成" })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "下載 Excel（0）" })).toBeDisabled();
  await expect(sidebar.getByText("尚未勾選要納入配單摘要與下載的品項。")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "重新整理商品資料" })).toBeEnabled();
  await expect(sidebar.getByRole("button", { name: "清空配單" })).toBeEnabled();

  await page.getByRole("checkbox", { name: "將 顯示卡零件 加入下載配單" }).check();
  await expect(sidebar.getByText("品項數").locator("..")).toContainText("1");
  await expect(sidebar.getByText("NT$ 3,000")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "下載 Excel（1）" })).toBeEnabled();
  await sidebar.getByRole("button", { name: "重新整理商品資料" }).click();
  await expect(sidebar.getByText(/商品資料已更新|正在取得最新商品資料/)).toBeVisible();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await sidebar.getByRole("button", { name: "清空配單" }).click();
  await expect(sidebar).toBeVisible();
});

test("keeps the main pages usable without horizontal overflow", async ({ page }, testInfo) => {
  test.setTimeout(60_000);

  await page.goto("/?category=gpu&page=10");
  await expect(page.getByRole("status", { name: "網站公告" })).toHaveCount(0);
  await expect(page.locator(".topbar").getByRole("link", { name: "價格變動總覽" })).toBeVisible();
  await expect(page.locator(".topbar").getByRole("link", { name: "公告" })).toBeVisible();
  await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "頁碼" })).toBeVisible();

  const gpuChipFilter = page.locator(".facet-filter").filter({ hasText: "GPU 晶片" });
  const vramFilter = page.locator(".facet-filter").filter({ hasText: "顯示記憶體" });
  const isMobile = (page.viewportSize()?.width ?? 0) <= 760;
  await expect(page.getByRole("button", { name: /^篩選/ })).toHaveCount(0);
  const sortSelect = page.getByRole("combobox", { name: "排序" });
  const pageSizeSelect = page.getByRole("combobox", { name: "每頁顯示" });
  const minimumPriceInput = page.getByRole("textbox", { name: "最低價格" });
  for (const control of [sortSelect, pageSizeSelect, minimumPriceInput]) {
    await control.click();
    await expect(control).toHaveCSS("outline-style", "none");
    await control.press("Escape");
  }
  await gpuChipFilter.getByRole("button", { name: "全部" }).click();
  if (!isMobile) {
    const facetTriggerWidth = await gpuChipFilter
      .getByRole("button", { name: "全部" })
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(facetTriggerWidth).toBeCloseTo(112, 0);
  }
  await page.getByRole("checkbox", { name: "NVIDIA" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["gpu_chip:nvidia"]);
  if (!isMobile) {
    await vramFilter.getByRole("button", { name: "全部" }).click();
    await page.getByRole("checkbox", { name: "16 GB" }).check();
  }
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(isMobile ? ["gpu_chip:nvidia"] : ["gpu_chip:nvidia", "vram_gb:16"]);
  await expect(
    page.getByRole("button", {
      name: "移除篩選：GPU 晶片：NVIDIA",
    }),
  ).toBeVisible();
  if (!isMobile) {
    await expect(
      page.getByRole("button", {
        name: "移除篩選：顯示記憶體：16 GB",
      }),
    ).toBeVisible();
  }

  const resetButton = page.getByRole("button", { name: "重設", exact: true });
  await expect(resetButton).toBeVisible();
  const resetAlignment = await resetButton.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const summaryRect = button.closest(".active-filter-summary-row")?.getBoundingClientRect();
    const firstChipRect = button
      .closest(".active-filter-summary-row")
      ?.querySelector(".active-filter-chip")
      ?.getBoundingClientRect();
    return summaryRect && firstChipRect
      ? {
          rightOffset: summaryRect.right - buttonRect.right,
          topOffset: Math.abs(firstChipRect.top - buttonRect.top),
        }
      : null;
  });
  expect(resetAlignment).not.toBeNull();
  expect(resetAlignment?.rightOffset).toBeLessThanOrEqual(1);
  expect(resetAlignment?.topOffset).toBeLessThanOrEqual(1);

  await page.getByRole("searchbox", { name: "搜尋商品名稱" }).focus();
  await expect(page.getByRole("searchbox", { name: "搜尋商品名稱" })).toHaveCSS(
    "outline-style",
    "none",
  );
  await expectUsableLayout(page, testInfo);

  if (isMobile) {
    await page.goto("/?category=cpu");
  } else {
    await vramFilter.getByRole("button", { name: "16 GB" }).click();
    await page.getByRole("button", { name: "移除篩選：GPU 晶片：NVIDIA" }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.getAll("facet"))
      .toEqual(["vram_gb:16"]);
    await gpuChipFilter.getByRole("button", { name: "全部" }).click();
    await expect(page.getByRole("checkbox", { name: "NVIDIA" })).not.toBeChecked();
    await gpuChipFilter.getByRole("button", { name: "全部" }).click();
    await resetButton.click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
    await vramFilter.getByRole("button", { name: "全部" }).click();
    await expect(page.getByRole("checkbox", { name: "16 GB" })).not.toBeChecked();
    await vramFilter.getByRole("button", { name: "全部" }).click();
    await page.getByRole("radiogroup", { name: "分類" }).getByText("CPU", { exact: true }).click();
  }
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("cpu");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
  await expect(page.getByRole("group", { name: "已選篩選條件" })).toHaveCount(0);

  await page.goto("/price-report");
  await expect(page.getByRole("heading", { exact: true, name: "價格變動總覽" })).toBeVisible();
  await expect(page.getByRole("region", { name: "價格變動列表" })).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: PRICE_REPORT_WRAP_NAME,
    }),
  ).toBeVisible();
  await expect(page.getByText("符合項目", { exact: true })).toHaveCount(0);
  await expect(page.getByText("40 筆", { exact: true })).toHaveCount(1);
  await expect(page.getByText("風扇／配件", { exact: true })).toBeVisible();
  const reportPagination = page.getByRole("navigation", { name: "頁碼" });
  await expect(reportPagination.getByRole("button", { name: "1", exact: true })).toBeVisible();
  await expect(reportPagination.getByRole("button", { name: "2", exact: true })).toBeVisible();
  await expect(page.getByText(/第 1 \/ 2 頁/)).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "降價" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "漲價" })).toBeChecked();
  const newProductCheckbox = page.getByRole("checkbox", { name: "新品" });
  await expect(newProductCheckbox).not.toBeChecked();
  await newProductCheckbox.focus();
  await newProductCheckbox.press("Space");
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("type"))
    .toEqual(["drop", "rise", "new"]);
  await expect(newProductCheckbox).toBeChecked();
  await newProductCheckbox.press("Space");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("type")).toEqual([]);
  await expect(newProductCheckbox).not.toBeChecked();
  await page.getByRole("button", { name: "時間範圍", exact: true }).focus();
  await expectUsableLayout(page, testInfo);

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { exact: true, name: "隱私權政策" })).toBeVisible();
  await expect(page.getByText(/配單內容儲存在目前使用的瀏覽器/)).toBeVisible();
  await page.getByRole("link", { name: "返回查詢" }).focus();
  await expectUsableLayout(page, testInfo);

  await page.goto("/visual-missing-route");
  await expect(page.getByRole("heading", { exact: true, name: "找不到這個頁面" })).toBeVisible();
  await page.getByRole("link", { name: "返回商品查詢" }).focus();
  await expectUsableLayout(page, testInfo);

  await page.goto(`/products/${READY_ROUTE_SLUG}`);
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "價格走勢" })).toBeVisible();
  const chartPoints = page.locator(".history-chart-point-button");
  await chartPoints.first().focus();
  const historyTooltip = page.locator(".history-tooltip");
  await expect(historyTooltip).toHaveClass(/is-below/);
  await expectUsableLayout(page, testInfo);
  await chartPoints.last().focus();
  await expect(historyTooltip).not.toHaveClass(/is-below/);
  await expectNoHorizontalOverflow(page);

  await page.evaluate(
    ({ productId, observedAt }) => {
      window.localStorage.setItem(
        "partsradartw:build-list:v3",
        JSON.stringify([
          {
            productId,
            quantity: 2,
            includeInExport: true,
            order: 0,
            addedAt: observedAt,
            updatedAt: observedAt,
          },
        ]),
      );
    },
    { productId: PRODUCT_ID, observedAt: OBSERVED_AT },
  );
  await page.goto("/build-list");
  await expect(page.locator(".topbar").getByRole("link", { name: "價格變動總覽" })).toBeVisible();
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  await page.getByRole("link", { name: "原價屋查看／購買，開新分頁" }).focus();
  await expectUsableLayout(page, testInfo);

  await page.goto("/discord");
  await expect(page.getByRole("heading", { name: "快速開始" })).toBeVisible();
  const discordBackLinkWidth = await page
    .getByRole("link", { name: "返回查詢" })
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(discordBackLinkWidth).toBeLessThan(180);
  await page.getByRole("link", { name: "查看一般使用者教學" }).focus();
  await expectUsableLayout(page, testInfo);
});

test("mounts one global build-list link across public routes and required viewports", {
  tag: "@desktop-only",
}, async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(
    ({ productId, observedAt }) => {
      window.localStorage.setItem(
        "partsradartw:build-list:v3",
        JSON.stringify([
          {
            productId,
            quantity: 3,
            includeInExport: true,
            order: 0,
            addedAt: observedAt,
            updatedAt: observedAt,
          },
        ]),
      );
    },
    { productId: PRODUCT_ID, observedAt: OBSERVED_AT },
  );

  const routes = [
    "/",
    `/products/${READY_ROUTE_SLUG}`,
    "/price-report",
    "/discord",
    "/announcements",
    "/about",
    "/privacy",
    "/terms",
    "/build-list",
  ];
  const viewports = [
    { width: 1760, height: 900 },
    { width: 1280, height: 800 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();

      const floatingLink = page.getByRole("link", {
        exact: true,
        name: "開啟配單，目前 3 件",
      });

      if (route === "/build-list") {
        await expect(page.getByRole("heading", { exact: true, name: "配單" })).toBeVisible();
        await expect(floatingLink).toHaveCount(0);
      } else {
        await expect(floatingLink).toHaveCount(1);
        await expect(floatingLink).toBeVisible();
        await expect(floatingLink).toHaveAttribute("href", /^\/build-list\?returnTo=/);
        const floatingHref = new URL(
          (await floatingLink.getAttribute("href")) ?? "",
          "https://partsradar.invalid",
        );
        const currentUrl = new URL(page.url());
        expect(floatingHref.searchParams.get("returnTo")).toBe(
          `${currentUrl.pathname}${currentUrl.search}`,
        );
        await expect(floatingLink).toHaveAttribute("title", "開啟配單");
        await expectFloatingLinkNotToCoverContent(floatingLink, "main");

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expectFloatingLinkNotToCoverContent(floatingLink, "footer");
      }

      await expectNoHorizontalOverflow(page);
    }
  }
});

test("preserves product explorer state through safe build-list return links @desktop-only", async ({
  page,
}) => {
  const originalLocation =
    "/?q=ryzen&category=cpu&facet=socket%3Alga1700&facet=cpu_family%3Acore-i5&minPrice=1000&maxPrice=20000&vendors=intel&status=all&sort=price_desc&page=10&pageSize=50";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(originalLocation);

  await expect(page.getByRole("searchbox", { name: "搜尋商品名稱" })).toHaveValue("ryzen");
  await expect(page.getByRole("textbox", { name: "最低價格" })).toHaveValue("1000");
  await expect(page.getByRole("textbox", { name: "最高價格" })).toHaveValue("20000");
  await expect(page.getByRole("button", { name: "全部商品" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "排序" })).toHaveValue("price_desc");
  await expect(page.getByRole("combobox", { name: "每頁顯示" })).toHaveValue("50");
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "移除篩選：產品系列：Intel Core i5" }),
  ).toBeVisible();

  const originalUrl = new URL(page.url());
  const canonicalLocation = `${originalUrl.pathname}${originalUrl.search}`;
  const floatingLink = page.getByRole("link", { name: /^開啟配單，目前/ });
  const floatingHref = new URL(
    (await floatingLink.getAttribute("href")) ?? "",
    "https://partsradar.invalid",
  );
  expect(floatingHref.pathname).toBe("/build-list");
  expect(floatingHref.searchParams.get("returnTo")).toBe(canonicalLocation);
  await floatingLink.click();

  await expect.poll(() => new URL(page.url()).pathname).toBe("/build-list");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(canonicalLocation);
  const topReturnLink = page.getByRole("link", { name: "返回查詢" });
  const emptyReturnLink = page.getByRole("link", { name: "回到查詢" });
  await expect(topReturnLink).toHaveAttribute("href", canonicalLocation);
  await expect(emptyReturnLink).toHaveAttribute("href", canonicalLocation);
  await topReturnLink.click();

  await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(
    canonicalLocation,
  );
  await expect(page.getByRole("searchbox", { name: "搜尋商品名稱" })).toHaveValue("ryzen");
  await expect(page.getByRole("button", { name: "全部商品" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();

  await page.goto("/build-list?returnTo=https%3A%2F%2Fevil.example%2Fpath");
  await expect(page.getByRole("link", { name: "返回查詢" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "回到查詢" })).toHaveAttribute("href", "/");

  await page.goto("/build-list");
  await expect(page.getByRole("link", { name: "返回查詢" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "回到查詢" })).toHaveAttribute("href", "/");
});

test("matches the product-detail mobile topbar and centers build-list item controls @desktop-only", async ({
  page,
}) => {
  const longProductName = "超長型號視覺驗證顯示卡 RTX 5090 OC Edition 32GB 三風扇高效能版本";

  await page.route("**/api/build-list/refresh", async (route) => {
    await fulfillJson(route, {
      data: [
        {
          ...buildListProduct(PRODUCT_ID, longProductName, "顯示卡", 18_990, true),
          image: { alt: longProductName, url: "/favicon.svg" },
        },
      ],
      missingProductIds: [],
    });
  });
  await page.addInitScript(
    ({ observedAt, productId }) => {
      window.localStorage.setItem(
        "partsradartw:build-list:v3",
        JSON.stringify([
          {
            productId,
            quantity: 3,
            includeInExport: true,
            order: 0,
            addedAt: observedAt,
            updatedAt: observedAt,
          },
        ]),
      );
    },
    { observedAt: OBSERVED_AT, productId: PRODUCT_ID },
  );

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);

    await page.goto(`/products/${READY_ROUTE_SLUG}`);
    const detailTopbarMetrics = await readTopbarLayout(page, ".public-info-topbar");

    await page.goto("/build-list");
    const buildListTopbar = page.locator(".build-list-topbar");
    for (const name of ["價格變動總覽", "公告", "Discord"]) {
      await expect(buildListTopbar.getByRole("link", { exact: true, name })).toBeVisible();
    }

    const buildListTopbarMetrics = await readTopbarLayout(page, ".build-list-topbar");
    expect(buildListTopbarMetrics.gap).toBe(detailTopbarMetrics.gap);
    expect(buildListTopbarMetrics.navHeights).toEqual(detailTopbarMetrics.navHeights);
    expect(buildListTopbarMetrics.brand.height).toBeCloseTo(detailTopbarMetrics.brand.height, 0);
    expect(buildListTopbarMetrics.area.scrollWidth).toBeLessThanOrEqual(
      buildListTopbarMetrics.area.clientWidth,
    );
    expect(buildListTopbarMetrics.area.overflowX).not.toBe("auto");
    expect(buildListTopbarMetrics.area.flexWrap).toBe("wrap");
    expect(
      Math.max(...buildListTopbarMetrics.nav.map(({ top }) => top)) -
        Math.min(...buildListTopbarMetrics.nav.map(({ top }) => top)),
    ).toBeLessThanOrEqual(2);
    expect(buildListTopbarMetrics.brand.bottom).toBeLessThanOrEqual(
      Math.min(...buildListTopbarMetrics.nav.map(({ top }) => top)) + 1,
    );
    expect(buildListTopbarMetrics.title.top).toBeGreaterThanOrEqual(
      buildListTopbarMetrics.area.bottom,
    );
    expect(buildListTopbarMetrics.title.right).toBeLessThanOrEqual(
      buildListTopbarMetrics.back.left,
    );
    for (const navRect of buildListTopbarMetrics.nav) {
      expect(navRect.left).toBeGreaterThanOrEqual(buildListTopbarMetrics.area.left - 1);
      expect(navRect.right).toBeLessThanOrEqual(buildListTopbarMetrics.area.right + 1);
    }

    const item = page.locator(".build-list-item").filter({ hasText: longProductName });
    const checkbox = item.getByRole("checkbox", { name: `將 ${longProductName} 加入下載配單` });
    const image = item.getByAltText(longProductName);
    const main = item.locator(".build-list-item-main");
    const controls = item.locator(".build-list-item-controls");
    const stepper = item.locator(".quantity-stepper");
    const removeButton = item.getByRole("button", { name: "移除" });
    await expect(checkbox).toBeChecked();
    await expect(image).toBeVisible();
    await expect(item.getByRole("spinbutton", { name: "數量" })).toHaveValue("3");

    const [itemBox, checkboxBox, imageBox, mainBox, controlsBox, stepperBox, removeBox] =
      await Promise.all([
        item.boundingBox(),
        checkbox.boundingBox(),
        image.boundingBox(),
        main.boundingBox(),
        controls.boundingBox(),
        stepper.boundingBox(),
        removeButton.boundingBox(),
      ]);
    expect((checkboxBox?.x ?? 0) + (checkboxBox?.width ?? 0)).toBeLessThan(imageBox?.x ?? 0);
    expect(
      Math.abs(
        (checkboxBox?.y ?? 0) +
          (checkboxBox?.height ?? 0) / 2 -
          ((imageBox?.y ?? 0) + (imageBox?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect((imageBox?.x ?? 0) + (imageBox?.width ?? 0)).toBeLessThanOrEqual(mainBox?.x ?? 0);
    expect(controlsBox?.y ?? 0).toBeGreaterThanOrEqual(mainBox?.y ?? 0);
    expect(
      Math.abs(
        (controlsBox?.x ?? 0) +
          (controlsBox?.width ?? 0) / 2 -
          ((itemBox?.x ?? 0) + (itemBox?.width ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(3);
    expect(Math.abs((stepperBox?.y ?? 0) - (removeBox?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(removeBox?.x ?? 0).toBeGreaterThanOrEqual(
      (stepperBox?.x ?? 0) + (stepperBox?.width ?? Number.POSITIVE_INFINITY),
    );
    expect(stepperBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(removeBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await item.getByRole("button", { name: "增加數量" }).click();
    await expect(item.getByRole("spinbutton", { name: "數量" })).toHaveValue("4");
    await item.getByRole("button", { name: "減少數量" }).click();
    await expect(item.getByRole("spinbutton", { name: "數量" })).toHaveValue("3");
    await removeButton.click();
    await expect(page.getByText("已從配單移除")).toBeVisible();
    await page.getByRole("button", { name: "復原" }).click();
    await expect(
      page.locator(".build-list-item").filter({ hasText: longProductName }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1760, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/build-list");
    const item = page.locator(".build-list-item").filter({ hasText: longProductName });
    const [checkboxBox, imageBox, mainBox, controlsBox] = await Promise.all([
      item.getByRole("checkbox").boundingBox(),
      item.getByAltText(longProductName).boundingBox(),
      item.locator(".build-list-item-main").boundingBox(),
      item.locator(".build-list-item-controls").boundingBox(),
    ]);
    await expect(item.locator(".build-list-item-media")).toHaveCSS("display", "contents");
    expect((checkboxBox?.x ?? 0) + (checkboxBox?.width ?? 0)).toBeLessThan(imageBox?.x ?? 0);
    expect((imageBox?.x ?? 0) + (imageBox?.width ?? 0)).toBeLessThan(mainBox?.x ?? 0);
    expect((mainBox?.x ?? 0) + (mainBox?.width ?? 0)).toBeLessThan(controlsBox?.x ?? 0);
    await expect(page.locator(".build-list-side-column")).toHaveCSS("position", "sticky");
    const desktopTopbarMetrics = await readTopbarLayout(page, ".build-list-topbar");
    expect(
      Math.max(
        desktopTopbarMetrics.brand.centerY,
        desktopTopbarMetrics.title.centerY,
        desktopTopbarMetrics.back.centerY,
      ) -
        Math.min(
          desktopTopbarMetrics.brand.centerY,
          desktopTopbarMetrics.title.centerY,
          desktopTopbarMetrics.back.centerY,
        ),
    ).toBeLessThanOrEqual(2);
    await expectNoHorizontalOverflow(page);
  }
});

test("keeps error and empty states usable", async ({ page }, testInfo) => {
  await page.goto("/price-report?q=loading");
  await expect(page.locator(".price-report-skeleton")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect.poll(() => releasePriceReportLoading !== null).toBe(true);
  releasePriceReportLoading?.();
  await expect(page.locator(".price-report-skeleton")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "資料最後成功更新" })).toBeVisible();

  await page.goto("/price-report?q=empty");
  await expect(page.getByText("這個範圍沒有符合條件的價格變動")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/price-report?q=stale");
  await expect(
    page.getByRole("status").filter({ hasText: "資料可能過期或部分分類尚未成功" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "時間範圍", exact: true }).focus();
  await expectUsableLayout(page, testInfo);

  await page.goto("/price-report?q=unavailable");
  await expect(
    page.getByRole("status").filter({ hasText: "目前無法確認來源資料的新鮮度" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/price-report?q=error");
  await expect(page.getByRole("alert").filter({ hasText: "價格變動暫時無法載入" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/?category=gpu&q=error");
  await expect(page.getByRole("alert").filter({ hasText: "商品資料暫時無法載入" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/products/${ERROR_ROUTE_SLUG}`);
  await expect(page.getByRole("alert").filter({ hasText: "商品資料暫時無法載入" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.evaluate(() => window.localStorage.removeItem("partsradartw:build-list:v3"));
  await page.goto("/build-list");
  await expect(page.getByText("配單目前沒有品項")).toBeVisible();
  await expect(page.getByRole("link", { name: "回到查詢" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("suppresses authored transitions when reduced motion is requested", {
  tag: "@desktop-only",
}, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  expect(
    await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);
  await expectTransitionDurationAtMost(page.getByRole("searchbox", { name: "搜尋商品名稱" }), 0.01);

  await page.goto(`/products/${READY_ROUTE_SLUG}`);
  const copyButton = page.getByRole("button", { name: "複製商品連結" });
  await expect(copyButton).toBeVisible();
  await expectTransitionDurationAtMost(copyButton, 0.01);
  await expectTransitionDurationAtMost(copyButton.locator(".detail-action-icon"), 0.01);
});

async function selectVendor(page: Page, vendorName: string) {
  const vendorFilter = page.locator(".vendor-filter");
  if (!(await vendorFilter.locator(".vendor-menu-popover").isVisible())) {
    await vendorFilter.locator(".vendor-menu-trigger").click();
  }
  await expect(
    vendorFilter.getByRole("checkbox", { exact: true, name: vendorName }),
  ).not.toBeChecked();
  await vendorFilter.locator(".vendor-option").filter({ hasText: vendorName }).click();
  await vendorFilter.locator(".vendor-menu-trigger").click();
}

async function selectFacetOptions(page: Page, facetLabel: string, optionLabels: string[]) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const optionLabel of optionLabels) {
    await facetFilter.getByRole("checkbox", { exact: true, name: optionLabel }).check();
  }
}

async function assertFacetOptionsUnchecked(page: Page, facetLabel: string, optionLabels: string[]) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const optionLabel of optionLabels) {
    await expect(
      facetFilter.getByRole("checkbox", { exact: true, name: optionLabel }),
    ).not.toBeChecked();
  }
}

async function switchCategory(page: Page, categoryLabel: string, categorySlug: string) {
  await page
    .getByRole("radiogroup", { name: "分類" })
    .getByText(categoryLabel, { exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(categorySlug);
  await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();
}

async function expectQueryFilters(
  page: Page,
  expected: { category: string; facets: string[]; vendors: string | null },
) {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        category: url.searchParams.get("category"),
        facets: url.searchParams.getAll("facet"),
        vendors: url.searchParams.get("vendors"),
      };
    })
    .toEqual(expected);
}

async function assertVendorCheckboxStates(
  page: Page,
  expected: { checked?: string[]; unchecked?: string[]; absent?: string[] },
) {
  const vendorFilter = page.locator(".vendor-filter");
  await vendorFilter.locator(".vendor-menu-trigger").click();
  for (const vendor of expected.checked ?? []) {
    await expect(vendorFilter.getByRole("checkbox", { exact: true, name: vendor })).toBeChecked();
  }
  for (const vendor of expected.unchecked ?? []) {
    await expect(
      vendorFilter.getByRole("checkbox", { exact: true, name: vendor }),
    ).not.toBeChecked();
  }
  for (const vendor of expected.absent ?? []) {
    await expect(vendorFilter.getByRole("checkbox", { exact: true, name: vendor })).toHaveCount(0);
  }
  await vendorFilter.locator(".vendor-menu-trigger").click();
}

async function assertFacetCheckboxStates(
  page: Page,
  facetLabel: string,
  expected: { checked?: string[]; unchecked?: string[] },
) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const option of expected.checked ?? []) {
    await expect(facetFilter.getByRole("checkbox", { exact: true, name: option })).toBeChecked();
  }
  for (const option of expected.unchecked ?? []) {
    await expect(
      facetFilter.getByRole("checkbox", { exact: true, name: option }),
    ).not.toBeChecked();
  }
  await facetFilter.locator(".facet-menu-trigger").click();
}

async function assertFacetOptionAvailability(
  page: Page,
  facetLabel: string,
  expected: { present?: string[]; absent?: string[] },
) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const option of expected.present ?? []) {
    await expect(facetFilter.getByRole("checkbox", { exact: true, name: option })).toBeVisible();
  }
  for (const option of expected.absent ?? []) {
    await expect(facetFilter.getByRole("checkbox", { exact: true, name: option })).toHaveCount(0);
  }
  await facetFilter.locator(".facet-menu-trigger").click();
  await expectNoHorizontalOverflow(page);
}

async function expectUsableLayout(page: Page, testInfo: TestInfo) {
  const viewport = expectedViewport(testInfo.project.name);
  expect(page.viewportSize()).toEqual(viewport);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expectFocusedControlToBeVisible(page);
  await expectNoHorizontalOverflow(page);
}

function expectedViewport(projectName: string) {
  if (projectName === "chromium-desktop") {
    return { width: 1440, height: 900 };
  }

  if (projectName === "chromium-tablet") {
    return { width: 1024, height: 768 };
  }

  if (projectName === "chromium-mobile") {
    return { width: 390, height: 844 };
  }

  throw new Error(`No viewport is defined for Playwright project: ${projectName}`);
}

async function expectFocusedControlToBeVisible(page: Page) {
  const hasVisibleFocusIndicator = await page.evaluate(() => {
    const focusedElement = document.activeElement;
    if (!(focusedElement instanceof HTMLElement)) {
      return false;
    }

    let element: HTMLElement | null = focusedElement;
    while (element) {
      const styles = window.getComputedStyle(element);
      if (styles.outlineStyle !== "none" || styles.boxShadow !== "none") {
        return true;
      }
      element = element.parentElement;
    }

    return false;
  });

  expect(hasVisibleFocusIndicator).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  return dimensions;
}

async function readTopbarLayout(page: Page, selector: string) {
  return page.locator(selector).evaluate((topbar) => {
    const brandArea = topbar.querySelector(".topbar-brand-area");
    const brand = topbar.querySelector(".brand-lockup");
    const title = topbar.querySelector(".build-list-title, .public-info-topbar-title");
    const back = topbar.querySelector(".back-link");
    const navLinks = [...topbar.querySelectorAll(".topbar-nav-link, .discord-topbar-link")];

    if (!brandArea || !brand || !title || !back || navLinks.length !== 3) {
      throw new Error("Topbar layout contract is incomplete.");
    }

    const toRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        centerY: rect.top + rect.height / 2,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const areaStyle = getComputedStyle(brandArea);

    return {
      area: {
        ...toRect(brandArea),
        clientWidth: brandArea.clientWidth,
        flexWrap: areaStyle.flexWrap,
        overflowX: areaStyle.overflowX,
        scrollWidth: brandArea.scrollWidth,
      },
      back: toRect(back),
      brand: toRect(brand),
      gap: areaStyle.columnGap,
      nav: navLinks.map(toRect),
      navHeights: navLinks.map((link) => toRect(link).height),
      title: toRect(title),
    };
  });
}

async function readTokenLineCounts(locator: Locator, tokens: string[]) {
  return locator.evaluate((element, expectedTokens) => {
    const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    const text = textNode?.textContent ?? "";

    return Object.fromEntries(
      expectedTokens.map((token) => {
        const start = text.indexOf(token);
        if (!textNode || start < 0) {
          return [token, 0];
        }

        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, start + token.length);
        const lineCount = new Set(
          [...range.getClientRects()].map((rect) => Math.round(rect.top)),
        ).size;

        return [token, lineCount];
      }),
    );
  }, tokens);
}

async function expectFloatingLinkNotToCoverContent(floatingLink: Locator, area: "footer" | "main") {
  const overlappingElements = await floatingLink.evaluate((link, checkedArea) => {
    const linkRect = link.getBoundingClientRect();
    const candidates = document.querySelectorAll<HTMLElement>(
      checkedArea === "footer"
        ? ".site-footer-nav a, .site-footer-copy p"
        : [
            "main .control-button.primary",
            "main .external-action",
            "main .build-list-add-button",
            "main .build-list-detail-action",
            "main .product-name-link",
            "main .price-report-product-copy a",
            "main .row-price strong",
            "main .price-report-value",
          ].join(", "),
    );

    return [...candidates]
      .filter((candidate) => {
        const rects = candidate.matches("h1, h2, h3, h4, p")
          ? (() => {
              const range = document.createRange();
              range.selectNodeContents(candidate);
              return [...range.getClientRects()];
            })()
          : [candidate.getBoundingClientRect()];

        return rects.some((rect) => {
          const isVisible =
            rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
          const overlaps =
            rect.left < linkRect.right &&
            rect.right > linkRect.left &&
            rect.top < linkRect.bottom &&
            rect.bottom > linkRect.top;

          return isVisible && overlaps;
        });
      })
      .map((candidate) => ({
        candidate: candidate.getBoundingClientRect().toJSON(),
        detailActionsPaddingRight: candidate.closest(".detail-actions")
          ? getComputedStyle(candidate.closest(".detail-actions") as Element).paddingRight
          : null,
        link: linkRect.toJSON(),
        path: window.location.pathname,
        text: candidate.textContent?.trim() ?? candidate.tagName,
        viewport: { height: window.innerHeight, width: window.innerWidth },
      }));
  }, area);

  expect(overlappingElements).toEqual([]);
}

async function expectTransitionDurationAtMost(locator: Locator, maximumMs: number) {
  const durationsMs = await locator.evaluate((element) =>
    window
      .getComputedStyle(element)
      .transitionDuration.split(",")
      .map((duration) => duration.trim())
      .map((duration) =>
        duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1_000,
      ),
  );

  expect(Math.max(...durationsMs)).toBeLessThanOrEqual(maximumMs);
}

function buildListProduct(
  id: string,
  name: string,
  category: string,
  amount: number,
  isActive: boolean,
) {
  return {
    id,
    name,
    image: null,
    category: { displayName: category },
    price: { amount, currency: "TWD" },
    source: { url: `https://coolpc.invalid/products/${id}` },
    status: { isActive },
    lastSeenAt: OBSERVED_AT,
  };
}

interface StyleSnapshot {
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontVariantNumeric: string;
  fontWeight: string;
  lineHeight: string;
  minHeight: string;
  textAlign: string;
  whiteSpace: string;
}

interface OptionStyleSnapshot {
  backgroundColor: string;
  border: string;
  borderRadius: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
  lineHeight: string;
  minHeight: string;
  paddingLeft: string;
  textAlign: string;
  whiteSpace: string;
  wordSpacing: string;
}

interface IndicatorStyleSnapshot {
  backgroundColor: string;
  border: string;
  borderRadius: string;
  left: string;
  width: string;
}

interface RowStyleSnapshot {
  backgroundColor: string;
  borderBottomColor: string;
  transitionDuration: string;
  transitionProperty: string;
}

interface VisibleBackground {
  backgroundColor: string;
  sourceClasses: string;
}

async function readStyleSnapshot(locator: Locator): Promise<StyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontVariantNumeric: style.fontVariantNumeric,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      minHeight: style.minHeight,
      textAlign: style.textAlign,
      whiteSpace: style.whiteSpace,
    };
  });
}

async function readOptionStyleSnapshot(locator: Locator): Promise<OptionStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      border: style.border,
      borderRadius: style.borderRadius,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      minHeight: style.minHeight,
      paddingLeft: style.paddingLeft,
      textAlign: style.textAlign,
      whiteSpace: style.whiteSpace,
      wordSpacing: style.wordSpacing,
    };
  });
}

async function readIndicatorStyleSnapshot(locator: Locator): Promise<IndicatorStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return {
      backgroundColor: style.backgroundColor,
      border: style.border,
      borderRadius: style.borderRadius,
      left: style.left,
      width: style.width,
    };
  });
}

async function readRowStyleSnapshot(locator: Locator): Promise<RowStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomColor: style.borderBottomColor,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
}

async function readVisibleBackground(locator: Locator): Promise<VisibleBackground> {
  return locator.evaluate((element) => {
    let current: Element | null = element;

    while (current) {
      const backgroundColor = getComputedStyle(current).backgroundColor;
      const alphaMatch = backgroundColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
      const isVisible = backgroundColor !== "transparent" && Number(alphaMatch?.[1] ?? 1) > 0;

      if (isVisible) {
        return {
          backgroundColor,
          sourceClasses: current.className || current.tagName.toLowerCase(),
        };
      }

      current = current.parentElement;
    }

    return { backgroundColor: "transparent", sourceClasses: "none" };
  });
}

function expectStyleFields<T extends object>(
  actual: T,
  expected: T,
  fields: Array<keyof T>,
) {
  for (const field of fields) {
    expect(actual[field], String(field)).toBe(expected[field]);
  }
}

async function selectPriceReportOption(page: Page, label: string, option: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("listbox", { name: label, exact: true })
    .getByRole("option", {
      name: option,
      exact: true,
    })
    .click();
}

async function getPriceReportControlRects(page: Page) {
  const controls = [
    page.getByRole("button", { name: "時間範圍", exact: true }),
    page.locator(".price-report-type-options"),
    page.getByRole("button", { name: /^商品分類，目前/ }),
    page.getByRole("button", { name: "排序", exact: true }),
    page.getByRole("searchbox", { name: "搜尋價格變動商品" }),
    page.getByRole("button", { name: "查詢", exact: true }),
  ];

  return Promise.all(
    controls.map((control) =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
      }),
    ),
  );
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body),
    status: 200,
  });
}
