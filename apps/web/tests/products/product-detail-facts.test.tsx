// apps/web/tests/products/product-detail-facts.test.tsx
// 驗證商品詳細頁以 crawler availability 顯示保守提示，不再依賴連結檢查資料。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProductDetailFacts from "../../app/products/[id]/detail/ProductDetailFacts";
import type { ProductDetailBody } from "../../app/products/[id]/detail/types";

describe("ProductDetailFacts", () => {
  it("shows a conservative availability notice for inactive products", () => {
    const html = renderToStaticMarkup(
      <ProductDetailFacts
        product={product({
          status: {
            isActive: false,
            isExcluded: false,
            exclusionReason: null,
          },
        })}
      />,
    );

    expect(html).toContain("這項商品目前未在來源頁面看到，可能已下架或暫時無法確認。");
    expect(html).toContain("最後在原價屋看到");
  });

  it("shows an exclusion notice without presenting the product as delisted", () => {
    const html = renderToStaticMarkup(
      <ProductDetailFacts
        product={product({
          status: {
            isActive: true,
            isExcluded: true,
            exclusionReason: "misclassified_bundle_product",
          },
        })}
      />,
    );

    expect(html).toContain("此項目為搭購商品或不屬於目前分類，因此未納入列表。");
    expect(html).toContain("未納入列表");
    expect(html).not.toContain("可能已下架");
    expect(html).not.toContain("最後在原價屋看到");
  });

  it("does not show the availability notice for active products", () => {
    const html = renderToStaticMarkup(<ProductDetailFacts product={product()} />);

    expect(html).not.toContain("可能已下架或暫時無法確認");
    expect(html).not.toContain("最後在原價屋看到");
    expect(html).toContain("目前上架");
    expect(html).toContain("NT$ 6,990");
    expect(html).toContain("2026-07-10 16:00");
  });
});

function product(overrides: Partial<ProductDetailBody> = {}): ProductDetailBody {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "GPU RTX 4070",
    category: {
      id: "category-12",
      igrp: 12,
      displayName: "顯示卡",
      sourceName: "顯示卡 VGA",
    },
    image: null,
    price: {
      amount: 6990,
      currency: "TWD",
      capturedAt: "2026-07-10T07:30:00.000Z",
      lastSeenAt: "2026-07-10T08:00:00.000Z",
    },
    source: {
      name: "coolpc",
      url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    },
    status: {
      isActive: true,
      isExcluded: false,
      exclusionReason: null,
    },
    lastSeenAt: "2026-07-10T08:00:00.000Z",
    ...overrides,
  };
}
