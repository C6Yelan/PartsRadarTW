"use client";
// apps/web/app/build-list/components/BuildListUndoToast.tsx
// 顯示配單品項移除後的復原提示，讓使用者可在短時間內還原誤刪。

import type { BuildListItem } from "../model";

// 呈現單一移除提示，將復原事件交回頁面層還原配單狀態。
export default function BuildListUndoToast({
  item,
  onUndo,
}: {
  item: BuildListItem;
  onUndo: () => void;
}) {
  return (
    <div className="build-list-undo-toast" role="status" aria-live="polite">
      <span className="build-list-undo-toast-text">
        <span>已從配單移除</span>
        <strong>{item.name}</strong>
      </span>
      <button type="button" onClick={onUndo}>
        復原
      </button>
    </div>
  );
}
