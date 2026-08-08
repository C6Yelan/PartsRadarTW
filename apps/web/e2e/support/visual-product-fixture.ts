// apps/web/e2e/support/visual-product-fixture.ts
// 集中定義 mocked browser suite 與隔離 SSR seed 共用的商品資料。

export const VISUAL_PRODUCT_FIXTURE = {
  id: "11111111-1111-4111-8111-111111111111",
  category: {
    id: "33333333-3333-4333-8333-333333333333",
    igrp: 12,
    displayName: "顯示卡",
    sourceName: "顯示卡 VGA",
  },
  name: "視覺驗證顯示卡 RTX",
  amount: 18_990,
  observedAt: "2026-07-10T08:00:00.000Z",
} as const;
