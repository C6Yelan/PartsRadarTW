// apps/web/app/discord/page.tsx
// 呈現 Discord bot 公開介紹頁，串接邀請入口、指令教學截圖與常見問題。

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon, BrandMarkIcon, ExternalLinkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";
import {
  discordFaqItems,
  heroScreenshot,
  personalReportCommandGuides,
  quickStartSteps,
  screenshotFreshnessNotice,
  serverReportCommandGuides,
  targetPriceCommandGuides,
} from "./content";

export const metadata: Metadata = {
  alternates: {
    canonical: "/discord",
  },
  title: "Discord 通知 | PartsRadarTW",
  description:
    "邀請 PartsRadarTW Discord bot，設定目標價提醒、即時價格報告、每日私訊價格報告與公開價格報告。",
};

// Server-only runtime env keeps invite changes independent from the web image build.
export const dynamic = "force-dynamic";

const discordInviteUrl = process.env.DISCORD_BOT_INVITE_URL?.trim();

// 組裝 Discord 介紹頁，將靜態內容資料分派到 hero、快速開始、指令教學與 FAQ 區塊。
export default function DiscordPage() {
  const hasInviteUrl = Boolean(discordInviteUrl);

  return (
    <div className="app-shell discord-shell">
      <header className="topbar discord-topbar">
        <Link className="brand-lockup" href="/">
          <BrandMarkIcon />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>

        <div className="discord-topbar-title">
          <h1>Discord 通知</h1>
          <span>指令教學與公開價格報告</span>
        </div>
      </header>

      <main className="discord-page">
        <div className="discord-page-nav">
          <Link className="back-link" href="/">
            <ArrowLeftIcon />
            返回查詢
          </Link>
        </div>

        <section className="discord-hero" aria-labelledby="discord-title">
          <div className="discord-hero-copy">
            <span className="eyebrow">PartsRadarTW Discord bot</span>
            <h2 id="discord-title">Discord 價格通知</h2>
            <p>用 Discord 管理目標價提醒、即時價格報告、每日私訊價格報告與公開價格報告。</p>
            <div className="discord-actions">
              {hasInviteUrl ? (
                <a
                  aria-label="邀請 PartsRadarTW Discord bot，開新分頁"
                  className="control-button primary"
                  href={discordInviteUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  邀請機器人
                  <ExternalLinkIcon className="discord-invite-icon" />
                </a>
              ) : (
                <span className="control-button primary is-disabled" aria-disabled="true">
                  邀請連結準備中
                </span>
              )}
              <a className="control-button secondary" href="#quick-start">
                快速開始
              </a>
              <a className="control-button secondary" href="#discord-admin">
                管理公開價格報告
              </a>
            </div>
          </div>

          <aside className="discord-visual-panel" aria-label="Discord 指令操作示意圖">
            <div className="discord-visual-frame">
              <Image
                alt={heroScreenshot.alt}
                className="discord-visual-image"
                height={heroScreenshot.height}
                priority
                src={heroScreenshot.src}
                width={heroScreenshot.width}
              />
            </div>
            <p>使用 Discord 指令選單即可找到 PartsRadarTW 的提醒與報告功能。</p>
          </aside>
        </section>

        <section className="discord-section" id="quick-start" aria-labelledby="quick-start-title">
          <div className="discord-section-heading">
            <span className="eyebrow">Quick start</span>
            <h2 id="quick-start-title">快速開始</h2>
            <p>先完成邀請，再依需求選擇目標價提醒、即時或每日報告，以及公開價格報告。</p>
          </div>

          <ol className="discord-step-list">
            {quickStartSteps.map((item, index) => (
              <li key={item.title}>
                <span className="discord-step-number">{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <code>{item.command}</code>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="discord-section" id="discord-commands" aria-labelledby="commands-title">
          <div className="discord-section-heading">
            <span className="eyebrow">Commands</span>
            <h2 id="commands-title">指令說明</h2>
            <p>
              /watch 管理目標價提醒；/price-report 提供即時與每日私訊價格報告；/public-report
              管理公開價格報告。
            </p>
            <p>{screenshotFreshnessNotice}</p>
          </div>

          <div className="discord-command-group">
            <h3>目標價提醒</h3>
            <p className="discord-command-group-summary">
              追蹤單一商品。價格資料更新後若達到目標價，bot 會嘗試透過 DM 傳送提醒。
            </p>
            <div className="discord-command-guide-list">
              {targetPriceCommandGuides.map((guide, index) => (
                <article className="discord-command-guide" key={guide.image.alt}>
                  <div className="discord-guide-media">
                    <div className={`discord-guide-frame is-${guide.image.orientation}`}>
                      <Image
                        alt={guide.image.alt}
                        className="discord-guide-image"
                        height={guide.image.height}
                        src={guide.image.src}
                        width={guide.image.width}
                      />
                    </div>
                  </div>

                  <div className="discord-guide-copy">
                    <span className="discord-guide-step">提醒 {index + 1}</span>
                    <h4>{guide.title}</h4>
                    <code>{guide.command}</code>
                    <p>{guide.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="discord-command-group">
            <h3>即時價格報告與每日私訊價格報告</h3>
            <p className="discord-command-group-summary">
              即時報告回覆在目前伺服器頻道或 DM；每日報告依台北時間與個人篩選設定傳到 DM。
            </p>
            <div className="discord-command-guide-list">
              {personalReportCommandGuides.map((guide, index) => (
                <article className="discord-command-guide" key={guide.image.alt}>
                  <div className="discord-guide-media">
                    <div className={`discord-guide-frame is-${guide.image.orientation}`}>
                      <Image
                        alt={guide.image.alt}
                        className="discord-guide-image"
                        height={guide.image.height}
                        src={guide.image.src}
                        width={guide.image.width}
                      />
                    </div>
                  </div>

                  <div className="discord-guide-copy">
                    <span className="discord-guide-step">報告 {index + 1}</span>
                    <h4>{guide.title}</h4>
                    <code>{guide.command}</code>
                    <p>{guide.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="discord-command-group" id="discord-admin">
            <h3>公開價格報告</h3>
            <p className="discord-command-group-summary">
              具備「管理伺服器」權限的成員可指定頻道，讓伺服器看到自動產生的價格彙整。
            </p>
            <div className="discord-command-guide-list">
              {serverReportCommandGuides.map((guide, index) => (
                <article className="discord-command-guide" key={guide.image.alt}>
                  <div className="discord-guide-media">
                    <div className={`discord-guide-frame is-${guide.image.orientation}`}>
                      <Image
                        alt={guide.image.alt}
                        className="discord-guide-image"
                        height={guide.image.height}
                        src={guide.image.src}
                        width={guide.image.width}
                      />
                    </div>
                  </div>

                  <div className="discord-guide-copy">
                    <span className="discord-guide-step">管理 {index + 1}</span>
                    <h4>{guide.title}</h4>
                    <code>{guide.command}</code>
                    <p>{guide.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="discord-section" aria-labelledby="discord-faq-title">
          <div className="discord-section-heading">
            <span className="eyebrow">FAQ</span>
            <h2 id="discord-faq-title">常見問題</h2>
            <p>遇到指令權限或私訊問題時，先從這裡確認使用範圍與必要設定。</p>
          </div>

          <div className="discord-faq-list">
            {discordFaqItems.map((item) => (
              <article className="discord-faq-item" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteDisclaimer />
    </div>
  );
}
