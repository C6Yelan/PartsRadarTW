"use client";
// apps/web/app/build-list/components/BuildListUndoToast.tsx

import type { BuildListItem } from "../model";

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
