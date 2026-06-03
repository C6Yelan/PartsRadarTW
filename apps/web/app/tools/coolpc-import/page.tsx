// apps/web/app/tools/coolpc-import/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import SiteDisclaimer from "../../site-disclaimer";
import CoolpcImportInstallPageClient from "./CoolpcImportInstallPageClient";

export const metadata: Metadata = {
  title: "原價屋估價頁匯入工具 | PartsRadarTW",
  description: "安裝 PartsRadarTW 原價屋估價頁匯入工具。",
};

export default function CoolpcImportInstallPage() {
  return (
    <div className="app-shell tool-install-shell">
      <header className="topbar tool-install-topbar">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>

        <div className="tool-install-title">
          <h1>原價屋估價頁匯入工具</h1>
          <span>電腦瀏覽器安裝</span>
        </div>

        <Link className="back-link tool-install-back-link" href="/build-list">
          返回配單
        </Link>
      </header>

      <main className="tool-install-page" aria-labelledby="tool-install-heading">
        <section className="tool-install-intro">
          <div>
            <h2 id="tool-install-heading">安裝後即可從配單帶入原價屋估價頁</h2>
          </div>
          <p>
            請先安裝 Tampermonkey，再安裝 PartsRadarTW 匯入工具。
          </p>
        </section>

        <CoolpcImportInstallPageClient />
      </main>

      <SiteDisclaimer />
    </div>
  );
}
