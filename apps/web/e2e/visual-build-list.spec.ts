// apps/web/e2e/visual-build-list.spec.ts
// 以本地 mock API 驗證 build-list summary、global route link、return state 與 controls。

import { expect, type Locator, type Page, type Route, test } from "@playwright/test";
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

const OBSERVED_AT = "2026-07-10T08:00:00.000Z";
const PRICE_REPORT_WRAP_NAME = "AI PRO R9700 Creator / Lexar D400 / Type-C+A / USB3.1 G1";
const product = buildVisualProduct();

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
    await route.fulfill(
      buildJsonResponse(buildPriceReportResponse(new URL(route.request().url()))),
    );
  });
});

test("presents build-list summary, categories, actions, and data status in one sidebar @responsive-boundary", async ({
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

  await page.goto("/categories/gpu?page=10");
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
    await page.goto("/categories/cpu");
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
    await page
      .getByRole("navigation", { name: "商品分類" })
      .getByText("CPU", { exact: true })
      .click();
  }
  await expect.poll(() => new URL(page.url()).pathname).toBe("/categories/cpu");
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
  await expect(
    page.getByText(/配單中的商品 ID、數量、順序與更新時間只儲存在目前瀏覽器的本機儲存空間/),
  ).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "提醒與個人價格報告" })).toBeVisible();
  const discordBackLinkWidth = await page
    .getByRole("link", { name: "返回查詢" })
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(discordBackLinkWidth).toBeLessThan(180);
  await page.locator(".discord-faq-item summary").first().focus();
  await expectUsableLayout(page, testInfo);
});

const globalBuildListRoutes = [
  { label: "home", path: "/" },
  { label: "product-detail", path: `/products/${READY_ROUTE_SLUG}` },
  { label: "price-report", path: "/price-report" },
  { label: "discord", path: "/discord" },
  { label: "announcements", path: "/announcements" },
  { label: "about", path: "/about" },
  { label: "privacy", path: "/privacy" },
  { label: "terms", path: "/terms" },
  { label: "build-list", path: "/build-list" },
] as const;

for (const route of globalBuildListRoutes) {
  test(`mounts the global build-list link on ${route.label} @desktop-only`, async ({ page }) => {
    await seedBuildList(page);
    await expectGlobalBuildListLink(page, route.path);
  });
}

test("mounts the global build-list link on representative mobile routes @mobile-only", async ({
  page,
}) => {
  await seedBuildList(page);
  for (const route of globalBuildListRoutes.filter(({ label }) =>
    ["home", "product-detail", "build-list"].includes(label),
  )) {
    await test.step(route.label, async () => {
      await expectGlobalBuildListLink(page, route.path);
    });
  }
});

test("preserves product explorer state through safe build-list return links @desktop-only", async ({
  page,
}) => {
  const originalLocation =
    "/categories/cpu?q=ryzen&facet=socket%3Alga1700&facet=cpu_family%3Acore-i5&minPrice=1000&maxPrice=20000&vendors=intel&status=all&sort=price_desc&page=10&pageSize=50";
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

  await expect
    .poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`)
    .toBe(canonicalLocation);
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

test("matches the product-detail mobile topbar and centers build-list item controls @responsive-boundary", async ({
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

async function seedBuildList(page: Page) {
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
}

async function expectGlobalBuildListLink(page: Page, route: string) {
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
    status: { isActive, isExcluded: false, exclusionReason: null },
    lastSeenAt: OBSERVED_AT,
  };
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill(buildJsonResponse(body));
}
