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
                options: [{ value: "am5", label: "AM5" }],
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
          vendors: [{ slug: "visual-vendor", name: "Visual Vendor" }],
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

test("keeps the main pages usable without horizontal overflow", async ({ page }, testInfo) => {
  test.setTimeout(60_000);

  await page.goto("/?category=gpu&page=10");
  await expect(page.getByRole("status", { name: "網站公告" })).toHaveCount(0);
  await expect(
    page.locator(".topbar").getByRole("link", { name: "價格變動總覽" }),
  ).toBeVisible();
  await expect(page.locator(".topbar").getByRole("link", { name: "公告" })).toBeVisible();
  await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "頁碼" })).toBeVisible();

  const gpuChipFilter = page.locator(".facet-filter").filter({ hasText: "GPU 晶片" });
  const vramFilter = page.locator(".facet-filter").filter({ hasText: "顯示記憶體" });
  const isMobile = (page.viewportSize()?.width ?? 0) <= 760;
  await expect(page.getByRole("button", { name: /^篩選/ })).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 0) > 760) {
    const statusFilterWidth = await page.locator(".toolbar-status-filter").evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(statusFilterWidth).toBeGreaterThan(320);
  }
  await gpuChipFilter.getByRole("button", { name: "全部" }).click();
  await page.getByRole("checkbox", { name: "NVIDIA" }).check();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([
    "gpu_chip:nvidia",
  ]);
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

  await page.getByRole("searchbox", { name: "搜尋商品名稱" }).focus();
  await expectUsableLayout(page, testInfo);

  if (isMobile) {
    await page.goto("/?category=cpu");
  } else {
    await vramFilter.getByRole("button", { name: "16 GB" }).click();
    await page.getByRole("button", { name: "移除篩選：GPU 晶片：NVIDIA" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([
      "vram_gb:16",
    ]);
    await gpuChipFilter.getByRole("button", { name: "全部" }).click();
    await expect(page.getByRole("checkbox", { name: "NVIDIA" })).not.toBeChecked();
    await gpuChipFilter.getByRole("button", { name: "全部" }).click();
    await page.getByRole("button", { name: "重設所有篩選" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
    await vramFilter.getByRole("button", { name: "全部" }).click();
    await expect(page.getByRole("checkbox", { name: "16 GB" })).not.toBeChecked();
    await vramFilter.getByRole("button", { name: "全部" }).click();
    await page.getByRole("radiogroup", { name: "分類" }).getByText("CPU", { exact: true }).click();
  }
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("cpu");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
  await expect(page.getByRole("group", { name: "已選進階篩選" })).toHaveCount(0);

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
  await expect(
    page.locator(".topbar").getByRole("link", { name: "價格變動總覽" }),
  ).toBeVisible();
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

    const styles = window.getComputedStyle(focusedElement);
    return styles.outlineStyle !== "none" || styles.boxShadow !== "none";
  });

  expect(hasVisibleFocusIndicator).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
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
