"use client";
// apps/web/app/build-list/BuildListPageClient.tsx
// 組裝 intent-only 配單、批次 refresh、估算、Excel 與移除復原流程。

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, BrandMarkIcon } from "../_shared/icons";
import DiscordTopbarLink from "../DiscordTopbarLink";
import PriceReportTopbarLink from "../PriceReportTopbarLink";
import AnnouncementTopbarLink from "../AnnouncementTopbarLink";
import SiteDisclaimer from "../site-disclaimer";
import BuildListEmptyState from "./components/BuildListEmptyState";
import BuildListItemRow from "./components/BuildListItemRow";
import BuildListLoadingState from "./components/BuildListLoadingState";
import BuildListRefreshStatus from "./components/BuildListRefreshStatus";
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
  } = useBuildList();
  const refresh = useBuildListRefresh(intents, isReady);
  const items = useMemo(
    () => resolveBuildListItems(intents, refresh.products, refresh.state),
    [intents, refresh.products, refresh.state],
  );
  const summary = useMemo(() => summarizeBuildListItems(items), [items]);
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
    downloadBuildListExcel(items, refresh.lastSuccessfulSyncAt);
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
        <div className="topbar-brand-area">
          <Link className="brand-lockup" href="/">
            <BrandMarkIcon />
            <span>
              <span className="brand-name">PartsRadarTW</span>
              <span className="brand-subtitle">原價屋零件查詢</span>
            </span>
          </Link>
          <PriceReportTopbarLink />
          <AnnouncementTopbarLink />
          <DiscordTopbarLink />
        </div>

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

        {isReady ? (
          <BuildListRefreshStatus
            itemCount={intents.length}
            lastSuccessfulSyncAt={refresh.lastSuccessfulSyncAt}
            missingItemCount={missingItemCount}
            state={refresh.state}
            onRefresh={() => void refresh.refresh()}
          />
        ) : null}

        {isReady && items.length === 0 ? <BuildListEmptyState /> : null}

        {isReady && items.length > 0 ? (
          <section className="build-list-layout">
            <section className="build-list-items" aria-label="配單品項">
              {items.map((item) => (
                <BuildListItemRow
                  item={item}
                  key={item.intent.productId}
                  onQuantityChange={setBuildListItemQuantity}
                  onRemove={handleRemoveBuildListItem}
                />
              ))}
            </section>

            <BuildListSummaryPanel
              isDownloadDisabled={refresh.state === "loading"}
              summary={summary}
              onClear={handleClearBuildListItems}
              onDownloadExcel={downloadExcel}
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
