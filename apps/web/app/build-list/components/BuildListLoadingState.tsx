// apps/web/app/build-list/components/BuildListLoadingState.tsx
// 顯示配單從瀏覽器儲存讀取前的 skeleton loading 狀態。

// 呈現配單載入中的占位區塊，避免 localStorage 尚未同步時頁面短暫空白。
export default function BuildListLoadingState() {
  return (
    <section className="detail-loading" aria-label="配單載入中">
      <span className="skeleton-box wide" />
      <span className="skeleton-box medium" />
      <span className="skeleton-box short" />
    </section>
  );
}
