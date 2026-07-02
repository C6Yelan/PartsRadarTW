// apps/web/app/discord/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import SiteDisclaimer from "../site-disclaimer";

export const metadata: Metadata = {
  title: "Discord 通知 | PartsRadarTW",
  description: "邀請 PartsRadarTW Discord bot，設定商品目標價追蹤、個人價格報告與伺服器公開報告。",
};

export const dynamic = "force-dynamic";

const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL?.trim();

const quickStartSteps = [
  {
    title: "邀請機器人",
    command: "邀請連結",
    description: "把 bot 加到伺服器後，成員即可使用個人通知指令。",
  },
  {
    title: "設定個人追蹤",
    command: "/watch",
    description: "追蹤商品目標價，達標時由 bot 私訊提醒。",
  },
  {
    title: "客製化報告",
    command: "/price-report settings",
    description: "選擇分類、關鍵字與顯示上限，建立自己的價格報告。",
  },
  {
    title: "開啟公開報告",
    command: "/public-report manage",
    description: "管理者指定頻道，讓伺服器自動收到公開價格報告。",
  },
] as const;

const personalCommandGuides = [
  {
    command: "/watch",
    description: "查看追蹤清單，並從同一個面板新增、修改或移除目標價。",
    imageLabel: "/watch 追蹤面板截圖預留",
    imageTitle: "/watch 追蹤面板",
    title: "管理商品目標價",
  },
  {
    command: "新增追蹤",
    description: "貼上 PartsRadarTW 商品頁網址，填入目標價後儲存。",
    imageLabel: "新增追蹤視窗截圖預留",
    imageTitle: "新增追蹤視窗",
    title: "新增目標價提醒",
  },
  {
    command: "/price-report settings",
    description: "設定分類、商品關鍵字、內容類型與顯示上限。",
    imageLabel: "個人價格報告設定截圖預留",
    imageTitle: "價格報告設定",
    title: "設定個人價格報告",
  },
  {
    command: "/price-report now",
    description: "用目前設定立即產生一次報告，方便確認篩選結果。",
    imageLabel: "立即產生價格報告截圖預留",
    imageTitle: "立即產生報告",
    title: "預覽價格報告",
  },
] as const;

const serverCommandGuides = [
  {
    command: "/public-report manage",
    description: "設定發送頻道、分類、關鍵字與啟用狀態。",
    imageLabel: "公開報告管理面板截圖預留",
    imageTitle: "公開報告管理面板",
    title: "設定公開報告",
  },
  {
    command: "/public-report test",
    description: "送出測試報告，確認頻道權限與 embed 顯示正常。",
    imageLabel: "公開報告測試截圖預留",
    imageTitle: "公開報告測試",
    title: "測試公開報告",
  },
  {
    command: "/public-report status",
    description: "查看公開報告啟用狀態、頻道與最近一次發送結果。",
    imageLabel: "公開報告狀態截圖預留",
    imageTitle: "公開報告狀態",
    title: "檢查目前設定",
  },
] as const;

const discordFaqItems = [
  {
    question: "一般成員能用哪些指令？",
    answer: "一般成員可使用 /watch 與 /price-report；公開報告管理指令只提供給管理者。",
  },
  {
    question: "看不到 /public-report 怎麼辦？",
    answer: "請確認帳號具備管理伺服器權限，並重新開啟 Discord 指令選單。",
  },
  {
    question: "收不到私訊提醒怎麼辦？",
    answer: "請允許伺服器成員傳送私訊，或先在伺服器內對 bot 使用 /watch 重新建立互動。",
  },
] as const;

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
            <p>用 Discord 接收目標價提醒、個人價格報告與伺服器公開報告。</p>
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
            <div
              className="discord-visual-placeholder"
              aria-label="指令操作示意圖準備中"
              role="img"
            >
              <strong>Discord 指令截圖</strong>
              <span>預留圖片位置</span>
            </div>
            <p>後續可補上實際 Discord 操作畫面，讓使用者直接對照按鈕與表單。</p>
          </aside>
        </section>

        <section className="discord-section" aria-labelledby="quick-start-title">
          <div className="discord-section-heading">
            <span className="eyebrow">Quick start</span>
            <h2 id="quick-start-title">快速開始</h2>
            <p>先完成邀請，再依需求設定個人通知或伺服器公開報告。</p>
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
            <p>每個主要操作都保留截圖位置；補圖後可直接形成完整圖文教學。</p>
          </div>

          <div className="discord-command-group">
            <h3>個人通知</h3>
            <p className="discord-command-group-summary">
              一般使用者用這組指令追蹤商品與產生個人價格報告。
            </p>
            <div className="discord-command-guide-list">
              {personalCommandGuides.map((guide, index) => (
                <article className="discord-command-guide" key={guide.imageLabel}>
                  <div className="discord-guide-media">
                    <div
                      className="discord-guide-placeholder"
                      aria-label={guide.imageLabel}
                      role="img"
                    >
                      <span>{guide.imageTitle}</span>
                      <strong>預留截圖位置</strong>
                    </div>
                  </div>

                  <div className="discord-guide-copy">
                    <span className="discord-guide-step">個人 {index + 1}</span>
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
              管理者用這組指令指定頻道、測試權限並查看目前狀態。
            </p>
            <div className="discord-command-guide-list">
              {serverCommandGuides.map((guide, index) => (
                <article className="discord-command-guide" key={guide.imageLabel}>
                  <div className="discord-guide-media">
                    <div
                      className="discord-guide-placeholder"
                      aria-label={guide.imageLabel}
                      role="img"
                    >
                      <span>{guide.imageTitle}</span>
                      <strong>預留截圖位置</strong>
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
