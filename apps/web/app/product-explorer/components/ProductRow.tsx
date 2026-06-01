import Link from "next/link";
import { formatPrice } from "../formatting";
import type { ProductListItem } from "../types";
import { ProductImage } from "./ProductImage";

interface ProductRowProps {
  detailHref: string;
  product: ProductListItem;
}

export function ProductRow({ detailHref, product }: ProductRowProps) {
  return (
    <article className="product-row">
      <ProductImage
        alt={product.image.alt}
        fallbackLabel={product.category.displayName}
        src={product.image.url}
      />
      <div className="product-main">
        <Link href={detailHref}>{product.name}</Link>
      </div>
      <div className="table-cell row-price">
        <span className="cell-label">目前價格</span>
        <strong>{formatPrice(product.price.amount)}</strong>
      </div>
      <div className="table-cell row-status">
        <span className="cell-label">上架狀態</span>
        <span className={product.status.isActive ? "row-state ok" : "row-state warning"}>
          {product.status.isActive ? "目前上架" : "可能已下架"}
        </span>
      </div>
    </article>
  );
}
