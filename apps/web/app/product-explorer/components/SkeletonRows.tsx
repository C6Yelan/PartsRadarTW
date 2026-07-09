// apps/web/app/product-explorer/components/SkeletonRows.tsx
// 呈現商品探索列表載入中的 skeleton 列，讓結果表格在等待 API 時維持穩定版面。

const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

// 建立固定數量的商品列佔位元素，搭配 product-table grid 樣式顯示載入狀態。
export function SkeletonRows() {
  return (
    <>
      {SKELETON_ROWS.map((row) => (
        <div className="product-row skeleton-row" key={row}>
          <span className="skeleton-box image" />
          <span className="skeleton-box wide" />
          <span className="skeleton-box short" />
          <span className="skeleton-box short" />
          <span className="skeleton-box short" />
        </div>
      ))}
    </>
  );
}
