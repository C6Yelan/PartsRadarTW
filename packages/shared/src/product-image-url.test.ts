// packages/shared/src/product-image-url.test.ts
// 驗證商品圖片 public API path 會維持 host-relative 並正規化 product id。

import { describe, expect, it } from "vitest";
import { createPublicProductImagePath } from "./product-image-url";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

describe("product image shared helpers", () => {
  it("builds the public product image API path", () => {
    // 圖片 helper 刻意回傳相對路徑，避免把特定部署 host 寫進 API response 或 smoke output。
    expect(createPublicProductImagePath(PRODUCT_ID.toUpperCase())).toBe(
      `/api/product-images/${PRODUCT_ID}.webp`,
    );
  });
});
