// apps/web/tests/products/price-history-format.test.ts
// 驗證商品價格歷史輔助文字使用一致台幣格式與固定台灣時間。

import { describe, expect, it } from "vitest";

import { getPointAriaLabel } from "../../app/products/[id]/price-history/format";

describe("price history formatting", () => {
  it("formats chart point labels across a Taipei date boundary", () => {
    expect(
      getPointAriaLabel({
        amount: 6990,
        key: "point-1",
        observationType: "price_snapshot",
        observedAt: "2026-05-28T16:05:00.000Z",
        percentChange: 0,
        x: 0,
        y: 0,
      }),
    ).toBe("價格變動，05/29 00:05，NT$ 6,990");
  });
});
