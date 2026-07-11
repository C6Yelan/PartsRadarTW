// apps/web/e2e/visual-layout.spec.ts
// 以本地 mock API 驗證指定 viewport 的主要頁面、focus、空狀態與水平 overflow。

import { expect, type Locator, type Page, type Route, type TestInfo, test } from "@playwright/test";
import { expectImagesLoaded } from "./support/images";

const visualBaseUrl = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100");
const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(visualBaseUrl.hostname);

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const READY_ROUTE_SLUG = "visual-ready-product";
const ERROR_ROUTE_SLUG = "visual-error-product";
const OBSERVED_AT = "2026-07-10T08:00:00.000Z";

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

    if (requestUrl.pathname === `/api/products/${READY_ROUTE_SLUG}/price-history`) {
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

    await route.fulfill({ status: 404, body: "" });
  });
});

test("captures the main pages without horizontal overflow", async ({ page }, testInfo) => {
  await page.goto("/?category=gpu&page=10");
  await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "頁碼" })).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) <= 760) {
    await page.locator(".filter-panel summary").click();
    await expect(page.locator(".filter-panel details")).toHaveAttribute("open", "");
  }

  await page.getByRole("checkbox", { name: "NVIDIA" }).check();
  await page.getByRole("checkbox", { name: "16 GB" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["gpu_chip:nvidia", "vram_gb:16"]);
  await expect(
    page.getByRole("button", {
      name: "移除篩選：GPU 晶片：NVIDIA",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "移除篩選：顯示記憶體：16 GB",
    }),
  ).toBeVisible();

  await page.getByRole("searchbox", { name: "搜尋商品名稱" }).focus();
  await captureLayout(page, testInfo, "home");

  await page.goto(`/products/${READY_ROUTE_SLUG}`);
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "價格走勢" })).toBeVisible();
  const chartPoints = page.locator(".history-chart-point-button");
  await chartPoints.first().focus();
  const historyTooltip = page.locator(".history-tooltip");
  await expect(historyTooltip).toHaveClass(/is-below/);
  await captureLayout(page, testInfo, "detail");
  await chartPoints.last().focus();
  await expect(historyTooltip).not.toHaveClass(/is-below/);
  await expectNoHorizontalOverflow(page);

  await page.evaluate(
    ({ productId, observedAt }) => {
      window.localStorage.setItem(
        "partsradartw:build-list:v2",
        JSON.stringify([
          {
            productId,
            quantity: 2,
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
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  await page.getByRole("link", { name: "原價屋查看／購買，開新分頁" }).focus();
  await captureLayout(page, testInfo, "build-list");

  await page.goto("/discord");
  await expect(page.getByRole("heading", { name: "快速開始" })).toBeVisible();
  await expectImagesLoaded(page.locator(".discord-guide-image"));
  await page.getByRole("link", { name: "快速開始" }).focus();
  await captureLayout(page, testInfo, "discord");
});

test("keeps error and empty states usable", async ({ page }) => {
  await page.goto("/?category=gpu&q=error");
  await expect(page.getByRole("alert").filter({ hasText: "商品資料暫時無法載入" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/products/${ERROR_ROUTE_SLUG}`);
  await expect(page.getByRole("alert").filter({ hasText: "商品資料暫時無法載入" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.evaluate(() => window.localStorage.removeItem("partsradartw:build-list:v2"));
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

async function captureLayout(page: Page, testInfo: TestInfo, name: string) {
  const viewport = expectedViewport(testInfo.project.name);
  expect(page.viewportSize()).toEqual(viewport);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expectFocusedControlToBeVisible(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`${viewport.width}x${viewport.height}-${name}.png`),
  });
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
