// apps/web/e2e/visual-product-explorer-state.spec.ts
// 以本地 mock API 驗證商品探索器的 reset、category memory、URL 與 reload precedence。

import { expect, type Page, test } from "@playwright/test";
import { expectQueryFilters } from "./support/visual-assertions";
import {
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
});

test("switches both movement sorts with stable filters and resets pagination @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  const requests: URL[] = [];
  page.on("request", (request) => {
    if (/\/api\/products(?:\?|$)/.test(request.url())) requests.push(new URL(request.url()));
  });
  await page.goto("/?category=gpu&q=rise&status=all&page=3");
  await expect
    .poll(() => {
      const request = requests.at(-1);
      return request
        ? {
            page: request.searchParams.get("page"),
            q: request.searchParams.get("q"),
            status: request.searchParams.get("status"),
          }
        : null;
    })
    .toEqual({ page: "3", q: "rise", status: "all" });

  const sort = page.getByRole("combobox", { name: "排序" });
  await sort.selectOption("price_drop_desc");
  await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("price_drop_desc");
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("sort"))
    .toBe("price_drop_desc");
  await expectQueryFilters(page, { category: "gpu", facets: [], vendors: null });
  await expect(page.locator(".price-movement").first()).toContainText("−NT$ 300 / −4.8%");

  await sort.selectOption("price_rise_desc");
  await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("price_rise_desc");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("sort"))
    .toBe("price_rise_desc");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("rise");
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBe("all");
  await expect(page.locator(".price-movement").first()).toContainText("+NT$ 300 / +4.8%");
});

test("resets vendor, grouped facets, status, and page together @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "AMD");
  await selectFacetOptions(page, "腳位", ["LGA 1851", "LGA 1700"]);
  await selectFacetOptions(page, "產品系列", ["Intel Core i5"]);
  await page.getByRole("button", { name: "可能已下架" }).click();
  const selectedUrl = new URL(page.url());
  selectedUrl.searchParams.set("page", "10");
  await page.goto(`${selectedUrl.pathname}${selectedUrl.search}`);

  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("10");
  await expect(page.locator(".active-filter-chip")).toHaveCount(3);
  await page.getByRole("button", { name: "重設", exact: true }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get("vendors")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("facet")).toEqual([]);
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "目前上架" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "可能已下架" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "全部廠商" }).click();
  await expect(page.getByRole("checkbox", { name: "Intel" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "AMD" })).not.toBeChecked();
  await page.getByRole("button", { name: "全部廠商" }).click();
  await assertFacetOptionsUnchecked(page, "腳位", ["LGA 1851", "LGA 1700"]);
  await assertFacetOptionsUnchecked(page, "產品系列", ["Intel Core i5"]);

  await page.getByRole("button", { name: "全部商品" }).click();
  const summaryRow = page.locator(".active-filter-summary-row");
  await expect(summaryRow).toBeVisible();
  await expect(summaryRow.getByRole("group", { name: "已選篩選條件" })).toHaveCount(0);
  await expect(summaryRow.getByRole("button", { name: "重設", exact: true })).toBeVisible();
});

test("keeps the header search independent from list filter reset @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  const searchInput = page.getByRole("searchbox", { name: "搜尋商品名稱" });
  await expect(searchInput).toHaveAttribute("autocomplete", "off");
  await expect(searchInput).not.toHaveAttribute("list", /.+/);
  await expect(
    page.locator(".topbar-search datalist, .topbar-search [role='listbox']"),
  ).toHaveCount(0);

  await searchInput.fill("intel");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("intel");
  await expect(page.getByRole("button", { name: "重設", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "全部商品" }).click();
  const resetButton = page.getByRole("button", { name: "重設", exact: true });
  await expect(resetButton).toBeVisible();
  await searchInput.fill("intel core");
  await resetButton.click();

  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("intel");
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBeNull();
  await expect(searchInput).toHaveValue("intel core");
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);

  await page.getByRole("button", { name: "清除搜尋字詞" }).click();
  await expect(searchInput).toHaveValue("");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
});

