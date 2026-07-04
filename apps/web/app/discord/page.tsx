// apps/web/app/discord/page.tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteDisclaimer from "../site-disclaimer";
import {
  discordFaqItems,
  heroScreenshot,
  personalReportCommandGuides,
  quickStartSteps,
  serverReportCommandGuides,
  targetPriceCommandGuides,
} from "./content";

export const metadata: Metadata = {
  title: "Discord 通知 | PartsRadarTW",
  description: "邀請 PartsRadarTW Discord bot，設定即時目標價提醒、個人價格報告與伺服器公開報告。",
};

export const dynamic = "force-dynamic";

const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL?.trim();

export default function DiscordPage() {
  const hasInviteUrl = Boolean(discordInviteUrl);

  return (
    <div className="app-shell discord-shell">
      <header className="topbar discord-topbar">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>

        <div className="discord-topbar-title">
          <h1>Discord 通知</h1>
          <span>指令教學與公開報告</span>
        </div>
      </header>

      <main className="discord-page">
        <div className="discord-page-nav">
          <Link className="back-link discord-back-link" href="/">
            返回查詢
          </Link>
        </div>

        <section className="discord-hero" aria-labelledby="discord-title">
          <div className="discord-hero-copy">
            <span className="eyebrow">PartsRadarTW Discord bot</span>
            <h2 id="discord-title">Discord 價格通知</h2>
            <p>用 Discord 接收即時目標價提醒、個人價格報告與伺服器公開報告。</p>
            <div className="discord-actions">
              {hasInviteUrl ? (
                <a
                  className="control-button primary"
                  href={discordInviteUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  邀請機器人
                </a>
              ) : (
                <span className="control-button primary is-disabled" aria-disabled="true">
                  邀請連結準備中
                </span>
              )}
              <a className="control-button secondary" href="#discord-admin">
                公開報告設定
              </a>
              <a className="control-button secondary" href="#discord-commands">
                指令教學
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

        <section className="discord-section" aria-labelledby="quick-start-title">
          <div className="discord-section-heading">
            <span className="eyebrow">Quick start</span>
            <h2 id="quick-start-title">快速開始</h2>
            <p>先完成邀請，再依需求選擇即時提醒、個人報告或公開報告。</p>
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
              /watch 是即時達標提醒；/price-report 是個人彙整；/public-report 是伺服器公開彙整。
            </p>
          </div>

          <div className="discord-command-group">
            <h3>即時目標價提醒</h3>
            <p className="discord-command-group-summary">
              追蹤單一商品。價格資料更新後若達到目標價，bot 會私訊通知你。
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
                        loading="eager"
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
            <h3>個人價格報告</h3>
            <p className="discord-command-group-summary">
              依你的分類、關鍵字與上限產生私訊彙整報告；通常不是即時通知。
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
                        loading="eager"
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
            <h3>伺服器公開報告</h3>
            <p className="discord-command-group-summary">
              管理者指定公開頻道，讓整個伺服器看到自動產生的價格彙整。
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
                        loading="eager"
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
            <p>只保留使用者最可能卡住的權限與通知問題。</p>
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
