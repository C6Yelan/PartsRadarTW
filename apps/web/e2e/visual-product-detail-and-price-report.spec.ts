// apps/web/e2e/visual-product-detail-and-price-report.spec.ts
// 以本地 mock API 驗證商品 detail、price history 與 price-report presentation/state。

import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./support/visual-assertions";
import {
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
  await page.route(/\/api\/price-report(?:\?.*)?$/, async (route) => {
    await route.fulfill(
      buildJsonResponse(buildPriceReportResponse(new URL(route.request().url()))),
    );
  });
});

test("keeps mobile price-history records readable and uses discount wording @mobile-only", async ({
  page,
}) => {
  await page.goto(`/products/${READY_ROUTE_SLUG}`);

  const badge = page.locator(".history-record-badge.is-down").first();
  await expect(badge).toHaveText("降價");
  await expect(page.getByText("下跌", { exact: true })).toHaveCount(0);
  await expect(page.locator(".history-record-row strong.is-down").first()).toContainText("−NT$");
  const badgeMetrics = await badge.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const textRect = range.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      height: rect.height,
      horizontalCenterOffset: Math.abs(
        rect.left + rect.width / 2 - (textRect.left + textRect.width / 2),
      ),
      minWidth: Number.parseFloat(style.minWidth),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      verticalCenterOffset: Math.abs(
        rect.top + rect.height / 2 - (textRect.top + textRect.height / 2),
      ),
      whiteSpace: style.whiteSpace,
    };
  });
  expect(badgeMetrics.minWidth).toBeGreaterThanOrEqual(52);
  expect(badgeMetrics.height).toBeGreaterThanOrEqual(30);
  expect(badgeMetrics.paddingLeft).toBeGreaterThanOrEqual(10);
  expect(badgeMetrics.whiteSpace).toBe("nowrap");
  expect(badgeMetrics.horizontalCenterOffset).toBeLessThanOrEqual(1);
  expect(badgeMetrics.verticalCenterOffset).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
});

test("labels sampled price history as representative and restores exact labels on range switch", async ({
  page,
}) => {
  await page.route(
    new RegExp(`/api/products/${PRODUCT_ID}/price-history(?:\\?.*)?$`),
    async (route) => {
      const requestUrl = new URL(route.request().url());
      const exact = requestUrl.searchParams.get("days") === "30";
      await route.fulfill(
        buildJsonResponse({
          ...buildPriceHistoryResponse(),
          range: exact ? "30d" : "90d",
          rangeDays: exact ? 30 : 90,
          ...(exact
            ? {}
            : {
                sampling: {
                  downsampled: true,
                  strategy: "time_bucket_first_last",
                  bucketCount: 126,
                  pointLimit: 256,
                },
              }),
        }),
      );
    },
  );

  await page.goto(`/products/${READY_ROUTE_SLUG}`);

  await expect(page.getByText(/每個時間分桶顯示首筆與末筆代表觀測/)).toBeVisible();
  await expect(page.getByText("代表觀測期間變動", { exact: true })).toBeVisible();
  await expect(page.getByText("代表觀測最低", { exact: true })).toBeVisible();
  await expect(page.getByText("代表觀測均價", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "代表觀測變價紀錄" })).toBeVisible();

  await page.getByRole("button", { name: "30 天" }).click();

  await expect(page.getByText(/每個時間分桶顯示首筆與末筆代表觀測/)).toHaveCount(0);
  await expect(page.getByText("期間變動", { exact: true })).toBeVisible();
  await expect(page.getByText("區間平均", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "變價紀錄", exact: true })).toBeVisible();
});

