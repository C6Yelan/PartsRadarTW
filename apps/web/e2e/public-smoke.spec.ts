// apps/web/e2e/public-smoke.spec.ts
// 以 Playwright 驗證公開網站主要頁面、配單互動與 public API 的基本可用性。

import { type APIRequestContext, expect, type Locator, type Page, test } from "@playwright/test";
import { resolvePublicSiteUrl } from "../app/_shared/public-site";
import { expectImagesLoaded } from "./support/images";

interface ProductListResponse {
  data: Array<{
    id: string;
    image: {
      url: string;
    } | null;
  }>;
}

async function expectPublicFooterLinks(page: Page) {
  const footer = page.getByRole("contentinfo");

  for (const name of [
    "關於本站",
    "隱私權政策",
    "使用條款",
    "聯絡與回報",
  ]) {
    await expect(footer.getByRole("link", { name })).toBeVisible();
  }

  await expect(footer.getByRole("link", { name: "價格變動總覽" })).toHaveCount(0);
  await expect(footer.getByRole("link", { name: "公告", exact: true })).toHaveCount(0);
}

async function expectTopbarLinks(page: Page) {
  const topbar = page.getByRole("banner");

  for (const name of ["價格變動總覽", "公告", "Discord"]) {
    await expect(topbar.getByRole("link", { exact: true, name })).toBeVisible();
  }
}

