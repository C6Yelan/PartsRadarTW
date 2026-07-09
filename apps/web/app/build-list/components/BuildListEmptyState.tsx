// apps/web/app/build-list/components/BuildListEmptyState.tsx
// 顯示配單沒有品項時的空狀態，提供回到商品查詢的入口。

import Link from "next/link";

// 呈現配單空狀態，避免未加入商品時顯示空白頁面。
export default function BuildListEmptyState() {
  return (
    <section className="build-list-empty">
      <h2>配單目前沒有品項</h2>
      <p>從商品列表或商品詳細頁加入品項後，這裡會保留數量、小計與總價。</p>
      <Link className="control-button primary" href="/">
        回到查詢
      </Link>
    </section>
  );
}
