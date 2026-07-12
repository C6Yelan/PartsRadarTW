"use client";
// apps/web/app/build-list/BuildListPageClient.tsx
// 組裝 intent-only 配單、批次 refresh、估算、Excel 與移除復原流程。

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";
import TopbarBrandNavigation from "../TopbarBrandNavigation";
import BuildListEmptyState from "./components/BuildListEmptyState";
import BuildListItemRow from "./components/BuildListItemRow";
import BuildListLoadingState from "./components/BuildListLoadingState";
import BuildListSummaryPanel from "./components/BuildListSummaryPanel";
import BuildListUndoToast from "./components/BuildListUndoToast";
import { downloadBuildListExcel } from "./download";
import {
  type BuildListIntent,
  type BuildListItem,
  resolveBuildListItems,
  summarizeBuildListItems,
} from "./model";
import { useBuildList } from "./use-build-list";
import { useBuildListRefresh } from "./use-build-list-refresh";

const UNDO_TOAST_DURATION_MS = 7000;

interface RemovedItemNotice {
  id: number;
  intent: BuildListIntent;
  label: string;
}

export default function BuildListPageClient() {
  const {
    clearBuildListItems,
    intents,
    isReady,
    removeBuildListItem,
    restoreBuildListItem,
    setBuildListItemQuantity,
    setBuildListItemExportSelection,
  } = useBuildList();
  const refresh = useBuildListRefresh(intents, isReady);
  const items = useMemo(
    () => resolveBuildListItems(intents, refresh.products, refresh.state),
    [intents, refresh.products, refresh.state],
  );
  const summary = useMemo(() => summarizeBuildListItems(items), [items]);
  const exportItems = useMemo(
    () => items.filter((item) => item.intent.includeInExport),
    [items],
  );
  const missingItemCount = items.filter((item) => item.availability === "missing").length;
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
    downloadBuildListExcel(exportItems, refresh.lastSuccessfulSyncAt);
  }

  function handleRemoveBuildListItem(item: BuildListItem) {
    removeBuildListItem(item.intent.productId);
    setRemovedItemNotice({
      id: Date.now(),
      intent: item.intent,
      label: item.product?.name ?? item.intent.productId,
    });
  }

  function handleUndoRemoveBuildListItem() {
    if (!removedItemNotice) {
      return;
    }

    restoreBuildListItem(removedItemNotice.intent);
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
        <TopbarBrandNavigation />

        <div className="build-list-title">
          <h1>配單</h1>
          <span>{summary.totalQuantity} 件商品</span>
        </div>

        <Link className="back-link build-list-back-link" href="/">
          <ArrowLeftIcon />
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
                  key={item.intent.productId}
                  onExportSelectionChange={setBuildListItemExportSelection}
                  onQuantityChange={setBuildListItemQuantity}
                  onRemove={handleRemoveBuildListItem}
                />
              ))}
            </section>

            <BuildListSummaryPanel
              exportItemCount={exportItems.length}
              isDownloadDisabled={refresh.state === "loading" || exportItems.length === 0}
              itemCount={intents.length}
              lastSuccessfulSyncAt={refresh.lastSuccessfulSyncAt}
              missingItemCount={missingItemCount}
              refreshState={refresh.state}
              summary={summary}
              onClear={handleClearBuildListItems}
              onDownloadExcel={downloadExcel}
              onRefresh={() => void refresh.refresh()}
            />
          </section>
        ) : null}
      </main>

      {removedItemNotice ? (
        <BuildListUndoToast
          itemLabel={removedItemNotice.label}
          onUndo={handleUndoRemoveBuildListItem}
        />
      ) : null}

      <SiteDisclaimer />
    </div>
  );
}
