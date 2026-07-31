// apps/web/tests/products/price-history-sampling-copy.test.tsx
// 驗證 sampled price history 明確降級統計文案，而 exact response 維持既有標示。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProductPriceHistoryBody } from "../../app/products/[id]/price-history/types";
import PriceHistoryPanel from "../../app/products/[id]/price-history-panel";

const points = [
  {
    amount: 6_000,
    observedAt: "2026-05-01T00:00:00.000Z",
    observationType: "price_snapshot" as const,
  },
  {
    amount: 5_000,
    observedAt: "2026-05-31T00:00:00.000Z",
    observationType: "price_snapshot" as const,
  },
];

describe("price history sampling copy", () => {
  it("describes bucket representatives and avoids exact-statistic labels", () => {
    const history: ProductPriceHistoryBody = {
      range: "all",
      rangeDays: null,
      points,
      sampling: {
        downsampled: true,
        strategy: "time_bucket_first_last",
        bucketCount: 126,
        pointLimit: 256,
      },
    };
    const html = renderToStaticMarkup(
      <PriceHistoryPanel
        history={history}
        selectedRange="all"
        state="ready"
        onRangeChange={() => undefined}
      />,
    );

    expect(html).toContain("每個時間分桶顯示首筆與末筆代表觀測");
    expect(html).toContain("代表觀測期間變動");
    expect(html).toContain("代表觀測最低");
    expect(html).toContain("代表觀測最高");
    expect(html).toContain("代表觀測均價");
    expect(html).toContain("代表觀測變價紀錄");
    expect(html).not.toContain(">區間平均<");
  });

  it("keeps exact-history labels unchanged when sampling metadata is absent", () => {
    const history: ProductPriceHistoryBody = {
      range: "30d",
      rangeDays: 30,
      points,
    };
    const html = renderToStaticMarkup(
      <PriceHistoryPanel
        history={history}
        selectedRange={30}
        state="ready"
        onRangeChange={() => undefined}
      />,
    );

    expect(html).not.toContain("資料已取樣");
    expect(html).toContain(">期間變動<");
    expect(html).toContain(">最低<");
    expect(html).toContain(">最高<");
    expect(html).toContain(">均價<");
    expect(html).toContain(">區間平均<");
    expect(html).toContain(">變價紀錄<");
  });
});
