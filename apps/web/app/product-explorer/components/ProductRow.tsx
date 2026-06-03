// apps/web/app/product-explorer/components/ProductRow.tsx
import Link from "next/link";
import { BUILD_LIST_MAX_QUANTITY } from "../../build-list/model";
import { formatPrice, formatSignedPercent, formatSignedPrice } from "../formatting";
import type { ProductListItem } from "../types";
import { ProductImage } from "./ProductImage";

interface ProductRowProps {
  buildListQuantity: number;
  detailHref: string;
  product: ProductListItem;
  onAddToBuildList(product: ProductListItem): void;
  onDecreaseBuildListQuantity(product: ProductListItem): void;
}

export function ProductRow({
  buildListQuantity,
  detailHref,
  product,
  onAddToBuildList,
  onDecreaseBuildListQuantity,
}: ProductRowProps) {
  const priceMovementIsEmpty = isPriceMovementEmpty(product.priceMovement);
  const isInBuildList = buildListQuantity > 0;
  const canIncreaseBuildListQuantity = buildListQuantity < BUILD_LIST_MAX_QUANTITY;

  return (
    <article className={`product-row${isInBuildList ? " is-in-build-list" : ""}`}>
      <ProductImage
        alt={product.image.alt}
        fallbackLabel={product.category.displayName}
        src={product.image.url}
      />
      <div className="product-main">
        <Link href={detailHref} title={product.name}>
          {product.name}
        </Link>
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
      <div className="table-cell row-build-list">
        <span className="cell-label">配單</span>
        {isInBuildList ? (
          <fieldset className="build-list-quantity-control">
            <legend className="sr-only">{product.name} 配單數量</legend>
            <button
              aria-label={
                buildListQuantity === 1
                  ? `從配單移除 ${product.name}`
                  : `減少 ${product.name} 的配單數量`
              }
              className="build-list-step-button"
              title={buildListQuantity === 1 ? "移除配單" : "減少數量"}
              type="button"
              onClick={() => onDecreaseBuildListQuantity(product)}
            >
              −
            </button>
            <span className="build-list-quantity-value">{buildListQuantity}</span>
            <button
              aria-label={`增加 ${product.name} 的配單數量`}
              className="build-list-step-button"
              disabled={!canIncreaseBuildListQuantity}
              title={
                canIncreaseBuildListQuantity
                  ? "增加數量"
                  : `最多 ${BUILD_LIST_MAX_QUANTITY} 件`
              }
              type="button"
              onClick={() => onAddToBuildList(product)}
            >
              +
            </button>
          </fieldset>
        ) : (
          <button
            className="build-list-add-button"
            type="button"
            onClick={() => onAddToBuildList(product)}
          >
            加入
          </button>
        )}
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
