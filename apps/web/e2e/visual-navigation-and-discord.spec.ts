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
    await expect(
      page.locator("#discord-user-guide .discord-command-summary-list > li"),
    ).toHaveCount(4);
    await expect(
      page.locator("#discord-admin-guide .discord-command-summary-list > li"),
    ).toHaveCount(2);
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
      await expect(
        commandSummary.getByText("/public-report settings", { exact: true }),
      ).toBeVisible();
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