test("remembers vendor and facet filters independently per category @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await page.getByRole("searchbox", { name: "搜尋商品名稱" }).fill("遊戲主機");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await page.getByRole("textbox", { name: "最低價格" }).fill("1000");
  await page.getByRole("textbox", { name: "最高價格" }).fill("20000");
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        maxPrice: url.searchParams.get("maxPrice"),
        minPrice: url.searchParams.get("minPrice"),
      };
    })
    .toEqual({ maxPrice: "20000", minPrice: "1000" });
  await page.getByRole("button", { name: "全部商品" }).click();
  await page.getByRole("combobox", { name: "排序" }).selectOption("price_desc");
  await page.getByRole("combobox", { name: "每頁顯示" }).selectOption("50");
  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "腳位", ["LGA 1700"]);
  await selectFacetOptions(page, "產品系列", ["Intel Core i5"]);

  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700", "cpu_family:core-i5"],
    vendors: "intel",
  });
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        maxPrice: url.searchParams.get("maxPrice"),
        minPrice: url.searchParams.get("minPrice"),
        pageSize: url.searchParams.get("pageSize"),
        q: url.searchParams.get("q"),
        sort: url.searchParams.get("sort"),
        status: url.searchParams.get("status"),
      };
    })
    .toEqual({
      maxPrice: "20000",
      minPrice: "1000",
      pageSize: "50",
      q: "遊戲主機",
      sort: "price_desc",
      status: "all",
    });

  await page.getByRole("textbox", { name: "跳至" }).fill("10");
  await page.getByRole("button", { name: "前往" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("10");

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull();
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        maxPrice: url.searchParams.get("maxPrice"),
        minPrice: url.searchParams.get("minPrice"),
        pageSize: url.searchParams.get("pageSize"),
        q: url.searchParams.get("q"),
        sort: url.searchParams.get("sort"),
        status: url.searchParams.get("status"),
      };
    })
    .toEqual({
      maxPrice: "20000",
      minPrice: "1000",
      pageSize: "50",
      q: "遊戲主機",
      sort: "price_desc",
      status: "all",
    });

  await selectVendor(page, "ASUS");
  await selectFacetOptions(page, "腳位", ["AM5"]);
  await selectFacetOptions(page, "晶片組", ["B650"]);
  await expectQueryFilters(page, {
    category: "motherboard",
    facets: ["socket:am5", "chipset:b650"],
    vendors: "asus",
  });

  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700", "cpu_family:core-i5"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "移除篩選：產品系列：Intel Core i5" }),
  ).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText(/ASUS|AM5|B650/);
  await assertVendorCheckboxStates(page, { checked: ["Intel"], absent: ["ASUS"] });
  await assertFacetCheckboxStates(page, "腳位", { checked: ["LGA 1700"], unchecked: ["AM5"] });
  await assertFacetCheckboxStates(page, "產品系列", { checked: ["Intel Core i5"] });

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, {
    category: "motherboard",
    facets: ["socket:am5", "chipset:b650"],
    vendors: "asus",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：ASUS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：AM5" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：晶片組：B650" })).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText(/Intel|LGA 1700|Core i5/);
  await assertVendorCheckboxStates(page, { checked: ["ASUS"], absent: ["Intel"] });
  await assertFacetCheckboxStates(page, "腳位", { checked: ["AM5"], unchecked: ["LGA 1700"] });
  await assertFacetCheckboxStates(page, "晶片組", { checked: ["B650"] });
});

test("reset clears only the current category memory @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "腳位", ["LGA 1700"]);
  await switchCategory(page, "主機板", "motherboard");
  await selectVendor(page, "ASUS");
  await selectFacetOptions(page, "晶片組", ["B650"]);
  await page.getByRole("button", { name: "可能已下架" }).click();

  await page.getByRole("button", { name: "重設", exact: true }).click();
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBeNull();
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await assertVendorCheckboxStates(page, { unchecked: ["ASUS", "MSI"] });
  await assertFacetCheckboxStates(page, "晶片組", { unchecked: ["B650"] });

  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await assertVendorCheckboxStates(page, { unchecked: ["ASUS", "MSI"] });
  await assertFacetCheckboxStates(page, "晶片組", { unchecked: ["B650"] });
});

