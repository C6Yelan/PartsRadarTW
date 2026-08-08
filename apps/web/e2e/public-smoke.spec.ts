// apps/web/e2e/public-smoke.spec.ts
// 以 Playwright 驗證公開網站主要頁面、配單互動與 public API 的基本可用性。

import { type APIRequestContext, expect, type Locator, type Page, test } from "@playwright/test";
import { resolvePublicSiteUrl } from "../app/_shared/public-site";
import {
  buildJsonResponse,
  buildProductListResponse,
  buildVisualCategories,
} from "./support/visual-fixtures";

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
  const expectedLinks = ["關於與聯絡", "隱私權", "使用條款", "GitHub（在新分頁開啟）"];

  for (const name of expectedLinks) {
    await expect(footer.getByRole("link", { name })).toBeVisible();
  }

  await expect(footer.getByRole("navigation", { name: "網站資訊" }).getByRole("link")).toHaveCount(
    expectedLinks.length,
  );
  expect(
    await footer.getByRole("navigation", { name: "網站資訊" }).getByRole("link").allTextContents(),
  ).toEqual(["關於與聯絡", "隱私權", "使用條款", "GitHub"]);

  const githubLink = footer.getByRole("link", { name: "GitHub（在新分頁開啟）" });
  await expect(githubLink).toHaveAttribute("href", "https://github.com/C6Yelan/PartsRadarTW");
  await expect(githubLink).toHaveAttribute("target", "_blank");
  await expect(githubLink).toHaveAttribute("rel", "noreferrer");

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
  test("publishes a crawler-readable homepage without false client data", {
    tag: "@desktop-only",
  }, async ({ request }) => {
    const response = await request.get("/");
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).not.toContain("home-topic");
    expect(html).not.toContain("0 筆商品");
    expect(html).not.toMatch(/資料最近更新：(?:<!-- -->)?尚無資料/);
    expect(html).toMatch(/資料最近更新：(?:<!-- -->)?載入中/);
    expect(html).toContain("電腦零件價格查詢與追蹤");
    expect(html).toContain("原價屋公開商品資料");
    expect(html).toContain("近期價格變動");
    expect(html).toContain("歷史價格");
    expect(html).toContain('id="website-structured-data"');
    expect(html).toContain('"@type":"WebSite"');
  });

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
    await page.route(/\/api\/categories(?:\?.*)?$/, async (route) => {
      await route.fulfill(buildJsonResponse(buildVisualCategories()));
    });
    await page.route(/\/api\/products(?:\?.*)?$/, async (route) => {
      await route.fulfill(
        buildJsonResponse(buildProductListResponse(new URL(route.request().url()))),
      );
    });
    await page.goto("/");
    await expect(page.getByText("PartsRadarTW").first()).toBeVisible();
    await expect(page).toHaveTitle("台灣電腦零件價格查詢與追蹤 | PartsRadarTW");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "查詢原價屋 CPU、主機板、顯示卡、SSD 等電腦零件價格，支援規格篩選、近期價格變動、歷史價格與 Discord 目標價提醒。",
    );
    await expect(page.locator(".home-topic")).toHaveCount(0);
    await expect(page.locator("main.dashboard-shell > .workspace-grid")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "搜尋結果" })).toBeVisible();
    await expect(page.getByText("400 筆商品", { exact: true })).toBeVisible();
    await expect(page.getByText("資料最近更新：2026-07-10 16:00", { exact: true })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "搜尋商品名稱" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Discord" })).toBeVisible();
    await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();
    await expect(page.getByRole("status", { name: "網站公告" })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
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
    const inviteUrl = process.env.DISCORD_BOT_INVITE_URL?.trim();
    if (inviteUrl) {
      await expect(
        page.getByRole("link", { name: "邀請 PartsRadarTW Discord bot，開新分頁" }),
      ).toHaveAttribute("href", inviteUrl);
      await expect(
        page.getByRole("link", { name: "邀請 PartsRadarTW Discord bot，開新分頁" }),
      ).toHaveAttribute("target", "_blank");
      await expect(
        page.getByRole("link", { name: "邀請 PartsRadarTW Discord bot，開新分頁" }),
      ).toHaveAttribute("rel", "noreferrer");
    } else {
      await expect(page.getByText("邀請連結準備中", { exact: true })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        page.getByRole("link", { name: "邀請 PartsRadarTW Discord bot，開新分頁" }),
      ).toHaveCount(0);
    }
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);
  });

  test("loads the public information pages", { tag: "@desktop-only" }, async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { exact: true, name: "關於與聯絡" })).toBeVisible();
    await expect(
      page.locator("main").getByText(/商品名稱、分類、價格與來源連結整理自原價屋公開頁面/),
    ).toBeVisible();
    await expect(page.getByText("contact@partsradar.net")).toBeVisible();
    await expect(page.getByText(/若想回報網站問題、內容錯誤或提供建議/)).toBeVisible();
    await expect(page.getByText(/請勿透過原價屋客服回報本站問題/)).toBeVisible();
    await expect(page.getByText(/敏感個人資訊/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "GitHub repository（在新分頁開啟）" }),
    ).toHaveAttribute("href", "https://github.com/C6Yelan/PartsRadarTW");
    await expect(page.locator("main h1")).toHaveCount(0);
    await expect(page.locator("main h2")).toHaveCount(4);
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { exact: true, name: "隱私權政策" })).toBeVisible();
    await expect(page.getByText(/配單中的商品 ID、數量、順序與更新時間/)).toBeVisible();
    await expect(page.getByText(/使用者、伺服器及頻道識別碼/)).toBeVisible();
    await expect(page.getByText(/申請查詢或閱覽個人資料、取得複製本/)).toBeVisible();
    await expect(page.getByText(/Bot 會向該 Discord 帳號私訊 30/)).toBeVisible();
    await expect(page.getByText(/未完成驗證時，將無法確認資料歸屬及處理申請/)).toBeVisible();
    await expect(page.getByText(/通知發送與系統安全紀錄：最長 30 天/)).toBeVisible();
    await expect(page.getByText(/重新套用已完成的刪除要求/)).toBeVisible();
    await expect(page.getByText(/備份中的副本不一定會同時消失/)).toBeVisible();
    await expect(page.locator(".public-legal-toc, .public-legal-page")).toHaveCount(0);
    await expect(page.locator("main h1")).toHaveCount(0);
    await expect(page.locator("main h2")).toHaveCount(8);
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/terms");
    await expect(page.getByRole("heading", { exact: true, name: "使用條款" })).toBeVisible();
    await expect(page.getByText(/非官方的商品與價格資料整理工具/)).toBeVisible();
    await expect(page.locator(".public-legal-toc, .public-legal-page")).toHaveCount(0);
    await expect(page.locator("main h1")).toHaveCount(0);
    await expect(page.locator("main h2")).toHaveCount(4);
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/about#contact");
    await expect(page.locator("#contact")).toBeInViewport();

    await page.goto("/privacy#privacy-browser-data");
    await expect(page.locator("#privacy-browser-data")).toBeInViewport();

    await page.goto("/terms#terms-external");
    await expect(page.locator("#terms-external")).toBeInViewport();

    await page.goto("/announcements");
    await expect(page.getByRole("heading", { exact: true, name: "網站公告" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "網站公開測試中" })).toBeVisible();
    await expect(page.getByText(/免登入的配單整理功能/)).toBeVisible();
    await expect(page.getByText(/個別商品提供的資訊較少時/)).toBeVisible();
    await expect(page.getByText(/不會額外爬取其他商店|外部規格網站/)).toHaveCount(0);
    await expectSingleLine(page.getByText(/服務提醒、資料狀態與功能更新/));
    const announcementTitle = page.getByRole("heading", { name: "網站公開測試中" });
    const announcementSummary = page.getByText(/商品與價格資訊可能因來源更新時間而有延遲/);
    const [titleSize, summarySize] = await Promise.all([
      announcementTitle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
      announcementSummary.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ]);
    expect(titleSize).toBeGreaterThan(summarySize);
    await expectTopbarLinks(page);
    await expectPublicFooterLinks(page);

    await page.goto("/price-report");
    await expect(page.getByRole("heading", { exact: true, name: "價格變動總覽" })).toBeVisible();
    await expect(page).toHaveTitle("電腦零件降價與價格變動 | PartsRadarTW");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "查看原價屋電腦零件近期降價、漲價與新增商品，掌握 CPU、顯示卡、SSD 等零件價格變動。",
    );
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
    const categoryRoutes = [
      "/categories/cpu",
      "/categories/motherboard",
      "/categories/memory",
      "/categories/storage",
      "/categories/hard-drive",
      "/categories/external-storage",
      "/categories/cooler",
      "/categories/liquid-cooling",
      "/categories/gpu",
      "/categories/case",
      "/categories/power-supply",
      "/categories/fan-accessory",
    ];
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

    for (const path of categoryRoutes) {
      await page.goto(`${path}?sort=price_desc&page=2`);
      await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "搜尋結果" })).toBeVisible();
      const canonicalUrl = new URL(
        (await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "",
      );
      expect(canonicalUrl.origin).toBe(publicOrigin);
      expect(canonicalUrl.pathname).toBe(path);
      expect(canonicalUrl.search).toBe("");
    }

    await page.goto("/?q=RTX");
    expect(
      new URL((await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "").pathname,
    ).toBe("/");

    const invalidCategoryResponse = await request.get("/categories/not-a-category");
    expect(invalidCategoryResponse.status()).toBe(404);

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
    const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const expectedSitemapUrls = ["/", ...categoryRoutes, "/price-report", "/discord", "/about"].map(
      (path) => new URL(path, `${publicOrigin}/`).toString(),
    );

    expect(sitemapUrls).toEqual(expectedSitemapUrls);
    expect(sitemapUrls).toHaveLength(16);
    expect(
      sitemapUrls.some((url) =>
        /\/api\/|\/products\/|\?|\/announcements|\/privacy|\/terms/.test(url),
      ),
    ).toBe(false);
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
                    isExcluded: false,
                    exclusionReason: null,
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
    await expect(page.getByText("已選品項中有 1 個品項暫時無法確認。")).toBeVisible();
    await expect(page.getByText("配單只儲存在此瀏覽器，不會跨裝置同步。")).toBeVisible();
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
    const summaryPanel = page.getByLabel("配單摘要與操作");
    await expect(summaryPanel.getByText("暫未計價")).toBeVisible();
    await expect(summaryPanel.getByLabel("配單資料狀態")).toBeVisible();
    await expect(summaryPanel.getByRole("button", { name: "下載 Excel（2）" })).toBeVisible();

    await missingItem.getByRole("checkbox", { name: "加入下載配單" }).uncheck();
    await expect(summaryPanel.getByRole("button", { name: "下載 Excel（1）" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(window.localStorage.getItem("partsradartw:build-list:v3") ?? "[]").find(
              (intent: { productId: string }) =>
                intent.productId === "22222222-2222-2222-2222-222222222222",
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
  test("cheaply rejects invalid share-image ids without a database", {
    tag: "@desktop-only",
  }, async ({ request }) => {
    for (const routeName of ["opengraph-image", "twitter-image"]) {
      const response = await request.get(`/products/not-a-uuid/${routeName}`);

      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toContain("s-maxage=3600");
      expect(response.headers()["content-length"]).toBe("0");
      expect(response.headers()["content-type"]).toContain("image/png");
      expect(response.headers()["x-ratelimit-limit"]).toBeTruthy();
      expect(response.headers()["x-ratelimit-client-source"]).toBeTruthy();
      expect(response.headers()["x-share-image-outcome"]).toBe("invalid");
    }
  });

  test("checks public data and rate-limit headers", {
    tag: ["@desktop-only", "@db-smoke"],
  }, async ({ request }) => {
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

  test("checks product detail, price history, cached images, and share-image bounds", {
    tag: ["@desktop-only", "@db-smoke"],
  }, async ({ request }) => {
    const product = await fetchFirstProduct(request);
    if (!product) {
      throw new Error("The deterministic E2E seed must provide a public product.");
    }

    const detail = await request.get(`/api/products/${product.id}`);
    expect(detail.status()).toBe(200);
    await expectJsonShape(detail, ["id", "name", "price"]);

    const priceHistory = await request.get(`/api/products/${product.id}/price-history?range=90d`);
    expect(priceHistory.status()).toBe(200);
    await expectJsonShape(priceHistory, ["range", "rangeDays", "points"]);

    expect(product.image?.url, "The deterministic E2E seed must advertise a cached image.").toBe(
      `/api/product-images/${product.id}.webp`,
    );

    const image = await request.get(product.image?.url ?? "");
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/");

    for (const routeName of ["opengraph-image", "twitter-image"]) {
      const shareImage = await request.get(`/products/${product.id}/${routeName}`);

      expect(shareImage.status()).toBe(200);
      expect(shareImage.headers()["content-type"]).toContain("image/png");
      expect(shareImage.headers()["cache-control"]).toContain("max-age=300");
      expect(shareImage.headers()["x-ratelimit-limit"]).toBeTruthy();
      expect(shareImage.headers()["x-ratelimit-client-source"]).toBeTruthy();
      expect(shareImage.headers()["x-share-image-outcome"]).toBe("valid");
      expect((await shareImage.body()).byteLength).toBeGreaterThan(0);
    }

    const missingShareImage = await request.get(
      "/products/20000000-0000-4000-8000-000000000099/twitter-image",
    );
    expect(missingShareImage.status()).toBe(404);
    expect(missingShareImage.headers()["cache-control"]).toContain("s-maxage=60");
    expect(missingShareImage.headers()["content-length"]).toBe("0");
    expect(missingShareImage.headers()["x-share-image-outcome"]).toBe("missing");
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
