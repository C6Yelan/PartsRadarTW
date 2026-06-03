"use client";
// apps/web/app/build-list/BuildListPageClient.tsx

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SiteDisclaimer from "../site-disclaimer";
import {
  COOLPC_ESTIMATE_MAX_QUANTITY,
  COOLPC_IMPORT_INSTALL_PATH,
  type CoolpcEstimateImportPlan,
  createCoolpcEstimateImportPlan,
} from "./coolpc-import";
import {
  BUILD_LIST_EXCEL_MIME_TYPE,
  buildBuildListWorkbook,
  createBuildListExcelFilename,
} from "./excel";
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
  const { clearItems, isReady, items, removeItem, restoreItem, summary, updateQuantity } =
    useBuildList();
  const [removedItemNotice, setRemovedItemNotice] = useState<RemovedItemNotice | null>(null);
  const coolpcImportPlan = useMemo(() => createCoolpcEstimateImportPlan(items), [items]);

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

  function handleRemoveItem(item: BuildListItem) {
    removeItem(item.id);
    setRemovedItemNotice({
      id: Date.now(),
      item,
    });
  }

  function handleUndoRemove() {
    if (!removedItemNotice) {
      return;
    }

    restoreItem(removedItemNotice.item);
    setRemovedItemNotice(null);
  }

  function handleClearItems() {
    if (!window.confirm("確定要清空整份配單嗎？這會移除所有品項。")) {
      return;
    }

    clearItems();
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
                  onQuantityChange={updateQuantity}
                  onRemove={handleRemoveItem}
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

              <CoolpcImportPanel plan={coolpcImportPlan} />

              <div className="build-list-summary-actions">
                <div className="build-list-export-actions">
                  <button
                    className="control-button primary"
                    type="button"
                    onClick={downloadExcel}
                  >
                    下載 Excel
                  </button>
                  <Link className="control-button secondary" href="/build-list/print">
                    開啟列印 / PDF
                  </Link>
                </div>
                <button
                  className="control-button secondary"
                  type="button"
                  onClick={handleClearItems}
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
          <button type="button" onClick={handleUndoRemove}>
            復原
          </button>
        </div>
      ) : null}

      <SiteDisclaimer />
    </div>
  );
}

function CoolpcImportPanel({ plan }: { plan: CoolpcEstimateImportPlan }) {
  return (
    <section className="coolpc-import-panel" aria-label="原價屋估價頁帶入">
      <div className="coolpc-import-heading">
        <strong>帶入原價屋估價頁</strong>
        <span>僅支援電腦</span>
      </div>

      <p className="coolpc-import-desktop-copy">
        先安裝一次瀏覽器匯入工具，之後可把配單帶到原價屋官方估價頁；送出前請自行確認商品、數量與價格。
      </p>
      <p className="coolpc-import-mobile-copy">
        自動帶入原價屋估價頁目前僅支援電腦瀏覽器。
      </p>

      <div className="coolpc-import-actions">
        <a
          className="control-button secondary"
          href={COOLPC_IMPORT_INSTALL_PATH}
        >
          安裝匯入工具
        </a>
        <a
          aria-disabled={!plan.canImport}
          className={`control-button primary${plan.canImport ? "" : " is-disabled"}`}
          href={plan.importUrl ?? undefined}
          rel="noreferrer"
          tabIndex={plan.canImport ? undefined : -1}
          target="_blank"
        >
          帶入原價屋估價頁
        </a>
      </div>

      <CoolpcImportWarnings plan={plan} />
    </section>
  );
}

function CoolpcImportWarnings({ plan }: { plan: CoolpcEstimateImportPlan }) {
  const warnings = [
    plan.duplicateCategoryItems.length > 0
      ? `同分類多品項 ${plan.duplicateCategoryItems.length} 筆需在原價屋手動補上。`
      : null,
    plan.quantityClippedItems.length > 0
      ? `原價屋數量欄位最高 ${COOLPC_ESTIMATE_MAX_QUANTITY}，${plan.quantityClippedItems.length} 筆已先帶入上限。`
      : null,
    plan.unsupportedItems.length > 0
      ? `${plan.unsupportedItems.length} 筆商品缺少可辨識的原價屋估價代碼，需手動確認。`
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  if (warnings.length === 0) {
    return null;
  }

  return (
    <ul className="coolpc-import-warnings" aria-label="帶入限制">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
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

  return (
    <article className="build-list-item">
      <BuildListItemImage item={item} />
      <div className="build-list-item-main">
        <span className="detail-category-chip">{item.category.displayName}</span>
        <h2>{item.name}</h2>
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
          {item.introductionUrl ? (
            <a href={item.introductionUrl} rel="noreferrer" target="_blank">
              產品介紹
              <span className="build-list-link-icon" aria-hidden="true">
                ↗
              </span>
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
        <button className="build-list-remove-button" type="button" onClick={() => onRemove(item)}>
          移除
        </button>
      </div>
    </article>
  );
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
