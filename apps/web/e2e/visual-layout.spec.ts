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
              deltaAmount: -1_000,
              deltaPercent: -5,
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
          productName: "視覺驗證超長商品名稱 NVIDIA GeForce RTX 顯示卡 OC Edition",
          image: {
            url: "/favicon.svg",
            alt: "視覺驗證超長商品名稱 NVIDIA GeForce RTX 顯示卡 OC Edition",
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
          productName: "視覺驗證漲價商品",
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
  await expect(groups).toHaveCount(6);
  await expect(chipsetFilter.getByRole("group")).toHaveCount(6);
  await expect(groups).toHaveText([
    "H610B760Z790",
    "H810B860Z890",
    "H81H110H310H510W680W790W880W890",
    "A520B550",
    "A620B650B650EB840B850X670X670EX870X870E",
    "TRX50WRX90",
  ]);
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
    await expectNoHorizontalOverflow(page);
  }

  await chipsetFilter.getByRole("checkbox", { name: "H610" }).check();
  await chipsetFilter.getByRole("checkbox", { name: "W680" }).check();
  await chipsetFilter.getByRole("checkbox", { name: "WRX90" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:h610", "chipset:w680", "chipset:wrx90"]);
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
    { width: 1280, height: 800 },
    { width: 1024, height: 800 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/discord");

    await expect(page.locator(".discord-actions .control-button")).toHaveCount(2);
    await expect(page.getByRole("navigation", { name: "Discord 教學頁內導覽" })).toBeVisible();
    await expect(page.locator("#quick-start .discord-step-list > li")).toHaveCount(3);
    await expect(page.locator("#discord-user-guide .discord-command-summary-list > li")).toHaveCount(
      3,
    );
    await expect(page.locator("#discord-admin-guide .discord-command-summary-list > li")).toHaveCount(
      3,
    );
    await expect(page.getByLabel("公開報告必要權限")).toBeVisible();

    const audienceCards = page.locator(".discord-audience-card");
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

    const heroImage = page.getByAltText("Discord 指令選單截圖");
    if (viewport.width > 520) {
      await expect(heroImage).toBeVisible();
      expect((await heroImage.boundingBox())?.width).toBeLessThanOrEqual(380);
    } else {
      await expect(heroImage).toBeHidden();
    }

    for (const image of await page.locator(".discord-guide-image").all()) {
      expect((await image.getAttribute("alt"))?.trim().length).toBeGreaterThan(0);
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

  await page
    .getByRole("navigation", { name: "Discord 教學頁內導覽" })
    .getByRole("link", { name: "一般使用者" })
    .click();
  await expect(page.locator("#discord-user-guide")).toBeInViewport();
});

test("uses compact custom price-report filters, aligned table typography, and conditional reset @desktop-only", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const viewports = [
    { width: 1760, height: 900 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
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
    } else {
      await expect(tableHeader).toBeHidden();
      await expect(page.locator(".price-report-cell-label").first()).toBeVisible();
    }
    await expect(page.getByRole("status").filter({ hasText: "資料最後成功更新" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1760, height: 900 });
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
  await categoryPopover.getByRole("checkbox", { name: "CPU" }).check();
  await expect(categoryPopover).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("category")).toEqual(["cpu"]);
  await expect(categoryTrigger).toHaveAccessibleName("商品分類，目前CPU");
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
  await categoryPopover.getByRole("checkbox", { name: "CPU" }).press("Tab");
  await expect(categoryPopover).toHaveCount(0);

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
  }
  await expectNoHorizontalOverflow(page);
  await mobileCategoryPopover.getByRole("checkbox", { name: "風扇 / 配件" }).check();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("fan-accessory");

  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/");
  const homeProductFontSize = await page
    .locator(".product-main a")
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize);
  const homeProductFontWeight = await page
    .locator(".product-main a")
    .first()
    .evaluate((element) => getComputedStyle(element).fontWeight);
  const homeValueFontSize = await page
    .locator(".table-cell")
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize);
  const homeValueFontWeight = await page
    .locator(".table-cell")
    .first()
    .evaluate((element) => getComputedStyle(element).fontWeight);
  const homeHeaderFontSize = await page
    .locator(".table-header")
    .evaluate((element) => getComputedStyle(element).fontSize);
  const homeHeaderFontWeight = await page
    .locator(".table-header")
    .evaluate((element) => getComputedStyle(element).fontWeight);
  await page.goto("/price-report");
  await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
    "font-size",
    homeProductFontSize,
  );
  await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
    "font-weight",
    homeProductFontWeight,
  );
  await expect(page.locator(".price-report-value").first()).toHaveCSS(
    "font-size",
    homeValueFontSize,
  );
  await expect(page.locator(".price-report-value").first()).toHaveCSS(
    "font-weight",
    homeValueFontWeight,
  );
  await expect(page.locator(".price-report-table-header")).toHaveCSS(
    "font-size",
    homeHeaderFontSize,
  );
  await expect(page.locator(".price-report-table-header")).toHaveCSS(
    "font-weight",
    homeHeaderFontWeight,
  );
  for (const value of await page.locator(".price-report-value").all()) {
    await expect(value).toHaveCSS("text-align", "center");
  }
  await expect(page.locator(".price-report-product").first()).toHaveCSS("text-align", "center");
  await expect(page.locator(".price-report-product").first()).toHaveCSS(
    "justify-content",
    "center",
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
      name: "視覺驗證超長商品名稱 NVIDIA GeForce RTX 顯示卡 OC Edition",
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
  await page.getByRole("link", { name: "快速開始" }).focus();
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
        await expect(floatingLink).toHaveAttribute("href", "/build-list");
        await expect(floatingLink).toHaveAttribute("title", "開啟配單");
        await expectFloatingLinkNotToCoverContent(floatingLink, "main");

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expectFloatingLinkNotToCoverContent(floatingLink, "footer");
      }

      await expectNoHorizontalOverflow(page);
    }
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
