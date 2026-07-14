// apps/web/app/site-disclaimer.tsx
// 顯示所有主要頁面共用的公開網站導覽、資料來源與非官方聲明。

import Link from "next/link";
import { ExternalLinkIcon } from "./_shared/icons";

export default function SiteDisclaimer() {
  return (
    <footer className="site-disclaimer">
      <nav className="site-footer-nav" aria-label="網站資訊">
        <Link href="/about">關於與聯絡</Link>
        <Link href="/privacy">隱私權</Link>
        <Link href="/terms">使用條款</Link>
        <a
          aria-label="GitHub（在新分頁開啟）"
          href="https://github.com/C6Yelan/PartsRadarTW"
          rel="noreferrer"
          target="_blank"
        >
          GitHub
          <ExternalLinkIcon className="site-footer-external-icon" />
        </a>
      </nav>

      <div className="site-footer-copy">
        <p>
          {
            "PartsRadarTW 是非官方的商品搜尋與價格整理工具；實際商品資訊、價格、庫存、購買與售後服務以來源頁為準。"
          }
        </p>
      </div>
    </footer>
  );
}
