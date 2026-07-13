// apps/web/e2e/visual-layout.spec.ts
// 以本地 mock API 驗證指定 viewport 的主要頁面、focus、空狀態與水平 overflow。

import { expect, type Locator, type Page, type Route, type TestInfo, test } from "@playwright/test";

const visualBaseUrl = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100");
const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(visualBaseUrl.hostname);

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const READY_ROUTE_SLUG = "visual-ready-product";
const ERROR_ROUTE_SLUG = "visual-error-product";
const OBSERVED_AT = "2026-07-10T08:00:00.000Z";
let releasePriceReportLoading: (() => void) | null = null;

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
            facets: [
              {
                key: "socket",
                label: "腳位",
                options: [
                  { value: "lga1700", label: "LGA 1700" },
                  { value: "am5", label: "AM5" },
                ],
              },
              {
                key: "chipset",
                label: "晶片組",
                options: [
                  { value: "b650", label: "B650" },
                  { value: "b760", label: "B760" },
                ],
              },
            ],
          },
          {
            id: "99999999-9999-4999-8999-999999999999",
            slug: "memory",
            displayName: "記憶體",
            sourceName: "記憶體 RAM",
            facets: [
              {
                key: "module_type",
                label: "使用類型",
                options: [
                  { value: "desktop", label: "桌上型" },
                  { value: "laptop", label: "筆記型" },
                ],
              },
              {
                key: "memory_type",
                label: "記憶體規格",
                options: [
                  { value: "ddr4", label: "DDR4" },
                  { value: "ddr5", label: "DDR5" },
                ],
              },
            ],
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            slug: "storage",
            displayName: "SSD",
            sourceName: "固態 SSD",
            facets: [
              {
                key: "pcie_generation",
                label: "PCIe 世代",
                options: [{ value: "gen4", label: "PCIe 4.0" }],
              },
            ],
          },
          {
            id: "66666666-6666-4666-8666-666666666666",
            slug: "hard-drive",
            displayName: "HDD",
            sourceName: "內接硬碟 HDD",
            facets: [
              {
                key: "storage_usage",
                label: "硬碟用途",
                options: [{ value: "nas", label: "NAS" }],
              },
            ],
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            slug: "external-storage",
            displayName: "外接儲存",
            sourceName: "USB週邊 / 硬碟座 / 讀卡機",
            facets: [
              {
                key: "external_type",
                label: "商品類型",
                options: [{ value: "usb-flash", label: "隨身碟" }],
              },
            ],
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
        ],
        motherboard: [
          { slug: "asus", name: "ASUS" },
          { slug: "msi", name: "MSI" },
        ],
        gpu: [
          { slug: "gigabyte", name: "GIGABYTE" },
          { slug: "sapphire", name: "SAPPHIRE" },
        ],
      };
      const category = requestUrl.searchParams.get("category") ?? "";
      await fulfillJson(route, {
        data: [
          {
            ...product,
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

      await fulfillJson(route, {
        data: isEmpty
          ? []
          : [
              {
                productId: PRODUCT_ID,
                productName: "視覺驗證超長商品名稱 NVIDIA GeForce RTX 顯示卡 OC Edition",
                image: {
                  url: "/favicon.svg",
                  alt: "視覺驗證超長商品名稱 NVIDIA GeForce RTX 顯示卡 OC Edition",
                },
                category: { igrp: 16, slug: "fan-accessory", displayName: "風扇 / 配件" },
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
            ],
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
  await page.getByRole("combobox", { name: "時間範圍" }).focus();
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
  await page.getByRole("combobox", { name: "時間範圍" }).focus();
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
  await vendorFilter.locator(".vendor-menu-trigger").click();
  await expect(vendorFilter.getByRole("checkbox", { name: vendorName })).not.toBeChecked();
  await vendorFilter.locator(".vendor-option").filter({ hasText: vendorName }).click();
}

async function selectFacetOptions(page: Page, facetLabel: string, optionLabels: string[]) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const optionLabel of optionLabels) {
    await facetFilter.getByRole("checkbox", { name: optionLabel }).check();
  }
}

async function assertFacetOptionsUnchecked(page: Page, facetLabel: string, optionLabels: string[]) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const optionLabel of optionLabels) {
    await expect(facetFilter.getByRole("checkbox", { name: optionLabel })).not.toBeChecked();
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
    await expect(vendorFilter.getByRole("checkbox", { name: vendor })).toBeChecked();
  }
  for (const vendor of expected.unchecked ?? []) {
    await expect(vendorFilter.getByRole("checkbox", { name: vendor })).not.toBeChecked();
  }
  for (const vendor of expected.absent ?? []) {
    await expect(vendorFilter.getByRole("checkbox", { name: vendor })).toHaveCount(0);
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
    await expect(facetFilter.getByRole("checkbox", { name: option })).toBeChecked();
  }
  for (const option of expected.unchecked ?? []) {
    await expect(facetFilter.getByRole("checkbox", { name: option })).not.toBeChecked();
  }
  await facetFilter.locator(".facet-menu-trigger").click();
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

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body),
    status: 200,
  });
}
