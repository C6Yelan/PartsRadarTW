// apps/web/app/announcements/page.tsx
// 列出網站公開公告與功能更新歷史。

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, BrandMarkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";
import { listPublishedAnnouncements, PUBLIC_ANNOUNCEMENTS } from "./data";

export const metadata: Metadata = {
  title: "網站公告 | PartsRadarTW",
  description: "PartsRadarTW 的服務狀態、功能更新與重要提醒。",
};

export const revalidate = 3600;

export default function AnnouncementsPage() {
  const announcements = listPublishedAnnouncements(PUBLIC_ANNOUNCEMENTS, new Date());

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
          <h1>網站公告</h1>
          <span>服務提醒與功能更新</span>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="public-info-page">
        <section className="public-info-hero">
          <p className="public-info-kicker">ANNOUNCEMENTS</p>
          <strong>服務提醒、資料狀態與功能更新會集中記錄在這裡。</strong>
          <p>首頁只顯示目前有效的置頂公告；歷史公告仍會保留於本頁。</p>
        </section>

        <div className="public-announcement-list">
          {announcements.map((announcement) => (
            <article
              className={`public-announcement-card is-${announcement.severity}`}
              id={announcement.id}
              key={announcement.id}
            >
              <div className="public-announcement-card-meta">
                <span>{announcement.pinned ? "置頂公告" : "功能更新"}</span>
                <time dateTime={announcement.publishedAt}>{announcement.publishedAt}</time>
              </div>
              <h2>{announcement.title}</h2>
              <p className="public-announcement-card-summary">{announcement.summary}</p>
              {announcement.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
      </main>

      <SiteDisclaimer />
    </div>
  );
}
