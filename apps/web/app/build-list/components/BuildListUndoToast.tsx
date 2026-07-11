"use client";
// apps/web/app/build-list/components/BuildListUndoToast.tsx
// 顯示配單 intent 移除後的復原提示，不依賴 persisted 商品 snapshot。

export default function BuildListUndoToast({
  itemLabel,
  onUndo,
}: {
  itemLabel: string;
  onUndo: () => void;
}) {
  return (
    <div className="build-list-undo-toast" role="status" aria-live="polite">
      <span className="build-list-undo-toast-text">
        <span>已從配單移除</span>
        <strong>{itemLabel}</strong>
      </span>
      <button type="button" onClick={onUndo}>
        復原
      </button>
    </div>
  );
}
