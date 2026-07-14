// apps/web/app/discord/page.tsx
// 依一般使用者與伺服器管理員分流 Discord bot 邀請、快速開始與指令教學。

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon, ExternalLinkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";
import TopbarBrandNavigation from "../TopbarBrandNavigation";
import {
  adminCommandGuides,
  adminQuickStartSteps,
  discordFaqItems,
  heroScreenshot,
  screenshotFreshnessNotice,
  userCommandGuides,
  userQuickStartSteps,
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

export default function DiscordPage() {
  const hasInviteUrl = Boolean(discordInviteUrl);

  return (
    <div className="app-shell discord-shell">
      <header className="topbar discord-topbar">
        <TopbarBrandNavigation />

        <div className="discord-topbar-title">
          <h1>Discord 通知</h1>
          <span>提醒、個人報告與伺服器設定</span>
        </div>
        <Link className="back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="discord-page">
        <section className="discord-hero" aria-labelledby="discord-title">
          <div className="discord-hero-copy">
            <h2 id="discord-title">Discord 價格通知</h2>
            <p>追蹤商品目標價、查看近期價格變動，或為伺服器設定公開價格報告。</p>
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
            <p>在 Discord 指令選單中選擇提醒、個人報告或管理員功能。</p>
          </aside>
        </section>

        <section className="discord-section" aria-labelledby="audience-title">
          <div className="discord-section-heading">
            <h2 id="audience-title">選擇使用方式</h2>
            <p>依你的使用情境前往對應教學；一般提醒與個人報告不需要管理員權限。</p>
          </div>
          <div className="discord-audience-grid">
            <article className="discord-audience-card">
              <div>
                <span className="discord-audience-label">一般使用者</span>
                <h3>管理自己的提醒與報告</h3>
                <p>追蹤商品目標價、立即查看價格變動，並設定每日私訊報告。</p>
              </div>
              <a href="#quick-start">查看一般使用者教學</a>
            </article>
            <article className="discord-audience-card">
              <div>
                <span className="discord-audience-label">伺服器管理員</span>
                <h3>設定伺服器公開報告</h3>
                <p>設定公開報告頻道、測試 bot 權限，並查看最近發送狀態。</p>
              </div>
              <strong>需要「管理伺服器」權限</strong>
              <a href="#discord-admin-guide">查看管理員教學</a>
            </article>
          </div>
        </section>

        <section className="discord-section" id="quick-start" aria-labelledby="quick-start-title">
          <div className="discord-section-heading">
            <h2 id="quick-start-title">快速開始</h2>
            <p>一般使用者只需要三步即可開始設定目標價提醒、即時報告或每日私訊報告。</p>
          </div>
          <QuickStartSteps items={userQuickStartSteps} />
        </section>

        <section
          className="discord-section"
          id="discord-user-guide"
          aria-labelledby="discord-user-guide-title"
        >
          <div className="discord-section-heading">
            <span className="discord-section-eyebrow">一般使用者</span>
            <h2 id="discord-user-guide-title">提醒與個人價格報告</h2>
            <p>先從指令摘要確認用途，需要操作畫面時再展開完整教學。</p>
          </div>
          <div className="discord-command-guide-sequence">
            <CommandSummary guides={userCommandGuides} />
            <p className="discord-screenshot-notice">{screenshotFreshnessNotice}</p>
            <CommandDetails guides={userCommandGuides} firstOpen />
          </div>
        </section>

        <section
          className="discord-section"
          id="discord-admin-guide"
          aria-labelledby="discord-admin-guide-title"
        >
          <div className="discord-section-heading">
            <span className="discord-section-eyebrow">伺服器管理員</span>
            <h2 id="discord-admin-guide-title">公開價格報告設定</h2>
            <p>依序確認權限、設定公開報告、發送測試，再查看目前狀態。</p>
          </div>
          <aside className="discord-permission-notice" aria-label="公開報告必要權限">
            <strong>必要權限</strong>
            <p>
              使用者需要「管理伺服器」權限；bot 在目標頻道需要「傳送訊息」與「嵌入連結」權限。
            </p>
          </aside>
          <div className="discord-admin-quick-start">
            <h3>管理員三步設定</h3>
            <QuickStartSteps items={adminQuickStartSteps} />
          </div>
          <div className="discord-command-guide-sequence">
            <CommandSummary guides={adminCommandGuides} />
            <p className="discord-screenshot-notice">{screenshotFreshnessNotice}</p>
            <CommandDetails guides={adminCommandGuides} />
          </div>
        </section>

        <section
          className="discord-section"
          id="discord-faq"
          aria-labelledby="discord-faq-title"
        >
          <div className="discord-section-heading">
            <h2 id="discord-faq-title">常見問題</h2>
            <p>遇到指令權限或私訊問題時，展開對應項目確認必要設定。</p>
          </div>
          <div className="discord-faq-list">
            {discordFaqItems.map((item) => (
              <details className="discord-faq-item" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteDisclaimer />
    </div>
  );
}

function QuickStartSteps({ items }: { items: readonly QuickStartStep[] }) {
  return (
    <ol className="discord-step-list">
      {items.map((item, index) => (
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
  );
}

function CommandSummary({ guides }: { guides: readonly CommandGuide[] }) {
  return (
    <ul className="discord-command-summary-list" aria-label="指令摘要">
      {guides.map((guide) => (
        <li key={guide.command}>
          <code>{guide.command}</code>
          <span>{guide.purpose}</span>
          <span>{guide.result}</span>
        </li>
      ))}
    </ul>
  );
}

function CommandDetails({
  firstOpen = false,
  guides,
}: {
  firstOpen?: boolean;
  guides: readonly CommandGuide[];
}) {
  return (
    <div className="discord-command-details-list">
      {guides.map((guide, index) => (
        <details className="discord-command-details" key={guide.command} open={firstOpen && index === 0}>
          <summary>
            <code>{guide.command}</code>
            <span>{guide.title}</span>
          </summary>
          <div className="discord-command-details-body">
            {guide.sections.map((section) => (
              <article className="discord-guide-content" key={section.image.alt}>
                <div className="discord-guide-copy">
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <div className={`discord-guide-frame is-${section.image.orientation}`}>
                  <Image
                    alt={section.image.alt}
                    className="discord-guide-image"
                    height={section.image.height}
                    src={section.image.src}
                    width={section.image.width}
                  />
                </div>
              </article>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

type QuickStartStep = (typeof userQuickStartSteps)[number] | (typeof adminQuickStartSteps)[number];
type CommandGuide = (typeof userCommandGuides)[number] | (typeof adminCommandGuides)[number];