test.describe("public web smoke", () => {
  test("does not expose the removed internal ops route", { tag: "@desktop-only" }, async ({
    request,
  }) => {
    const [opsResponse, publicStatusResponse] = await Promise.all([
      request.get("/ops/status"),
      request.get("/status"),
    ]);

    expect(opsResponse.status()).toBe(404);
    expect(publicStatusResponse.status()).toBe(404);
  });

  test("loads the homepage and build list on desktop and mobile", {
    tag: "@desktop-mobile-only",
  }, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("PartsRadarTW").first()).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "搜尋商品名稱" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Discord" })).toBeVisible();
    await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();
    await expect(page.getByRole("status", { name: "網站公告" })).toHaveCount(0);
    await expectTopbarLinks(page);

    await expectPublicFooterLinks(page);

    await page.goto("/build-list");
    await expect(page.getByRole("heading", { exact: true, name: "配單" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Discord" })).toBeVisible();
    await expect(page.getByText("配單目前沒有品項")).toBeVisible();
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/discord");
    await expect(page.getByRole("heading", { exact: true, name: "Discord 通知" })).toBeVisible();
    const heroScreenshot = page.getByAltText("Discord 指令選單截圖");
    await expect(heroScreenshot).toBeAttached();
    if ((page.viewportSize()?.width ?? 0) > 520) {
      await expect(heroScreenshot).toBeVisible();
    } else {
      await expect(heroScreenshot).toBeHidden();
    }
    await expect(page.getByRole("heading", { name: "快速開始" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "指令說明" })).toBeVisible();
    const commandsSection = page.getByRole("region", { name: "指令說明" });
    await expect(
      commandsSection.getByRole("heading", { exact: true, name: "目標價提醒" }),
    ).toBeVisible();
    await expect(
      commandsSection.getByRole("heading", {
        exact: true,
        name: "即時價格報告與每日私訊價格報告",
      }),
    ).toBeVisible();
    await expect(
      commandsSection.getByRole("heading", { exact: true, name: "公開價格報告" }),
    ).toBeVisible();
    await expectImagesLoaded(page.locator(".discord-guide-image"));
    await expect(page.getByRole("img", { name: "/watch 目標價提醒面板截圖" })).toBeVisible();
    await expect(page.getByRole("img", { name: "每日私訊價格報告設定截圖" })).toBeVisible();
    await expect(page.getByRole("img", { name: "公開價格報告管理面板截圖" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "常見問題" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "一般成員能用哪些指令？" })).toBeVisible();
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);
  });

  test("loads the public information pages", { tag: "@desktop-only" }, async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { exact: true, name: "關於本站" })).toBeVisible();
    await expect(
      page.locator("main").getByText(/商品名稱、分類、價格與來源連結整理自原價屋公開頁面/),
    ).toBeVisible();
    await expect(page.getByText("partsradartw@gmail.com")).toBeVisible();
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { exact: true, name: "隱私權政策" })).toBeVisible();
    await expect(page.getByText(/配單內容儲存在目前使用的瀏覽器/)).toBeVisible();
    await expect(page.getByText(/SHA-256|PostgreSQL|Cloudflare Tunnel|localStorage/)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "隱私權政策章節" })).toBeVisible();
    await expect(page.locator(".public-legal-page .public-info-section").first()).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/terms");
    await expect(page.getByRole("heading", { exact: true, name: "使用條款" })).toBeVisible();
    await expect(page.getByText(/非官方、非商業/).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "使用條款章節" })).toBeVisible();
    await expectSingleLine(page.getByText(/使用本站即表示你理解/));
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/announcements");
    await expect(page.getByRole("heading", { exact: true, name: "網站公告" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "網站公開測試中" })).toBeVisible();
    await expectSingleLine(page.getByText(/服務提醒、資料狀態與功能更新/));
    const announcementTitle = page.getByRole("heading", { name: "網站公開測試中" });
    const announcementSummary = page.getByText(/商品與價格資訊可能因來源更新時間而有延遲/);
    const [titleSize, summarySize] = await Promise.all([
      announcementTitle.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      announcementSummary.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ]);
    expect(titleSize).toBeGreaterThan(summarySize);
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/price-report");
    await expect(page.getByRole("heading", { exact: true, name: "價格變動總覽" })).toBeVisible();
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/public-missing-route");
    await expect(page.getByRole("heading", { exact: true, name: "找不到這個頁面" })).toBeVisible();
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);
  });

  test("publishes canonical links and crawler discovery routes", { tag: "@desktop-only" }, async ({
    page,
    request,
  }) => {
    const publicOrigin = resolvePublicSiteUrl();
    const publicRoutes = [
      "/",
      "/price-report",
      "/about",
      "/privacy",
      "/terms",
      "/announcements",
      "/discord",
    ];

    for (const path of publicRoutes) {
      await page.goto(path);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      const canonicalUrl = new URL((await canonical.getAttribute("href")) ?? "");
      expect(canonicalUrl.origin).toBe(publicOrigin);
      expect(canonicalUrl.pathname).toBe(path);
    }

    await page.goto("/build-list");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const robotsResponse = await request.get("/robots.txt");
    expect(robotsResponse.status()).toBe(200);
    expect(robotsResponse.headers()["content-type"]).toContain("text/plain");
    const robotsText = await robotsResponse.text();
    expect(robotsText.toLowerCase()).toContain("user-agent: *");
    expect(robotsText).toContain("Disallow: /api/");
    expect(robotsText).toContain(`Sitemap: ${publicOrigin}/sitemap.xml`);

    const sitemapResponse = await request.get("/sitemap.xml");
    expect(sitemapResponse.status()).toBe(200);
    expect(sitemapResponse.headers()["content-type"]).toContain("xml");
    const sitemapXml = await sitemapResponse.text();

    for (const path of publicRoutes) {
      expect(sitemapXml).toContain(`<loc>${new URL(path, `${publicOrigin}/`).toString()}</loc>`);
    }

    expect(sitemapXml).not.toContain("/api/");
    expect(sitemapXml).not.toContain("/build-list");
  });

  test("removes the unsupported legacy category query", { tag: "@desktop-only" }, async ({
    page,
  }) => {
    await page.goto("/?igrp=12");

    await expect.poll(() => new URL(page.url()).searchParams.has("igrp")).toBe(false);
    expect(new URL(page.url()).searchParams.has("category")).toBe(false);
  });

  test("refreshes v3 build-list intents while preserving export choice, quantity, and undo", {
    tag: "@desktop-mobile-only",
  }, async ({ page }) => {
    const productId = "11111111-1111-1111-1111-111111111111";
    const missingProductId = "22222222-2222-2222-2222-222222222222";

    await page.route("**/api/build-list/refresh", async (route) => {
      const productIds = route.request().postDataJSON() as string[];

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: productIds.includes(productId)
            ? [
                {
                  id: productId,
                  name: "最新測試顯示卡 RTX",
                  image: null,
                  category: {
                    displayName: "顯示卡",
                  },
                  price: {
                    amount: 7290,
                    currency: "TWD",
                  },
                  source: {
                    url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
                  },
                  status: {
                    isActive: true,
                  },
                  lastSeenAt: "2026-05-28T11:55:00.000Z",
                },
              ]
            : [],
          missingProductIds: productIds.filter((id) => id === missingProductId),
        }),
      });
    });

    await page.addInitScript(
      ({ id, missingId }) => {
        window.localStorage.setItem(
          "partsradartw:build-list:v3",
          JSON.stringify([
            {
              productId: id,
              quantity: 2,
              includeInExport: true,
              order: 0,
              addedAt: "2026-05-28T12:00:00.000Z",
              updatedAt: "2026-05-28T12:00:00.000Z",
            },
            {
              productId: missingId,
              quantity: 1,
              includeInExport: true,
              order: 1,
              addedAt: "2026-05-28T12:01:00.000Z",
              updatedAt: "2026-05-28T12:01:00.000Z",
            },
          ]),
        );
      },
      { id: productId, missingId: missingProductId },
    );

    await page.goto("/build-list");
    const item = page.getByRole("article").filter({ hasText: "最新測試顯示卡 RTX" });
    const missingItem = page.getByRole("article").filter({ hasText: missingProductId });

    await expect(page.getByText("3 件商品")).toBeVisible();
    await expect(page.getByText("已同步；有 1 個品項暫時查不到。")).toBeVisible();
    await expect(page.getByText("配單只儲存在這個瀏覽器，不會跨裝置同步。")).toBeVisible();
    await expect(item.getByRole("heading", { name: "最新測試顯示卡 RTX" })).toBeVisible();
    const exportCheckbox = item.getByRole("checkbox", { name: /加入下載配單/ });
    const [checkboxBox, imageBox] = await Promise.all([
      exportCheckbox.boundingBox(),
      item.locator(".build-list-item-image-link").boundingBox(),
    ]);
    expect(checkboxBox?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(
      imageBox?.x ?? Number.NEGATIVE_INFINITY,
    );
    await expect(item.getByRole("spinbutton", { name: "數量" })).toHaveValue("2");
    await expect(item.getByText("NT$ 14,580")).toBeVisible();
    await expect(missingItem.getByText("暫時無法確認")).toBeVisible();
    await expect(page.getByText("未計價品項")).toBeVisible();
    const summaryPanel = page.getByLabel("配單總計");
    const refreshStatus = page.getByLabel("配單同步狀態");
    const [downloadBox, refreshBox] = await Promise.all([
      summaryPanel.getByRole("button", { name: "下載 Excel" }).boundingBox(),
      refreshStatus.boundingBox(),
    ]);
    expect(refreshBox?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(
      downloadBox?.y ?? Number.POSITIVE_INFINITY,
    );
    await expect(summaryPanel.getByLabel("配單同步狀態")).toHaveCount(0);
    await expect(page.getByText("下載配單包含 2 個品項。")).toBeVisible();

    await missingItem.getByRole("checkbox", { name: "加入下載配單" }).uncheck();
    await expect(page.getByText("下載配單包含 1 個品項。")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(window.localStorage.getItem("partsradartw:build-list:v3") ?? "[]").find(
            (intent: { productId: string }) => intent.productId === "22222222-2222-2222-2222-222222222222",
          )?.includeInExport,
        ),
      )
      .toBe(false);

    await item.getByRole("button", { name: "增加數量" }).click();
    await expect(page.getByText("4 件商品")).toBeVisible();
    await expect(item.getByRole("spinbutton", { name: "數量" })).toHaveValue("3");
    await expect(item.getByText("NT$ 21,870")).toBeVisible();

    await item.getByRole("button", { name: "移除" }).click();
    await expect(page.getByText("已從配單移除")).toBeVisible();
    await page.getByRole("button", { name: "復原" }).click();
    await expect(page.getByRole("article").filter({ hasText: "最新測試顯示卡 RTX" })).toBeVisible();
  });
});

