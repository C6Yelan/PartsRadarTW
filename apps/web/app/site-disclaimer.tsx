// apps/web/app/site-disclaimer.tsx
// 顯示所有主要頁面共用的公開網站導覽、資料來源與非官方聲明。

import Link from "next/link";

export default function SiteDisclaimer() {
  return (
    <footer className="site-disclaimer">
      <nav className="site-footer-nav" aria-label="網站資訊">
        <Link href="/about">關於本站</Link>
        <Link href="/price-report">價格變動總覽</Link>
        <Link href="/announcements">公告</Link>
        <Link href="/privacy">隱私權政策</Link>
        <Link href="/terms">使用條款</Link>
      </nav>

      <div className="site-footer-copy">
        <p>
          PartsRadarTW
          是非官方、非商業的商品搜尋與價格整理工具。資料來源為原價屋公開頁面；實際商品資訊、價格、庫存、購買與售後服務以原價屋來源頁為準。
        </p>
        <p>
          本站僅整理必要的商品查詢資訊，不複製完整商品文案、完整頁面內容或原站排版。
        </p>
      </div>
    </footer>
  );
}
