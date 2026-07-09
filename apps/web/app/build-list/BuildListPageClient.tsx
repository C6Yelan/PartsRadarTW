"use client";
// apps/web/app/build-list/BuildListPageClient.tsx
// 組裝配單頁的 client-side 狀態、品項列表、摘要側欄、Excel 匯出與移除復原流程。

import Link from "next/link";
import { useEffect, useState } from "react";
import DiscordTopbarLink from "../DiscordTopbarLink";
import SiteDisclaimer from "../site-disclaimer";
import BuildListEmptyState from "./components/BuildListEmptyState";
import BuildListItemRow from "./components/BuildListItemRow";
import BuildListLoadingState from "./components/BuildListLoadingState";
import BuildListSummaryPanel from "./components/BuildListSummaryPanel";
import BuildListUndoToast from "./components/BuildListUndoToast";
import { downloadBuildListExcel } from "./download";
import type { BuildListItem } from "./model";
import { useBuildList } from "./use-build-list";

const UNDO_TOAST_DURATION_MS = 7000;

interface RemovedItemNotice {
  id: number;
  item: BuildListItem;
}

// 呈現配單頁主要互動區塊，將 localStorage 配單狀態分派給列表、摘要與 undo toast。
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
        <div className="topbar-brand-area">
          <Link className="brand-lockup" href="/">
            <span className="brand-mark" aria-hidden="true" />
            <span>
              <span className="brand-name">PartsRadarTW</span>
              <span className="brand-subtitle">原價屋零件查詢</span>
            </span>
          </Link>
          <DiscordTopbarLink />
        </div>

        <div className="build-list-title">
          <h1>配單</h1>
          <span>{summary.totalQuantity} 件商品</span>
        </div>

        <Link className="back-link build-list-back-link" href="/">
          返回查詢
        </Link>
      </header>

      <main className="build-list-page" aria-label="配單內容">
        {!isReady ? <BuildListLoadingState /> : null}

        {isReady && items.length === 0 ? <BuildListEmptyState /> : null}

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

            <BuildListSummaryPanel
              summary={summary}
              onClear={handleClearBuildListItems}
              onDownloadExcel={downloadExcel}
            />
          </section>
        ) : null}
      </main>

      {removedItemNotice ? (
        <BuildListUndoToast
          item={removedItemNotice.item}
          onUndo={handleUndoRemoveBuildListItem}
        />
      ) : null}

      <SiteDisclaimer />
    </div>
  );
}
