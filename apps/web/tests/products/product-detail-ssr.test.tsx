// apps/web/tests/products/product-detail-ssr.test.tsx
// 驗證商品頁 client 介面能以 server 提供的初始資料輸出 crawler 可讀核心 HTML。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProductDetailBody } from "../../app/products/[id]/detail/types";
import ProductDetail from "../../app/products/[id]/product-detail";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

describe("product detail initial HTML", () => {
  it("renders public product facts and the existing disclaimer without client JavaScript", () => {
    const html = renderToStaticMarkup(
      <ProductDetail initialProduct={product()} productId={PRODUCT_ID} returnHref="/" />,
    );

    expect(html).toContain("GPU RTX 4070");
    expect(html).toContain("顯示卡");
    expect(html).toContain("NT$ 6,990");
    expect(html).toContain("2026-07-10 16:00");
    expect(html).toContain("目前上架");
    expect(html).toContain("資料來源");
    expect(html).toContain("原價屋公開頁面");
    expect(html).toContain("PartsRadarTW 是非官方的商品搜尋與價格整理工具");
    expect(html).toContain("實際商品資訊、價格、庫存、購買與售後服務以來源頁為準");
    expect(html).not.toContain('aria-label="商品載入中"');
  });
});

function product(): ProductDetailBody {
  return {
    id: PRODUCT_ID,
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
  };
}
