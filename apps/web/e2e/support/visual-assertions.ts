// apps/web/e2e/support/visual-assertions.ts
// 集中多個視覺規格共用、無狀態的 URL、viewport 與 overflow assertions。

import { expect, type Page, type TestInfo } from "@playwright/test";

export async function expectQueryFilters(
  page: Page,
  expected: { category: string; facets: string[]; vendors: string | null },
) {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        category: url.pathname.startsWith("/categories/")
          ? url.pathname.slice("/categories/".length)
          : null,
        facets: url.searchParams.getAll("facet"),
        vendors: url.searchParams.get("vendors"),
      };
    })
    .toEqual(expected);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  return dimensions;
}

export async function expectUsableLayout(page: Page, testInfo: TestInfo) {
  const viewport = expectedViewport(testInfo.project.name);
  expect(page.viewportSize()).toEqual(viewport);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expectFocusedControlToBeVisible(page);
  await expectNoHorizontalOverflow(page);
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

    let element: HTMLElement | null = focusedElement;
    while (element) {
      const styles = window.getComputedStyle(element);
      if (styles.outlineStyle !== "none" || styles.boxShadow !== "none") {
        return true;
      }
      element = element.parentElement;
    }

    return false;
  });

  expect(hasVisibleFocusIndicator).toBe(true);
}
