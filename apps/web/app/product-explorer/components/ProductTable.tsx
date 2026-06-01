import { createProductDetailHref } from "../query-state";
import type { LoadState, ProductsResponse } from "../types";
import { ProductRow } from "./ProductRow";
import { SkeletonRows } from "./SkeletonRows";

interface ProductTableProps {
  productListReturnTo: string;
  products: ProductsResponse | null;
  productState: LoadState;
}

export function ProductTable({ productListReturnTo, products, productState }: ProductTableProps) {
  return (
    <div className="product-table">
      <div className="table-header">
        <span aria-hidden="true" />
        <span>商品</span>
        <span>目前價格</span>
        <span>上架狀態</span>
      </div>

      {productState === "loading" || productState === "idle" ? <SkeletonRows /> : null}

      {productState === "error" ? (
        <div className="empty-state" role="alert">
          <h2>商品資料暫時無法載入</h2>
          <p>請稍後重新整理頁面再試一次。</p>
        </div>
      ) : null}

      {productState === "ready" && products?.data.length === 0 ? (
        <div className="empty-state">
          <h2>找不到相關商品</h2>
          <p>請調整關鍵字、分類或價格範圍後再試一次。</p>
        </div>
      ) : null}

      {productState === "ready"
        ? products?.data.map((product) => (
            <ProductRow
              detailHref={createProductDetailHref(product.id, productListReturnTo)}
              key={product.id}
              product={product}
            />
          ))
        : null}
    </div>
  );
}
