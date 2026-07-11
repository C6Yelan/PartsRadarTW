// 驗證商品詳細頁的中性 not-found 與 clipboard-only 操作文案。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProductDetailActions from "../../app/products/[id]/detail/ProductDetailActions";
import { ProductDetailNotFoundState } from "../../app/products/[id]/product-detail";

describe("product detail copy", () => {
  it("uses neutral not-found wording without treating delisting as the primary cause", () => {
    const html = renderToStaticMarkup(<ProductDetailNotFoundState />);

    expect(html).toContain("找不到這項商品，或目前無法公開顯示");
    expect(html).not.toContain("下架");
  });

  it("labels the product action as copying a link", () => {
    const html = renderToStaticMarkup(
      <ProductDetailActions
        canIncreaseBuildListQuantity={true}
        currentBuildListQuantity={0}
        isProductLimitReached={false}
        productName="GPU RTX 4070"
        purchaseUrl="https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070"
        shareStatusMessage="已複製到剪貼簿"
        onAddToBuildList={() => undefined}
        onCopyLink={() => undefined}
        onDecreaseBuildListQuantity={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="複製商品連結"');
    expect(html).toContain("複製連結");
    expect(html).toContain("已複製到剪貼簿");
    expect(html).not.toContain(">分享<");
  });
});
