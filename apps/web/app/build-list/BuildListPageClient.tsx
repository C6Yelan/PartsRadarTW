"use client";

import Link from "next/link";
import SiteDisclaimer from "../site-disclaimer";
import {
  BUILD_LIST_EXCEL_MIME_TYPE,
  buildBuildListWorkbook,
  createBuildListExcelFilename,
} from "./excel";
import {
  BUILD_LIST_MAX_QUANTITY,
  getBuildListLineSubtotal,
  type BuildListItem,
} from "./model";
import { useBuildList } from "./use-build-list";

export default function BuildListPageClient() {
  const { clearItems, isReady, items, removeItem, summary, updateQuantity } = useBuildList();

  function downloadExcel() {
    const workbookBytes = buildBuildListWorkbook(items);
    const workbookBuffer = new ArrayBuffer(workbookBytes.byteLength);
    new Uint8Array(workbookBuffer).set(workbookBytes);
    const workbookBlob = new Blob([workbookBuffer], {
      type: BUILD_LIST_EXCEL_MIME_TYPE,
    });
    const downloadUrl = URL.createObjectURL(workbookBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = createBuildListExcelFilename();
    downloadLink.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
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
                  onQuantityChange={updateQuantity}
                  onRemove={removeItem}
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
                  <dd>{formatPrice(summary.totalAmount)}</dd>
                </div>
              </dl>

              <p>
                價格以網站最後收錄資料為準；實際商品資訊、價格、庫存、購買與售後仍以原價屋來源頁為準。
              </p>

              <div className="build-list-summary-actions">
                <button className="control-button primary" type="button" onClick={downloadExcel}>
                  下載 Excel
                </button>
                <Link className="control-button secondary" href="/build-list/print">
                  列印版
                </Link>
                <button className="control-button secondary" type="button" onClick={clearItems}>
                  清空配單
                </button>
              </div>
            </aside>
          </section>
        ) : null}
      </main>

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
  onRemove: (productId: string) => void;
}) {
  const subtotal = getBuildListLineSubtotal(item);

  return (
    <article className="build-list-item">
      <div className="build-list-item-main">
        <span className="detail-category-chip">{item.category.displayName}</span>
        <h2>{item.name}</h2>
        <dl className="build-list-item-facts">
          <div>
            <dt>目前價格</dt>
            <dd>{formatPrice(item.price.amount)}</dd>
          </div>
          <div>
            <dt>價格更新</dt>
            <dd>{formatDateTime(item.price.lastSeenAt)}</dd>
          </div>
          <div>
            <dt>小計</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
        </dl>
        <div className="build-list-links">
          <a href={item.source.url} rel="noreferrer" target="_blank">
            原價屋查看／購買
          </a>
          {item.introductionUrl ? (
            <a href={item.introductionUrl} rel="noreferrer" target="_blank">
              產品介紹
            </a>
          ) : null}
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
        <button className="build-list-remove-button" type="button" onClick={() => onRemove(item.id)}>
          移除
        </button>
      </div>
    </article>
  );
}

function formatPrice(amount: number) {
  return `NT$ ${new Intl.NumberFormat("zh-TW").format(amount)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
