// apps/web/e2e/visual-cross-page.spec.ts
// 以本地 mock API 驗證跨頁 error/empty states 與 reduced-motion contracts。

import { expect, type Locator, test } from "@playwright/test";
import { expectNoHorizontalOverflow, expectUsableLayout } from "./support/visual-assertions";
import {
  buildDefaultBuildListRefreshResponse,
  buildJsonResponse,
  buildPriceHistoryResponse,
  buildPriceReportResponse,
  buildProductListResponse,
  buildSourceStatusResponse,
  buildVisualCategories,
  buildVisualProduct,
  isVisualLoopback,
  PRODUCT_ID,
  READY_ROUTE_SLUG,
} from "./support/visual-fixtures";

const ERROR_ROUTE_SLUG = "visual-error-product";
const product = buildVisualProduct();
let releasePriceReportLoading: (() => void) | null = null;

test.beforeEach(async ({ page }) => {
  test.skip(!isVisualLoopback, "Visual layout tests only run against a loopback web server.");
  releasePriceReportLoading = null;

  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 404, body: "" });
  });
  await page.route(/\/api\/categories(?:\?.*)?$/, async (route) => {
    await route.fulfill(buildJsonResponse(buildVisualCategories()));
  });
  await page.route(/\/api\/source-status(?:\?.*)?$/, async (route) => {
    const fixture = new URL(page.url()).searchParams.get("fixture");
    if (fixture === "error") {
      await route.fulfill({ status: 503, body: "" });
      return;
    }
    await route.fulfill(buildJsonResponse(buildSourceStatusResponse(fixture)));
  });
  await page.route(/\/api\/products(?:\?.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get("q") === "error") {
      await route.fulfill({ status: 503, body: "" });
      return;
    }
    await route.fulfill(buildJsonResponse(buildProductListResponse(requestUrl)));
  });
  await page.route(new RegExp(`/api/products/${ERROR_ROUTE_SLUG}(?:\\?.*)?$`), async (route) => {
    await route.fulfill({ status: 503, body: "" });
  });
  await page.route(new RegExp(`/api/products/${READY_ROUTE_SLUG}(?:\\?.*)?$`), async (route) => {
    await route.fulfill(buildJsonResponse(product));
  });
  await page.route(
    new RegExp(`/api/products/${PRODUCT_ID}/price-history(?:\\?.*)?$`),
    async (route) => {
      await route.fulfill(buildJsonResponse(buildPriceHistoryResponse()));
    },
  );
  await page.route(/\/api\/build-list\/refresh(?:\?.*)?$/, async (route) => {
    await route.fulfill(buildJsonResponse(buildDefaultBuildListRefreshResponse()));
  });
  await page.route(/\/api\/price-report(?:\?.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url());
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
    await route.fulfill(buildJsonResponse(buildPriceReportResponse(requestUrl)));
  });
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