test("uses compact custom price-report filters, aligned table typography, and conditional reset @responsive-boundary", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const viewports = [
    { width: 1760, height: 900 },
    { width: 1121, height: 800 },
    { width: 1120, height: 800 },
    { width: 761, height: 844 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await test.step(`${viewport.width}px price-report layout`, async () => {
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

        const product = page.locator(".price-report-product").first();
        const productCopy = product.locator(".price-report-product-copy");
        const productLink = productCopy.locator("a");
        await expect(product).toHaveCSS("text-align", "left");
        await expect(product).toHaveCSS("justify-content", "stretch");
        await expect(productCopy).toHaveCSS("text-align", "left");
        await expect(productLink).toHaveCSS("text-align", "left");

        const [productBox, imageBox, linkBox, categoryBox] = await Promise.all([
          product.boundingBox(),
          product.locator(".product-image").boundingBox(),
          productLink.boundingBox(),
          page.locator(".price-report-category").first().boundingBox(),
        ]);
        expect(linkBox?.x ?? 0).toBeGreaterThanOrEqual(
          (imageBox?.x ?? Number.POSITIVE_INFINITY) + (imageBox?.width ?? 0),
        );
        expect(
          (linkBox?.x ?? Number.POSITIVE_INFINITY) + (linkBox?.width ?? 0),
        ).toBeLessThanOrEqual((productBox?.x ?? 0) + (productBox?.width ?? 0));
        expect(
          (productBox?.x ?? Number.POSITIVE_INFINITY) + (productBox?.width ?? 0),
        ).toBeLessThanOrEqual(categoryBox?.x ?? 0);

        for (const cell of await page
          .locator(
            ".price-report-category, .price-report-previous, .price-report-current, .price-report-amount, .price-report-percent, .price-report-changed",
          )
          .all()) {
          await expect(cell).toHaveCSS("text-align", "center");
          const value = cell.locator("span:last-child");
          const [cellBox, valueBox] = await Promise.all([cell.boundingBox(), value.boundingBox()]);
          const cellCenter = (cellBox?.x ?? 0) + (cellBox?.width ?? 0) / 2;
          const valueCenter = (valueBox?.x ?? 0) + (valueBox?.width ?? 0) / 2;
          expect(Math.abs(cellCenter - valueCenter)).toBeLessThanOrEqual(2);
        }
      } else {
        await expect(tableHeader).toBeHidden();
        await expect(page.locator(".price-report-cell-label").first()).toBeVisible();
        await expect(page.locator(".price-report-product").first()).toHaveCSS("text-align", "left");
        await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
          "white-space",
          "normal",
        );
        await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
          "word-break",
          "normal",
        );
        await expect(page.locator(".price-report-product-copy a").first()).toHaveCSS(
          "overflow-wrap",
          "break-word",
        );
        if (viewport.width <= 390) {
          const tokenLineCounts = await readTokenLineCounts(
            page.locator(".price-report-product-copy a").first(),
            ["AI", "PRO", "R9700", "Creator", "Lexar", "D400", "Type-C+A", "USB3.1", "G1"],
          );
          expect(Object.values(tokenLineCounts).every((lineCount) => lineCount === 1)).toBe(true);
          const longSpecTokenLineCounts = await readTokenLineCounts(
            page.locator(".price-report-product-copy a").nth(1),
            ["32GB", "2920MHz", "27cm"],
          );
          expect(Object.values(longSpecTokenLineCounts).every((lineCount) => lineCount === 1)).toBe(
            true,
          );
        }
        for (const cell of await page.locator(".price-report-value").all()) {
          const label = cell.locator(".price-report-cell-label");
          const value = cell.locator("span:last-child");
          const [cellBox, labelBox, valueBox] = await Promise.all([
            cell.boundingBox(),
            label.boundingBox(),
            value.boundingBox(),
          ]);
          expect((labelBox?.x ?? 0) + (labelBox?.width ?? 0)).toBeLessThanOrEqual(valueBox?.x ?? 0);
          expect(
            (valueBox?.x ?? Number.POSITIVE_INFINITY) + (valueBox?.width ?? 0),
          ).toBeLessThanOrEqual((cellBox?.x ?? 0) + (cellBox?.width ?? 0));
        }
        await expect(page.getByRole("navigation", { name: "頁碼" })).toBeVisible();
      }
      const reportRow = page.locator(".price-report-row").first();
      await expect(reportRow.locator(".price-report-kind")).toHaveCount(0);
      await expect(reportRow.locator(".price-report-amount > span:last-child")).toHaveText(
        "−NT$ 1,000",
      );
      const reportRows = page.locator(".price-report-rows");
      const visibleBackground = await readVisibleBackground(reportRow);
      expect(visibleBackground.backgroundColor).toBe("rgb(13, 25, 34)");
      expect(visibleBackground.sourceClasses).toContain("price-report-rows");
      const [rowsBox, firstRowBox, lastRowBox] = await Promise.all([
        reportRows.boundingBox(),
        reportRow.boundingBox(),
        page.locator(".price-report-row").last().boundingBox(),
      ]);
      expect(rowsBox?.y).toBeCloseTo(firstRowBox?.y ?? 0, 1);
      expect((rowsBox?.y ?? 0) + (rowsBox?.height ?? 0)).toBeCloseTo(
        (lastRowBox?.y ?? 0) + (lastRowBox?.height ?? 0),
        1,
      );
      const rowBoxBeforeHover = await reportRow.boundingBox();
      const borderBeforeHover = (await readRowStyleSnapshot(reportRow)).borderBottomColor;
      await reportRow.hover();
      const rowBoxAfterHover = await reportRow.boundingBox();
      expect(rowBoxAfterHover?.x).toBeCloseTo(rowBoxBeforeHover?.x ?? 0, 1);
      expect(rowBoxAfterHover?.width).toBeCloseTo(rowBoxBeforeHover?.width ?? 0, 1);
      expect(rowBoxAfterHover?.height).toBeCloseTo(rowBoxBeforeHover?.height ?? 0, 1);
      expect((await readRowStyleSnapshot(reportRow)).borderBottomColor).toBe(borderBeforeHover);
      await page.mouse.move(0, 0);
      await expect(reportRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect((await readVisibleBackground(reportRow)).backgroundColor).toBe(
        visibleBackground.backgroundColor,
      );
      await expect(page.getByRole("status").filter({ hasText: "資料最後成功更新" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");
  const homeFacetFilter = page.locator(".facet-filter").filter({ hasText: "腳位" });
  await homeFacetFilter.locator(".facet-menu-trigger").click();
  const homeFacetOption = homeFacetFilter.locator(".facet-option").first();
  const homeFacetCheckbox = homeFacetOption.getByRole("checkbox");
  const homeFacetDefaultStyle = await readOptionStyleSnapshot(homeFacetOption);
  const homeFacetDefaultIndicator = await readIndicatorStyleSnapshot(homeFacetOption);
  await homeFacetCheckbox.check();
  const homeFacetActiveStyle = await readOptionStyleSnapshot(homeFacetOption);
  const homeFacetActiveIndicator = await readIndicatorStyleSnapshot(homeFacetOption);

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
  const priceCategoryOption = categoryPopover
    .locator(".price-report-category-option")
    .filter({ hasText: "CPU" });
  const priceCategoryCheckbox = priceCategoryOption.getByRole("checkbox");
  const priceCategoryDefaultStyle = await readOptionStyleSnapshot(priceCategoryOption);
  expectStyleFields(priceCategoryDefaultStyle, homeFacetDefaultStyle, [
    "backgroundColor",
    "border",
    "borderRadius",
    "color",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "minHeight",
    "paddingLeft",
  ]);
  expect(priceCategoryDefaultStyle.letterSpacing).toBe(homeFacetDefaultStyle.letterSpacing);
  expect(priceCategoryDefaultStyle.textAlign).toBe("left");
  expect(priceCategoryDefaultStyle.whiteSpace).toBe("nowrap");
  expect(priceCategoryDefaultStyle.wordSpacing).toBe(homeFacetDefaultStyle.wordSpacing);
  expect(await readIndicatorStyleSnapshot(priceCategoryOption)).toEqual(homeFacetDefaultIndicator);
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
  await categoryTrigger.focus();
  await categoryTrigger.press("Tab");
  await expect(categoryPopover.getByRole("checkbox").first()).toBeFocused();
  await priceCategoryCheckbox.focus();
  await expect(priceCategoryOption).toHaveCSS("outline-style", "solid");
  await expect(priceCategoryOption).toHaveCSS("outline-width", "2px");
  await priceCategoryCheckbox.press("Space");
  await expect(categoryPopover).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("category")).toEqual(["cpu"]);
  await expect(categoryTrigger).toHaveAccessibleName("商品分類，目前CPU");
  const priceCategoryActiveStyle = await readOptionStyleSnapshot(priceCategoryOption);
  expectStyleFields(priceCategoryActiveStyle, homeFacetActiveStyle, [
    "backgroundColor",
    "border",
    "color",
  ]);
  expect(await readIndicatorStyleSnapshot(priceCategoryOption)).toEqual(homeFacetActiveIndicator);
  await categoryPopover.getByRole("checkbox", { name: "顯示卡" }).check();
  await expect(categoryPopover).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("category"))
    .toEqual(["cpu", "gpu"]);
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
  await categoryPopover.getByRole("checkbox", { name: "CPU" }).focus();
  await categoryPopover.getByRole("checkbox", { name: "CPU" }).press("Tab");
  await expect(categoryPopover.getByRole("checkbox", { name: "主機板" })).toBeFocused();
  await expect(categoryPopover).toBeVisible();

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
    const [optionBox, textBox] = await Promise.all([
      option.boundingBox(),
      option.locator("span").boundingBox(),
    ]);
    expect(textBox?.x ?? 0).toBeGreaterThanOrEqual((optionBox?.x ?? 0) + 31);
    expect((textBox?.x ?? 0) + (textBox?.width ?? 0)).toBeLessThanOrEqual(
      (optionBox?.x ?? 0) + (optionBox?.width ?? 0),
    );
  }
  await expectNoHorizontalOverflow(page);
  await mobileCategoryPopover.getByRole("checkbox", { name: "風扇 / 配件" }).check();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("fan-accessory");

  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/");
  const homeProductStyle = await readStyleSnapshot(page.locator(".product-main a").first());
  const homePriceStyle = await readStyleSnapshot(page.locator(".row-price strong").first());
  const homeMovementStyle = await readStyleSnapshot(page.locator(".price-movement").first());
  const homeValueStyle = await readStyleSnapshot(page.locator(".table-cell").first());
  const homeHeaderStyle = await readStyleSnapshot(page.locator(".table-header"));
  const homeRow = page.locator(".product-row").first();
  const homeResultsPanelStyle = await readStyleSnapshot(page.locator(".results-panel"));
  const homeProductTableStyle = await readStyleSnapshot(page.locator(".product-table"));
  const homeRowParentStyle = await readStyleSnapshot(homeRow.locator("..").first());
  const homeVisibleBackground = await readVisibleBackground(homeRow);
  const homeRowStyle = await readRowStyleSnapshot(homeRow);
  const homeRowBoxBeforeHover = await homeRow.boundingBox();
  const homeBorderBeforeHover = homeRowStyle.borderBottomColor;
  await homeRow.hover();
  await expect(homeRow).toHaveCSS("background-color", "rgba(22, 42, 56, 0.68)");
  const homeRowHoverBackground = (await readRowStyleSnapshot(homeRow)).backgroundColor;
  const homeRowBoxAfterHover = await homeRow.boundingBox();
  expect(homeRowBoxAfterHover).toEqual(homeRowBoxBeforeHover);
  expect((await readRowStyleSnapshot(homeRow)).borderBottomColor).toBe(homeBorderBeforeHover);
  await page.mouse.move(0, 0);
  await expect(homeRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect((await readVisibleBackground(homeRow)).backgroundColor).toBe(
    homeVisibleBackground.backgroundColor,
  );
  await homeRow.getByRole("button", { name: "加入" }).click();
  await expect(homeRow).toHaveClass(/is-in-build-list/);
  const selectedHomeRowStyle = await readStyleSnapshot(homeRow);
  expect(selectedHomeRowStyle.backgroundColor).not.toBe(homeVisibleBackground.backgroundColor);
  await expect(homeRow).toHaveCSS("box-shadow", /rgba\(120, 216, 149, 0\.44\)/);
  await page.goto("/price-report");

  const reportRow = page.locator(".price-report-row").first();
  const reportResultsStyle = await readStyleSnapshot(page.locator(".price-report-results"));
  const reportRowsStyle = await readStyleSnapshot(page.locator(".price-report-rows"));
  const reportRowParentStyle = await readStyleSnapshot(reportRow.locator("..").first());
  const reportVisibleBackground = await readVisibleBackground(reportRow);
  expect(homeResultsPanelStyle.backgroundColor).toBe("rgb(13, 25, 34)");
  expect(homeProductTableStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(homeRowParentStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(homeVisibleBackground.sourceClasses).toContain("results-panel");
  expect(reportResultsStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(reportRowsStyle.backgroundColor).toBe(homeResultsPanelStyle.backgroundColor);
  expect(reportRowParentStyle.backgroundColor).toBe(reportRowsStyle.backgroundColor);
  expect(reportVisibleBackground.backgroundColor).toBe(homeVisibleBackground.backgroundColor);
  expect(reportVisibleBackground.sourceClasses).toContain("price-report-rows");
  const reportRowStyle = await readRowStyleSnapshot(reportRow);
  expectStyleFields(reportRowStyle, homeRowStyle, [
    "backgroundColor",
    "transitionDuration",
    "transitionProperty",
  ]);
  const reportBorderBeforeHover = reportRowStyle.borderBottomColor;
  const reportRowBoxBeforeHover = await reportRow.boundingBox();
  await reportRow.hover();
  await expect(reportRow).toHaveCSS("background-color", homeRowHoverBackground);
  expect((await readRowStyleSnapshot(reportRow)).backgroundColor).toBe(homeRowHoverBackground);
  expect((await readRowStyleSnapshot(reportRow)).borderBottomColor).toBe(reportBorderBeforeHover);
  expect(await reportRow.boundingBox()).toEqual(reportRowBoxBeforeHover);
  await page.mouse.move(0, 0);
  await expect(reportRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect((await readVisibleBackground(reportRow)).backgroundColor).toBe(
    reportVisibleBackground.backgroundColor,
  );
  await expect(page.locator(".price-report-row.is-in-build-list")).toHaveCount(0);

  const productStyle = await readStyleSnapshot(
    page.locator(".price-report-product-copy a").first(),
  );
  expectStyleFields(productStyle, homeProductStyle, [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "color",
  ]);

  for (const selector of [
    ".price-report-previous > span:last-child",
    ".price-report-current > span:last-child",
  ]) {
    const priceStyle = await readStyleSnapshot(page.locator(selector).first());
    expectStyleFields(priceStyle, homePriceStyle, [
      "fontSize",
      "fontWeight",
      "color",
      "fontVariantNumeric",
      "whiteSpace",
    ]);
  }

  for (const selector of [
    ".price-report-amount > span:last-child",
    ".price-report-percent > span:last-child",
  ]) {
    const movementStyle = await readStyleSnapshot(page.locator(selector).first());
    expectStyleFields(movementStyle, homeMovementStyle, [
      "fontSize",
      "fontWeight",
      "fontVariantNumeric",
      "whiteSpace",
    ]);
  }

  for (const selector of [
    ".price-report-category > span:last-child",
    ".price-report-changed > span:last-child",
  ]) {
    const valueStyle = await readStyleSnapshot(page.locator(selector).first());
    expectStyleFields(valueStyle, homeValueStyle, [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "color",
    ]);
    expect(valueStyle.textAlign).toBe("center");
  }

  const reportHeaderStyle = await readStyleSnapshot(page.locator(".price-report-table-header"));
  expectStyleFields(reportHeaderStyle, homeHeaderStyle, [
    "minHeight",
    "fontSize",
    "fontWeight",
    "color",
    "backgroundColor",
  ]);

  const dropMovementColor = await page
    .locator(".price-report-row.is-drop .price-report-amount > span:last-child")
    .evaluate((element) => getComputedStyle(element).color);
  const riseMovementColor = await page
    .locator(".price-report-row.is-rise .price-report-amount > span:last-child")
    .evaluate((element) => getComputedStyle(element).color);
  expect(dropMovementColor).toBe("rgb(104, 226, 145)");
  expect(riseMovementColor).toBe("rgb(255, 138, 145)");
  expect(reportHeaderStyle.backgroundColor).toBe("rgb(20, 37, 50)");
  await expect(page.locator(".price-report-source-status")).toHaveCSS(
    "background-color",
    "rgb(16, 28, 38)",
  );
  await expect(page.locator(".price-report-summary")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".pagination-bar")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.goto("/price-report?q=stale");
  await expect(page.locator(".price-report-source-warning")).toHaveCSS(
    "background-color",
    "rgba(122, 92, 28, 0.2)",
  );
});

async function readTokenLineCounts(locator: Locator, tokens: string[]) {
  return locator.evaluate((element, expectedTokens) => {
    const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    const text = textNode?.textContent ?? "";

    return Object.fromEntries(
      expectedTokens.map((token) => {
        const start = text.indexOf(token);
        if (!textNode || start < 0) {
          return [token, 0];
        }

        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, start + token.length);
        const lineCount = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
          .size;

        return [token, lineCount];
      }),
    );
  }, tokens);
}
interface StyleSnapshot {
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontVariantNumeric: string;
  fontWeight: string;
  lineHeight: string;
  minHeight: string;
  textAlign: string;
  whiteSpace: string;
}

interface OptionStyleSnapshot {
  backgroundColor: string;
  border: string;
  borderRadius: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
  lineHeight: string;
  minHeight: string;
  paddingLeft: string;
  textAlign: string;
  whiteSpace: string;
  wordSpacing: string;
}

interface IndicatorStyleSnapshot {
  backgroundColor: string;
  border: string;
  borderRadius: string;
  left: string;
  width: string;
}

interface RowStyleSnapshot {
  backgroundColor: string;
  borderBottomColor: string;
  transitionDuration: string;
  transitionProperty: string;
}

interface VisibleBackground {
  backgroundColor: string;
  sourceClasses: string;
}

async function readStyleSnapshot(locator: Locator): Promise<StyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontVariantNumeric: style.fontVariantNumeric,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      minHeight: style.minHeight,
      textAlign: style.textAlign,
      whiteSpace: style.whiteSpace,
    };
  });
}

async function readOptionStyleSnapshot(locator: Locator): Promise<OptionStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      border: style.border,
      borderRadius: style.borderRadius,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      minHeight: style.minHeight,
      paddingLeft: style.paddingLeft,
      textAlign: style.textAlign,
      whiteSpace: style.whiteSpace,
      wordSpacing: style.wordSpacing,
    };
  });
}

async function readIndicatorStyleSnapshot(locator: Locator): Promise<IndicatorStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return {
      backgroundColor: style.backgroundColor,
      border: style.border,
      borderRadius: style.borderRadius,
      left: style.left,
      width: style.width,
    };
  });
}

async function readRowStyleSnapshot(locator: Locator): Promise<RowStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomColor: style.borderBottomColor,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
}

async function readVisibleBackground(locator: Locator): Promise<VisibleBackground> {
  return locator.evaluate((element) => {
    let current: Element | null = element;

    while (current) {
      const backgroundColor = getComputedStyle(current).backgroundColor;
      const alphaMatch = backgroundColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
      const isVisible = backgroundColor !== "transparent" && Number(alphaMatch?.[1] ?? 1) > 0;

      if (isVisible) {
        return {
          backgroundColor,
          sourceClasses: current.className || current.tagName.toLowerCase(),
        };
      }

      current = current.parentElement;
    }

    return { backgroundColor: "transparent", sourceClasses: "none" };
  });
}

function expectStyleFields<T extends object>(actual: T, expected: T, fields: Array<keyof T>) {
  for (const field of fields) {
    expect(actual[field], String(field)).toBe(expected[field]);
  }
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
