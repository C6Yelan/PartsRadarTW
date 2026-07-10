// apps/web/app/products/[id]/detail/ProductDetailFacts.tsx
// 顯示商品詳細頁的目前價格、資料更新時間與上架狀態摘要。

import { formatProductDateTime, formatProductPrice } from "./format";
import type { ProductDetailBody } from "./types";

// 組裝商品詳細頁的核心資料區塊，並在商品未出現在來源列表時顯示低干擾提醒。
export default function ProductDetailFacts({ product }: { product: ProductDetailBody }) {
  return (
    <>
      {!product.status.isActive ? (
        <div className="quiet-alert warning" role="status">
          這項商品目前未在來源頁面看到，可能已下架或暫時無法確認。
        </div>
      ) : null}

      <div className="price-block">
        <span>目前價格</span>
        <strong>{formatProductPrice(product.price.amount)}</strong>
      </div>

      <dl className="detail-facts">
        <div>
          <dt>價格資料更新</dt>
          <dd>{formatProductDateTime(product.price.lastSeenAt)}</dd>
        </div>
        {!product.status.isActive ? (
          <div>
            <dt>最後在原價屋看到</dt>
            <dd>{formatProductDateTime(product.lastSeenAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt>上架狀態</dt>
          <dd>{product.status.isActive ? "目前上架" : "可能已下架"}</dd>
        </div>
      </dl>
    </>
  );
}
