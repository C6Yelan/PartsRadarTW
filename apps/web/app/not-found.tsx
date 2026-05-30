import Link from "next/link";
import SiteDisclaimer from "./site-disclaimer";

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <Link className="brand-lockup not-found-brand" href="/">
        <span className="brand-mark" aria-hidden="true" />
        <span>
          <span className="brand-name">PartsRadarTW</span>
          <span className="brand-subtitle">原價屋零件查詢</span>
        </span>
      </Link>

      <section className="not-found-panel" aria-labelledby="not-found-title">
        <h1 id="not-found-title">找不到這個頁面</h1>
        <p>網址可能已失效，或目前沒有對應的商品查詢頁面。</p>
        <Link className="external-action" href="/">
          返回商品查詢
        </Link>
      </section>
      <SiteDisclaimer />
    </main>
  );
}
