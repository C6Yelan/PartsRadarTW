// apps/web/e2e/visual-navigation-and-discord.spec.ts
// 以本地 mock API 驗證 shared navigation 與 Discord information architecture。

import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./support/visual-assertions";
import {
  buildDefaultBuildListRefreshResponse,
  buildJsonResponse,
  buildProductListResponse,
  buildSourceStatusResponse,
  buildVisualCategories,
  isVisualLoopback,
} from "./support/visual-fixtures";

test.beforeEach(async ({ page }) => {
  test.skip(!isVisualLoopback, "Visual layout tests only run against a loopback web server.");

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
    await route.fulfill(
      buildJsonResponse(buildProductListResponse(new URL(route.request().url()))),
    );
  });
  await page.route(/\/api\/build-list\/refresh(?:\?.*)?$/, async (route) => {
    await route.fulfill(buildJsonResponse(buildDefaultBuildListRefreshResponse()));
  });
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

test("keeps Discord guidance concise and readable @desktop-only", async ({ page }) => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 800 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/discord");

    await expect(page.locator(".discord-actions .control-button")).toHaveCount(1);
    await expect(
      page.locator("#discord-user-guide .discord-command-summary-list > li"),
    ).toHaveCount(4);
    await expect(
      page.locator("#discord-admin-guide .discord-command-summary-list > li"),
    ).toHaveCount(1);
    await expect(page.getByLabel("公開報告必要權限")).toBeVisible();
    await expect(page.getByText("/watch", { exact: true })).toBeVisible();
    await expect(page.getByText("/public-report settings", { exact: true })).toBeVisible();
    await expect(page.getByText("/status", { exact: true })).toHaveCount(0);
    await expect(page.locator("#discord-user-guide img")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/discord");
  const faqDetails = page.locator(".discord-faq-item");
  await expect(page.locator(".discord-faq-item[open]")).toHaveCount(0);
  await faqDetails.first().locator("summary").press("Enter");
  await expect(faqDetails.first()).toHaveAttribute("open", "");
});