async function expectSingleLine(locator: Locator) {
  const metrics = await locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(styles.lineHeight),
    };
  });

  expect(metrics.height).toBeLessThan(metrics.lineHeight * 1.5);
}

test.describe("public API smoke", () => {
  test("checks public data and rate-limit headers", { tag: "@desktop-only" }, async ({
    request,
  }) => {
    const sourceStatus = await request.get("/api/source-status");
    expect(sourceStatus.status()).toBe(200);
    await expectJsonShape(sourceStatus, ["status"]);

    const categories = await request.get("/api/categories");
    expect(categories.status()).toBe(200);
    await expectJsonShape(categories, ["data"]);

    const products = await request.get("/api/products?pageSize=1");
    expect(products.status()).toBe(200);
    expect(products.headers()["x-ratelimit-limit"]).toBeTruthy();
    expect(products.headers()["x-ratelimit-remaining"]).toBeTruthy();
    expect(products.headers()["x-ratelimit-reset"]).toBeTruthy();
    await expectJsonShape(products, ["data", "pagination"]);

    const priceReport = await request.get("/api/price-report?pageSize=1");
    expect(priceReport.status()).toBe(200);
    expect(priceReport.headers()["x-ratelimit-limit"]).toBeTruthy();
    expect(priceReport.headers()["x-ratelimit-remaining"]).toBeTruthy();
    expect(priceReport.headers()["x-ratelimit-reset"]).toBeTruthy();
    await expectJsonShape(priceReport, ["data", "summary", "pagination", "meta"]);
  });

  test("checks product detail, price history, and image API when a product exists", {
    tag: "@desktop-only",
  }, async ({ request }) => {
    const product = await fetchFirstProduct(request);
    if (!product) {
      test.skip(true, "No product exists in this environment.");
      return;
    }

    const detail = await request.get(`/api/products/${product.id}`);
    expect(detail.status()).toBe(200);
    await expectJsonShape(detail, ["id", "name", "price"]);

    const priceHistory = await request.get(`/api/products/${product.id}/price-history?range=90d`);
    expect(priceHistory.status()).toBe(200);
    await expectJsonShape(priceHistory, ["range", "rangeDays", "points"]);

    if (!product.image?.url) {
      test.skip(true, "The first product has no cached image.");
      return;
    }

    const image = await request.get(product.image.url);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/");
  });
});

async function fetchFirstProduct(request: APIRequestContext) {
  const response = await request.get("/api/products?pageSize=1");

  if (!response.ok()) {
    return null;
  }

  const body = (await response.json()) as ProductListResponse;

  return body.data[0] ?? null;
}

async function expectJsonShape(response: { json(): Promise<unknown> }, keys: string[]) {
  const body = await response.json();

  expect(body).toEqual(
    expect.objectContaining(Object.fromEntries(keys.map((key) => [key, expect.anything()]))),
  );
}
