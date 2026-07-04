// apps/web/app/build-list/components/BuildListEmptyState.tsx
import Link from "next/link";

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
