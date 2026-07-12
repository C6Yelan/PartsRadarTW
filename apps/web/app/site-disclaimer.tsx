// apps/web/app/site-disclaimer.tsx
// 顯示所有主要頁面共用的公開網站導覽、資料來源與非官方聲明。

import Link from "next/link";

export default function SiteDisclaimer() {
  return (
    <footer className="site-disclaimer">
      <nav className="site-footer-nav" aria-label="網站資訊">
        <Link href="/about">關於本站</Link>
        <Link href="/status">資料更新狀態</Link>
        <Link href="/privacy">隱私權政策</Link>
        <Link href="/terms">使用條款</Link>
        <Link href="/about#contact">聯絡與回報</Link>
      </nav>

      <div className="site-footer-copy">
        <p>
          PartsRadarTW 是非官方的商品搜尋與價格整理工具；實際商品資訊、價格、庫存、購買與售後服務以原價屋來源頁為準。
        </p>
      </div>
    </footer>
  );
}
