// apps/web/app/about/page.tsx
// 說明 PartsRadarTW 的用途、資料來源、公開功能與聯絡邊界。

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, BrandMarkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";

export const metadata: Metadata = {
  alternates: {
    canonical: "/about",
  },
  title: "關於本站 | PartsRadarTW",
  description: "PartsRadarTW 的用途、資料來源與公開功能說明。",
};

export default function AboutPage() {
  return (
    <div className="app-shell public-info-shell">
      <header className="topbar public-info-topbar">
        <Link className="brand-lockup" href="/">
          <BrandMarkIcon />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>
        <div className="public-info-topbar-title">
          <h1>關於本站</h1>
          <span>用途、資料來源與功能邊界</span>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="public-info-page">
        <section className="public-info-hero">
          <strong>讓原價屋公開商品資料更容易搜尋、比較與整理。</strong>
          <p>
            PartsRadarTW 是非官方、非商業的個人專案，不販售商品，也不代表原價屋或任何硬體品牌。
          </p>
        </section>

        <section className="public-info-section">
          <h2>資料從哪裡來</h2>
          <p>
            商品名稱、分類、價格與來源連結整理自原價屋公開頁面。網站依排程更新資料，但來源頁更新、網路狀況與解析流程都可能造成延遲。
          </p>
          <p>實際規格、價格、庫存、購買與售後服務，一律以原價屋來源頁面當下資訊為準。</p>
        </section>

        <section className="public-info-section">
          <h2>目前提供的功能</h2>
          <ul className="public-info-section-list">
            <li>依商品名稱、分類、廠商與類別專屬條件搜尋零組件。</li>
            <li>
              在<Link href="/price-report">價格變動總覽</Link>查看近期降價、漲價與新品。
            </li>
            <li>使用瀏覽器本機配單整理數量與預估總價，不需註冊帳號。</li>
            <li>
              透過<Link href="/discord">Discord 通知</Link>頁查看公開 bot 的使用方式。
            </li>
          </ul>
        </section>

        <section className="public-info-section" id="contact">
          <h2>聯絡與回報</h2>
          <p>
            專案原始碼可在
            <a href="https://github.com/C6Yelan/PartsRadarTW" rel="noreferrer" target="_blank">
              GitHub repository
            </a>
            公開瀏覽，但目前 Issues 限制建立新 issue，不能作為一般使用者的正式回報管道。
          </p>
          <p>
            本站尚未提供專用 email 或公開表單。請勿透過原價屋客服回報本站問題，也不要在公開內容附上
            token、連線字串、私鑰或其他敏感資訊。
          </p>
          <p className="public-info-launch-warning" role="note">
            在可用聯絡管道與正式部署日誌政策確認前，本站尚未符合正式公開上線條件。
          </p>
        </section>

        <p className="public-info-updated-at">
          最後更新：<time dateTime="2026-07-12">2026 年 7 月 12 日</time>
        </p>
      </main>

      <SiteDisclaimer />
    </div>
  );
}
