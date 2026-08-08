// apps/web/app/categories/[slug]/category-landing.tsx
// 在 server 輸出分類資訊、來源說明、更新時間與 canonical 商品連結。

import Link from "next/link";
import { formatTwdPrice } from "../../_shared/formatting";
import { ArrowLeftIcon } from "../../_shared/icons";
import { formatTaipeiDateTime } from "../../_shared/time";
import SiteDisclaimer from "../../site-disclaimer";
import TopbarBrandNavigation from "../../TopbarBrandNavigation";
import type { CategoryLandingData } from "./data";

export default function CategoryLanding({ data }: { data: CategoryLandingData }) {
  return (
    <div className="app-shell public-info-shell">
      <header className="topbar public-info-topbar">
        <TopbarBrandNavigation />
        <div className="public-info-topbar-title">
          <h1>{data.category.displayName}</h1>
          <span>電腦零件分類</span>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="public-info-page">
        <section className="public-info-hero">
          <strong>{data.category.displayName} 商品價格</strong>
          <p>
            PartsRadarTW
            整理原價屋公開頁面的目前上架商品與價格，方便快速瀏覽並前往商品詳細頁；實際價格、供貨與購買資訊以來源頁為準。
          </p>
        </section>

        <section className="public-info-section">
          <h2>目前上架商品</h2>
          {data.products.length > 0 ? (
            <ul className="category-product-list">
              {data.products.map((product) => (
                <li key={product.id}>
                  <Link href={`/products/${product.id}`}>
                    <span>{product.name}</span>
                    <strong>{formatTwdPrice(product.price.amount)}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>目前沒有可公開顯示的上架商品。</p>
          )}
          <p className="category-explorer-link">
            <Link href={`/?category=${data.category.slug}`}>使用搜尋與進階篩選瀏覽此分類</Link>
          </p>
        </section>

        {data.category.lastSuccessAt ? (
          <p className="public-info-updated-at">
            分類資料最近成功更新：
            <time dateTime={data.category.lastSuccessAt.toISOString()}>
              {formatTaipeiDateTime(data.category.lastSuccessAt)}
            </time>
          </p>
        ) : null}
      </main>

      <SiteDisclaimer />
    </div>
  );
}
