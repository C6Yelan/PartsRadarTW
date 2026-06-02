import Link from "next/link";
import { formatPrice, formatSignedPercent, formatSignedPrice } from "../formatting";
import type { ProductListItem } from "../types";
import { ProductImage } from "./ProductImage";

interface ProductRowProps {
  detailHref: string;
  product: ProductListItem;
}

export function ProductRow({ detailHref, product }: ProductRowProps) {
  const priceMovementIsEmpty = isPriceMovementEmpty(product.priceMovement);

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
      <div className={`table-cell row-movement${priceMovementIsEmpty ? " is-empty" : ""}`}>
        <span className="cell-label">近 {product.priceMovement.rangeDays} 天</span>
        <span className={`price-movement ${getPriceMovementTone(product.priceMovement)}`}>
          {formatPriceMovement(product.priceMovement)}
        </span>
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

function formatPriceMovement(movement: ProductListItem["priceMovement"]) {
  const deltaAmount = movement.deltaAmount;

  if (deltaAmount === null || deltaAmount === 0) {
    return "-";
  }

  if (movement.deltaPercent === null) {
    return formatSignedPrice(deltaAmount);
  }

  return `${formatSignedPrice(deltaAmount)} / ${formatSignedPercent(
    movement.deltaPercent,
  )}`;
}

function getPriceMovementTone(movement: ProductListItem["priceMovement"]) {
  const deltaAmount = movement.deltaAmount;

  if (deltaAmount === null || deltaAmount === 0) {
    return "is-flat";
  }

  return deltaAmount < 0 ? "is-down" : "is-up";
}

function isPriceMovementEmpty(movement: ProductListItem["priceMovement"]) {
  return movement.deltaAmount === null || movement.deltaAmount === 0;
}