test("keeps URL and popstate filters ahead of category memory @desktop-only", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu");

  await selectVendor(page, "Intel");
  await selectFacetOptions(page, "腳位", ["LGA 1700"]);
  await switchCategory(page, "主機板", "motherboard");

  await page.evaluate(() => {
    window.history.pushState(null, "", "/?category=cpu&facet=socket%3Aam5&vendors=amd");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:am5"],
    vendors: "amd",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：AMD" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：AM5" })).toBeVisible();
  await expect(page.locator(".active-filter-chips")).not.toContainText(/Intel|LGA 1700/);
  await assertVendorCheckboxStates(page, { checked: ["AMD"], unchecked: ["Intel"] });
  await assertFacetCheckboxStates(page, "腳位", { checked: ["AM5"], unchecked: ["LGA 1700"] });

  await switchCategory(page, "主機板", "motherboard");
  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:am5"],
    vendors: "amd",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：AMD" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：AM5" })).toBeVisible();
});

test("uses the initial URL and drops other category memory after reload @desktop-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1760, height: 900 });
  await page.goto("/?category=cpu&facet=socket%3Alga1700&vendors=intel");

  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除篩選：腳位：LGA 1700" })).toBeVisible();

  await switchCategory(page, "主機板", "motherboard");
  await selectVendor(page, "ASUS");
  await selectFacetOptions(page, "晶片組", ["B650"]);
  await switchCategory(page, "CPU", "cpu");
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });

  await page.reload();
  await expectQueryFilters(page, {
    category: "cpu",
    facets: ["socket:lga1700"],
    vendors: "intel",
  });
  await expect(page.getByRole("button", { name: "移除篩選：廠商：Intel" })).toBeVisible();

  await switchCategory(page, "主機板", "motherboard");
  await expectQueryFilters(page, { category: "motherboard", facets: [], vendors: null });
  await expect(page.locator(".active-filter-summary-row")).toHaveCount(0);
  await assertVendorCheckboxStates(page, { unchecked: ["ASUS", "MSI"] });
  await assertFacetCheckboxStates(page, "晶片組", { unchecked: ["B650"] });
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

async function assertFacetOptionsUnchecked(page: Page, facetLabel: string, optionLabels: string[]) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const optionLabel of optionLabels) {
    await expect(
      facetFilter.getByRole("checkbox", { exact: true, name: optionLabel }),
    ).not.toBeChecked();
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

async function assertVendorCheckboxStates(
  page: Page,
  expected: { checked?: string[]; unchecked?: string[]; absent?: string[] },
) {
  const vendorFilter = page.locator(".vendor-filter");
  await vendorFilter.locator(".vendor-menu-trigger").click();
  for (const vendor of expected.checked ?? []) {
    await expect(vendorFilter.getByRole("checkbox", { exact: true, name: vendor })).toBeChecked();
  }
  for (const vendor of expected.unchecked ?? []) {
    await expect(
      vendorFilter.getByRole("checkbox", { exact: true, name: vendor }),
    ).not.toBeChecked();
  }
  for (const vendor of expected.absent ?? []) {
    await expect(vendorFilter.getByRole("checkbox", { exact: true, name: vendor })).toHaveCount(0);
  }
  await vendorFilter.locator(".vendor-menu-trigger").click();
}

async function assertFacetCheckboxStates(
  page: Page,
  facetLabel: string,
  expected: { checked?: string[]; unchecked?: string[] },
) {
  const facetFilter = page.locator(".facet-filter").filter({ hasText: facetLabel });
  await facetFilter.locator(".facet-menu-trigger").click();
  for (const option of expected.checked ?? []) {
    await expect(facetFilter.getByRole("checkbox", { exact: true, name: option })).toBeChecked();
  }
  for (const option of expected.unchecked ?? []) {
    await expect(
      facetFilter.getByRole("checkbox", { exact: true, name: option }),
    ).not.toBeChecked();
  }
  await facetFilter.locator(".facet-menu-trigger").click();
}
