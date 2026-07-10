// apps/web/e2e/support/images.ts
// 等待 lazy-loaded 圖片取得有效內容，供 smoke 與視覺證據測試共用。

import { expect, type Locator } from "@playwright/test";

export async function expectImagesLoaded(images: Locator) {
  const imageCount = await images.count();
  expect(imageCount).toBeGreaterThan(0);

  for (let index = 0; index < imageCount; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element) =>
            element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
}
