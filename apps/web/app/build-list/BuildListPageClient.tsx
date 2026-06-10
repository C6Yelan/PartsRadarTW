"use client";
// apps/web/app/build-list/BuildListPageClient.tsx

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteDisclaimer from "../site-disclaimer";
import { downloadBuildListExcel } from "./download";
import { formatBuildListDateTime, formatBuildListPrice } from "./formatting";
import {
  BUILD_LIST_MAX_QUANTITY,
  getBuildListLineSubtotal,
  type BuildListItem,
} from "./model";
import { useBuildList } from "./use-build-list";

const UNDO_TOAST_DURATION_MS = 7000;

interface RemovedItemNotice {
  id: number;
  item: BuildListItem;
}

export default function BuildListPageClient() {
  const {
    clearBuildListItems,
    isReady,
    items,
    removeBuildListItem,
    restoreBuildListItem,
    summary,
    setBuildListItemQuantity,
  } = useBuildList();
  const [removedItemNotice, setRemovedItemNotice] = useState<RemovedItemNotice | null>(null);

  useEffect(() => {
    if (!removedItemNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRemovedItemNotice((currentNotice) =>
        currentNotice?.id === removedItemNotice.id ? null : currentNotice,
      );
    }, UNDO_TOAST_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [removedItemNotice]);

  function downloadExcel() {
    downloadBuildListExcel(items);
  }

  function handleRemoveBuildListItem(item: BuildListItem) {
    removeBuildListItem(item.id);
    setRemovedItemNotice({
      id: Date.now(),
      item,
    });
  }

  function handleUndoRemoveBuildListItem() {
    if (!removedItemNotice) {
      return;
    }

    restoreBuildListItem(removedItemNotice.item);
    setRemovedItemNotice(null);
  }

  function handleClearBuildListItems() {
    if (!window.confirm("確定要清空整份配單嗎？這會移除所有品項。")) {
      return;
    }

    clearBuildListItems();
    setRemovedItemNotice(null);
  }

  return (
    <div className="app-shell build-list-shell">
      <header className="topbar build-list-topbar">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>

        <div className="build-list-title">
          <h1>配單</h1>
          <span>{summary.totalQuantity} 件商品</span>
        </div>

        <Link className="back-link build-list-back-link" href="/">
          返回查詢
        </Link>
      </header>

      <main className="build-list-page" aria-label="配單內容">
        {!isReady ? (
          <section className="detail-loading" aria-label="配單載入中">
            <span className="skeleton-box wide" />
            <span className="skeleton-box medium" />
            <span className="skeleton-box short" />
          </section>
        ) : null}

        {isReady && items.length === 0 ? (
          <section className="build-list-empty">
            <h2>配單目前沒有品項</h2>
            <p>從商品列表或商品詳細頁加入品項後，這裡會保留數量、小計與總價。</p>
            <Link className="control-button primary" href="/">
              回到查詢
            </Link>
          </section>
        ) : null}

        {isReady && items.length > 0 ? (
          <section className="build-list-layout">
            <section className="build-list-items" aria-label="配單品項">
              {items.map((item) => (
                <BuildListItemRow
                  item={item}
                  key={item.id}
                  onQuantityChange={setBuildListItemQuantity}
                  onRemove={handleRemoveBuildListItem}
                />
              ))}
            </section>

            <aside className="build-list-summary" aria-label="配單總計">
              <dl>
                <div>
                  <dt>品項</dt>
                  <dd>{summary.itemCount}</dd>
                </div>
                <div>
                  <dt>數量</dt>
                  <dd>{summary.totalQuantity}</dd>
                </div>
                <div className="build-list-total-row">
                  <dt>總價</dt>
                  <dd>{formatBuildListPrice(summary.totalAmount)}</dd>
                </div>
              </dl>

              <p>
                價格以網站最後收錄資料為準；實際商品資訊、價格、庫存、購買與售後仍以原價屋來源頁為準。
              </p>

              <div className="build-list-summary-actions">
                <button
                  className="control-button primary"
                  type="button"
                  onClick={downloadExcel}
                >
                  下載 Excel
                </button>
                <button
                  className="control-button secondary"
                  type="button"
                  onClick={handleClearBuildListItems}
                >
                  清空配單
                </button>
              </div>
            </aside>
          </section>
        ) : null}
      </main>

      {removedItemNotice ? (
        <div className="build-list-undo-toast" role="status" aria-live="polite">
          <span className="build-list-undo-toast-text">
            <span>已從配單移除</span>
            <strong>{removedItemNotice.item.name}</strong>
          </span>
          <button type="button" onClick={handleUndoRemoveBuildListItem}>
            復原
          </button>
        </div>
      ) : null}

      <SiteDisclaimer />
    </div>
  );
}

function BuildListItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: BuildListItem;
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (item: BuildListItem) => void;
}) {
  const subtotal = getBuildListLineSubtotal(item);
  const detailHref = createBuildListProductDetailHref(item.id);

  return (
    <article className="build-list-item">
      <Link
        aria-label={`查看 ${item.name} 商品詳細`}
        className="build-list-item-image-link"
        href={detailHref}
      >
        <BuildListItemImage item={item} />
      </Link>
      <div className="build-list-item-main">
        <span className="detail-category-chip">{item.category.displayName}</span>
        <h2>
          <Link className="build-list-item-title-link" href={detailHref} title={item.name}>
            {item.name}
          </Link>
        </h2>
        <dl className="build-list-item-facts">
          <div>
            <dt>目前價格</dt>
            <dd>{formatBuildListPrice(item.price.amount)}</dd>
          </div>
          <div>
            <dt>價格更新</dt>
            <dd>{formatBuildListDateTime(item.price.lastSeenAt)}</dd>
          </div>
          <div>
            <dt>小計</dt>
            <dd>{formatBuildListPrice(subtotal)}</dd>
          </div>
        </dl>
        <div className="build-list-links">
          <a href={item.source.url} rel="noreferrer" target="_blank">
            原價屋查看／購買
            <span className="build-list-link-icon" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      </div>

      <div className="build-list-item-controls">
        <fieldset className="quantity-stepper">
          <legend className="sr-only">{item.name} 數量</legend>
          <button
            aria-label="減少數量"
            disabled={item.quantity <= 1}
            type="button"
            onClick={() => onQuantityChange(item.id, item.quantity - 1)}
          >
            -
          </button>
          <input
            aria-label="數量"
            inputMode="numeric"
            max={BUILD_LIST_MAX_QUANTITY}
            min={1}
            type="number"
            value={item.quantity}
            onChange={(event) => onQuantityChange(item.id, Number(event.target.value))}
          />
          <button
            aria-label="增加數量"
            disabled={item.quantity >= BUILD_LIST_MAX_QUANTITY}
            type="button"
            onClick={() => onQuantityChange(item.id, item.quantity + 1)}
          >
            +
          </button>
        </fieldset>
        <button className="build-list-remove-button" type="button" onClick={() => onRemove(item)}>
          移除
        </button>
      </div>
    </article>
  );
}

function createBuildListProductDetailHref(productId: string) {
  const params = new URLSearchParams({
    returnTo: "/build-list",
  });

  return `/products/${productId}?${params.toString()}`;
}

function BuildListItemImage({ item }: { item: BuildListItem }) {
  const [hasError, setHasError] = useState(false);

  if (!item.image || hasError) {
    return (
      <div
        className="build-list-item-image fallback"
        aria-label={`${item.category.displayName}圖片暫時無法顯示`}
        role="img"
      >
        <span className="image-fallback-copy">
          <strong>無圖</strong>
          <small>{item.category.displayName}</small>
        </span>
      </div>
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: Product images are served by the local API; plain img keeps the fallback path direct.
    <img
      alt={item.image.alt}
      className="build-list-item-image"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={item.image.url}
      onContextMenu={(event) => event.preventDefault()}
      onError={() => setHasError(true)}
    />
  );
}
