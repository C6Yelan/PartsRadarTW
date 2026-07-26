// apps/web/e2e/visual-product-explorer-facets.spec.ts
// 以本地 mock API 驗證商品探索器的 facets、controls 與 responsive layout。

import { expect, type Page, test } from "@playwright/test";
import { expectNoHorizontalOverflow, expectQueryFilters } from "./support/visual-assertions";
import {
  buildJsonResponse,
  buildProductListResponse,
  buildSourceStatusResponse,
  buildVisualCategories,
  buildVisualProduct,
  isVisualLoopback,
} from "./support/visual-fixtures";

const product = buildVisualProduct();
let holdNextProductsRequest = false;
let releaseHeldProductsRequest: (() => void) | null = null;

test.beforeEach(async ({ page }) => {
  test.skip(!isVisualLoopback, "Visual layout tests only run against a loopback web server.");
  holdNextProductsRequest = false;
  releaseHeldProductsRequest = null;

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
    if (holdNextProductsRequest) {
      holdNextProductsRequest = false;
      await new Promise<void>((resolve) => {
        releaseHeldProductsRequest = resolve;
      });
      releaseHeldProductsRequest = null;
    }

    await route.fulfill(
      buildJsonResponse(buildProductListResponse(new URL(route.request().url()))),
    );
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

test("keeps the product toolbar compact and readable across its layout boundary @responsive-boundary", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => window.localStorage.clear());

  const viewports = [
    { width: 1760, height: 900 },
    { width: 1309, height: 800 },
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
    await test.step(`${viewport.width}px product-toolbar layout`, async () => {
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
        await expect(input).toHaveCSS("text-align", "center");
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
        expect((await page.locator(".toolbar-status-filter").boundingBox())?.width).toBeLessThan(
          300,
        );
        expect((await page.locator(".vendor-menu-trigger").boundingBox())?.width).toBeCloseTo(
          112,
          0,
        );
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
        const productHeaderAlignment = await tableHeader
          .locator("span")
          .nth(1)
          .evaluate((element) => {
            const range = document.createRange();
            const textNode = element.firstChild;
            if (!textNode) return null;
            range.selectNodeContents(textNode);
            const cellRect = element.getBoundingClientRect();
            const textRect = range.getBoundingClientRect();
            return {
              cellCenter: cellRect.left + cellRect.width / 2,
              textAlign: getComputedStyle(element).textAlign,
              textCenter: textRect.left + textRect.width / 2,
            };
          });
        expect(productHeaderAlignment?.textAlign).toBe("center");
        expect(
          Math.abs(
            (productHeaderAlignment?.cellCenter ?? 0) -
              (productHeaderAlignment?.textCenter ?? Number.POSITIVE_INFINITY),
          ),
        ).toBeLessThanOrEqual(2);
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
      if (!usesCompactTable) {
        await expect(productRow.locator(".product-main")).toHaveCSS("text-align", "left");
      }
      await expect(productRow.locator(".row-price strong")).toContainText("NT$ 18,990");
      const movementText = await productRow.locator(".price-movement").innerText();
      expect(movementText).toBe("−NT$ 300 / −4.8%");
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
    });
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

test("keeps the vendor menu open while multi-select requests reload @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  const vendorFilter = page.locator(".vendor-filter");
  await vendorFilter.locator(".vendor-menu-trigger").click();
  const popover = vendorFilter.getByRole("group", { name: "廠商篩選選單" });
  await expect(popover).toBeVisible();
  await expect(vendorFilter.locator(".vendor-menu-header")).toHaveCount(0);
  await expect(popover).not.toContainText("CPU");

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "Intel" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  await expect(page.locator(".skeleton-row").first()).toBeVisible();
  await expect(vendorFilter.getByRole("checkbox", { exact: true, name: "Intel" })).toBeChecked();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel");
  await expect(page.locator(".skeleton-row")).toHaveCount(0);

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "AMD" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  await expect(vendorFilter.getByRole("checkbox", { exact: true, name: "AMD" })).toBeChecked();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("intel,amd");
  await expect(page.locator(".skeleton-row")).toHaveCount(0);
  await expect(vendorFilter.locator(".vendor-menu-header")).toHaveCount(0);
  await expect(vendorFilter.getByRole("button", { name: "清除" })).toHaveCount(0);

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "Intel" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  await expect(
    vendorFilter.getByRole("checkbox", { exact: true, name: "Intel" }),
  ).not.toBeChecked();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBe("amd");
  await expect(page.locator(".skeleton-row")).toHaveCount(0);

  holdNextProductsRequest = true;
  await vendorFilter.locator(".vendor-option").filter({ hasText: "AMD" }).click();
  await expect.poll(() => releaseHeldProductsRequest !== null).toBe(true);
  await expect(popover).toBeVisible();
  releaseHeldProductsRequest?.();
  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBeNull();
  await expect(page.locator(".skeleton-row")).toHaveCount(0);
  await expect(vendorFilter.locator(".vendor-menu-header")).toHaveCount(0);
  await expect(vendorFilter.locator('input[type="checkbox"]:checked')).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await vendorFilter.locator(".vendor-menu-trigger").click();
  await expect(popover).toBeVisible();
  await page.locator(".results-title").click();
  await expect(popover).toHaveCount(0);

  await selectVendor(page, "Intel");
  await switchCategory(page, "主機板", "motherboard");
  await expect(page.getByRole("checkbox", { exact: true, name: "Intel" })).toHaveCount(0);
  await expect(page.locator(".vendor-menu-trigger")).toHaveText(/全部廠商/);
  await switchCategory(page, "機殼", "case");
  await expect(page.locator(".vendor-filter-disabled")).toHaveText("無廠商資料");

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("motherboard");
  await expect(page.locator(".vendor-menu-trigger")).toBeEnabled();
  await page.goBack();
  await expectQueryFilters(page, { category: "cpu", facets: [], vendors: "intel" });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
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

test("sizes short facet popovers and separates semantic option groups @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  const socketFilter = page.locator(".facet-filter").filter({ hasText: "腳位" });
  await socketFilter.locator(".facet-menu-trigger").click();
  const socketPopover = socketFilter.locator(".facet-menu-popover");
  const socketLayout = await socketPopover.evaluate((popover) => {
    const option = [...popover.querySelectorAll(".facet-option")].find((candidate) =>
      candidate.textContent?.includes("sTR5 / Threadripper"),
    );
    const optionRect = option?.getBoundingClientRect();
    const textRect = option?.querySelector("span")?.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    return {
      clientWidth: popover.clientWidth,
      optionLeft: optionRect?.left,
      popoverRight: popoverRect.right,
      scrollWidth: popover.scrollWidth,
      textLeft: textRect?.left,
      textRight: textRect?.right,
      width: popoverRect.width,
    };
  });
  console.log("facet popover desktop layout", socketLayout);
  expect(socketLayout.width).toBeLessThanOrEqual(260);
  expect(socketLayout.width).toBeLessThan(300);
  expect(socketLayout.width).toBeGreaterThanOrEqual(200);
  expect(socketLayout.scrollWidth).toBeLessThanOrEqual(socketLayout.clientWidth);
  expect((socketLayout.textLeft ?? 0) - (socketLayout.optionLeft ?? 0)).toBeGreaterThanOrEqual(30);
  expect(socketLayout.textRight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    socketLayout.popoverRight - 10,
  );
  await expectNoHorizontalOverflow(page);
  await socketFilter.locator(".facet-menu-trigger").click();

  await switchCategory(page, "主機板", "motherboard");
  const chipsetFilter = page.locator(".facet-filter").filter({ hasText: "晶片組" });
  await chipsetFilter.locator(".facet-menu-trigger").click();
  const groups = chipsetFilter.locator(".facet-option-group");
  const headers = chipsetFilter.locator(".facet-option-group-header");
  await expect(groups).toHaveCount(6);
  await expect(chipsetFilter.getByRole("group")).toHaveCount(6);
  await expect(headers).toHaveText([
    "LGA 1700",
    "LGA 1851",
    "舊平台／工作站",
    "AM4",
    "AM5",
    "Threadripper",
  ]);
  await expect(chipsetFilter.locator(".facet-vendor-heading")).toHaveText(["Intel", "AMD"]);
  await expect(chipsetFilter.locator(".facet-vendor-badge")).toHaveCount(0);
  await expect(chipsetFilter.locator(".facet-group-separator")).toHaveCount(0);
  for (const accessibleName of [
    "Intel LGA 1700",
    "Intel LGA 1851",
    "Intel 舊平台／工作站",
    "AMD AM4",
    "AMD AM5",
    "AMD Threadripper",
  ]) {
    await expect(chipsetFilter.getByRole("group", { name: accessibleName })).toHaveCount(1);
  }
  await expect(headers.locator('input[type="checkbox"]')).toHaveCount(0);
  const groupBorders = await groups.evaluateAll((elements) =>
    elements.map((element) => window.getComputedStyle(element).borderTopWidth),
  );
  expect(groupBorders).toEqual(["0px", "1px", "1px", "1px", "1px", "1px"]);
  const optionListScroll = await chipsetFilter
    .locator(".facet-option-list")
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
  expect(optionListScroll.scrollHeight).toBeGreaterThan(optionListScroll.clientHeight);

  for (const viewport of [
    { width: 1760, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await chipsetFilter.locator(".facet-menu-popover").evaluate((popover) => {
      const optionRects = [...popover.querySelectorAll<HTMLElement>(".facet-option")].map(
        (option) => ({
          label: option.textContent?.trim(),
          rect: option.getBoundingClientRect(),
        }),
      );
      const readRect = (label: string) =>
        optionRects.find((option) => option.label === label)?.rect;
      const groups = [...popover.querySelectorAll<HTMLElement>(".facet-option-group")];
      const firstGroupStyle = window.getComputedStyle(groups[0]);
      const popoverRect = popover.getBoundingClientRect();

      return {
        columns: firstGroupStyle.gridTemplateColumns.split(" ").length,
        dividerWidths: groups.slice(1).map((group) => group.getBoundingClientRect().width),
        firstGroupWidth: groups[0]?.getBoundingClientRect().width,
        headerLayouts: groups.map((group) => {
          const header = group.querySelector<HTMLElement>(".facet-option-group-header");
          const firstOption = group.querySelector<HTMLElement>(".facet-option");
          const headerRect = header?.getBoundingClientRect();
          return {
            bottom: headerRect?.bottom,
            firstOptionTop: firstOption?.getBoundingClientRect().top,
            position: header ? window.getComputedStyle(header).position : null,
            width: headerRect?.width,
          };
        }),
        h610: readRect("H610"),
        b760: readRect("B760"),
        z790: readRect("Z790"),
        h810: readRect("H810"),
        popoverClientWidth: popover.clientWidth,
        popoverScrollWidth: popover.scrollWidth,
        popoverWidth: popoverRect.width,
      };
    });
    expect(layout.columns).toBe(3);
    expect(layout.popoverWidth).toBeGreaterThanOrEqual(300);
    expect(layout.popoverWidth).toBeLessThanOrEqual(360);
    expect(layout.popoverScrollWidth).toBeLessThanOrEqual(layout.popoverClientWidth);
    expect(
      Math.max(layout.h610?.top ?? 0, layout.b760?.top ?? 0, layout.z790?.top ?? 0) -
        Math.min(layout.h610?.top ?? 0, layout.b760?.top ?? 0, layout.z790?.top ?? 0),
    ).toBeLessThanOrEqual(1);
    expect(layout.h610?.left ?? Number.POSITIVE_INFINITY).toBeLessThan(layout.b760?.left ?? 0);
    expect(layout.b760?.left ?? Number.POSITIVE_INFINITY).toBeLessThan(layout.z790?.left ?? 0);
    expect(layout.h810?.top ?? 0).toBeGreaterThan(layout.h610?.top ?? Number.POSITIVE_INFINITY);
    for (const dividerWidth of layout.dividerWidths) {
      expect(dividerWidth).toBeCloseTo(layout.firstGroupWidth ?? 0, 0);
    }
    for (const header of layout.headerLayouts) {
      expect(header.position).toBe("static");
      expect(header.width).toBeCloseTo(layout.firstGroupWidth ?? 0, 0);
      expect(header.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        header.firstOptionTop ?? 0,
      );
    }
    await expectNoHorizontalOverflow(page);
  }

  await chipsetFilter.getByRole("checkbox", { name: "H610" }).check();
  await chipsetFilter.getByRole("checkbox", { name: "W680" }).check();
  await chipsetFilter.getByRole("checkbox", { name: "WRX90" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:h610", "chipset:w680", "chipset:wrx90"]);
  await chipsetFilter.getByRole("checkbox", { name: "W680" }).uncheck();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:h610", "chipset:wrx90"]);
  await expect(chipsetFilter.locator(".facet-menu-popover")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("renders single-option facets as direct keyboard-operable controls @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=motherboard&page=10");

  const wifiControl = page.locator(".single-option-facet").filter({ hasText: "含 Wi-Fi" });
  const wifiCheckbox = wifiControl.getByRole("checkbox", { name: "含 Wi-Fi" });
  await expect(wifiControl).toBeVisible();
  await expect(page.locator(".facet-filter").filter({ hasText: "無線網路" })).toHaveCount(0);
  await expect(page.locator(".facet-menu-trigger").filter({ hasText: "無線網路" })).toHaveCount(0);
  await expect(wifiCheckbox).toHaveCSS("opacity", "0");
  await expect(wifiControl).toHaveCSS("min-height", "38px");
  await wifiCheckbox.focus();
  await expect(wifiCheckbox).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual(["wifi:yes"]);
  await expect(wifiControl).toHaveClass(/is-active/);
  const wifiActiveStyle = await wifiControl.evaluate((element) => {
    const styles = getComputedStyle(element);
    const indicator = getComputedStyle(element, "::before");
    return {
      background: styles.backgroundColor,
      border: styles.borderColor,
      indicatorBackground: indicator.backgroundColor,
      expectedBackground: getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-surface")
        .trim(),
      expectedIndicator: getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-strong")
        .trim(),
    };
  });
  expect(wifiActiveStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(wifiActiveStyle.border).not.toBe("");
  expect(wifiActiveStyle.indicatorBackground).not.toBe("rgba(0, 0, 0, 0)");
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect(page.getByRole("button", { name: "移除篩選：無線網路：含 Wi-Fi" })).toBeVisible();

  await switchCategory(page, "CPU", "cpu");
  await expect(page.locator(".single-option-facet")).toHaveCount(0);
  await expect(page.locator(".facet-filter").filter({ hasText: "內建顯示" })).toBeVisible();
  await switchCategory(page, "主機板", "motherboard");
  await expect(wifiCheckbox).toBeChecked();
  await wifiCheckbox.click();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);

  await wifiCheckbox.click();
  await page.getByRole("button", { name: "重設", exact: true }).click();
  await expect(wifiCheckbox).not.toBeChecked();
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);

  await switchCategory(page, "機殼", "case");
  await expect(page.locator(".single-option-facet").filter({ hasText: "支援背插" })).toBeVisible();
  await expect(page.locator(".single-option-facet").filter({ hasText: "含電源" })).toBeVisible();
  await expect(page.locator(".facet-filter").filter({ hasText: "支援主機板" })).toBeVisible();
});

test("keeps grouped facet popovers full-width and category memory usable on mobile @mobile-only", async ({
  page,
}) => {
  await page.goto("/?category=motherboard");

  await selectVendor(page, "ASUS");
  const chipsetFilter = page.locator(".facet-filter").filter({ hasText: "晶片組" });
  await chipsetFilter.locator(".facet-menu-trigger").click();
  const [popoverBox, menuBox] = await Promise.all([
    chipsetFilter.locator(".facet-menu-popover").boundingBox(),
    chipsetFilter.locator(".facet-menu").boundingBox(),
  ]);
  expect(popoverBox?.width).toBeCloseTo(menuBox?.width ?? 0, 0);
  await expect(chipsetFilter.locator(".facet-option-group")).toHaveCount(6);
  const groupBorders = await chipsetFilter
    .locator(".facet-option-group")
    .evaluateAll((elements) =>
      elements.map((element) => window.getComputedStyle(element).borderTopWidth),
    );
  expect(groupBorders).toEqual(["0px", "1px", "1px", "1px", "1px", "1px"]);
  await chipsetFilter.getByRole("checkbox", { name: "B760" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("facet"))
    .toEqual(["chipset:b760"]);
  await expectNoHorizontalOverflow(page);

  await chipsetFilter.locator(".facet-menu-trigger").click();
  const categoryPanel = page.locator(".filter-panel details");
  await categoryPanel.locator("summary").click();
  await switchCategory(page, "CPU", "cpu");
  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, {
    category: "motherboard",
    facets: ["chipset:b760"],
    vendors: "asus",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：ASUS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：晶片組：B760" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("keeps chipset and direct facet controls usable across responsive boundaries @responsive-boundary", async ({
  page,
}) => {
  const viewports = [
    { width: 1024, height: 800 },
    { width: 761, height: 844 },
    { width: 760, height: 844 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await test.step(`${viewport.width}px chipset controls`, async () => {
      await page.setViewportSize(viewport);
      await page.goto("/?category=motherboard");
      const wifiControl = page.locator(".single-option-facet").filter({ hasText: "含 Wi-Fi" });
      const wifiBox = await wifiControl.boundingBox();
      expect(wifiBox?.height ?? 0).toBeGreaterThanOrEqual(viewport.width <= 760 ? 44 : 38);

      const chipsetFilter = page.locator(".facet-filter").filter({ hasText: "晶片組" });
      await chipsetFilter.locator(".facet-menu-trigger").click();
      const popover = chipsetFilter.locator(".facet-menu-popover");
      const responsiveLayout = await popover.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const firstGroup = element.querySelector<HTMLElement>(".facet-option-group");
        return {
          columns: firstGroup
            ? window.getComputedStyle(firstGroup).gridTemplateColumns.split(" ").length
            : 0,
          left: rect.left,
          right: rect.right,
          scrollWidth: element.scrollWidth,
          width: element.clientWidth,
        };
      });
      expect(responsiveLayout.columns).toBe(viewport.width <= 760 ? 1 : 3);
      expect(responsiveLayout.left).toBeGreaterThanOrEqual(0);
      expect(responsiveLayout.right).toBeLessThanOrEqual(viewport.width);
      expect(responsiveLayout.scrollWidth).toBeLessThanOrEqual(responsiveLayout.width);
      const lastOption = chipsetFilter.getByRole("checkbox", { exact: true, name: "WRX90" });
      await lastOption.scrollIntoViewIfNeeded();
      await lastOption.check();
      await expect
        .poll(() => new URL(page.url()).searchParams.getAll("facet"))
        .toEqual(["chipset:wrx90"]);
      await expectNoHorizontalOverflow(page);
    });
  }
});

test("wraps a complete grouped CPU socket chip on mobile @mobile-only", async ({ page }) => {
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

async function selectVendor(page: Page, vendorName: string) {
  const vendorFilter = page.locator(".vendor-filter");
  if (!(await vendorFilter.locator(".vendor-menu-popover").isVisible())) {
    await vendorFilter.locator(".vendor-menu-trigger").click();
  }
  await expect(
    vendorFilter.getByRole("checkbox", { exact: true, name: vendorName }),
  ).not.toBeChecked();
  await vendorFilter.locator(".vendor-option").filter({ hasText: vendorName }).click();
  await vendorFilter.locator(".vendor-menu-trigger").click();
}

async function selectFacetOptions(page: Page, facetLabel: string, optionLabels: string[]) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const optionLabel of optionLabels) {
    await facetFilter.getByRole("checkbox", { exact: true, name: optionLabel }).check();
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
