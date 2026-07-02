// apps/web/app/discord/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import SiteDisclaimer from "../site-disclaimer";

export const metadata: Metadata = {
  title: "Discord 通知 | PartsRadarTW",
  description: "邀請 PartsRadarTW Discord bot，設定即時目標價提醒、個人價格報告與伺服器公開報告。",
};

export const dynamic = "force-dynamic";

const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL?.trim();

const quickStartSteps = [
  {
    title: "邀請機器人",
    command: "邀請連結",
    description: "成員可使用 /watch、/price-report；管理者可設定 /public-report。",
  },
  {
    title: "即時目標價提醒",
    command: "/watch",
    description: "追蹤單一商品，價格更新後若達標就私訊提醒。",
  },
  {
    title: "個人價格報告",
    command: "/price-report settings",
    description: "設定分類與關鍵字，定時或手動產生個人彙整報告。",
  },
  {
    title: "伺服器公開報告",
    command: "/public-report manage",
    description: "管理者指定頻道，讓全伺服器看到公開彙整報告。",
  },
] as const;

const targetPriceCommandGuides = [
  {
    command: "/watch",
    description: "查看追蹤清單，新增、修改或移除單一商品的目標價。",
    imageLabel: "/watch 即時目標價提醒面板截圖預留",
    imageTitle: "/watch 即時提醒面板",
    title: "管理即時目標價提醒",
  },
  {
    command: "新增追蹤",
    description: "貼上商品頁網址並填入目標價；價格更新後達標會私訊你。",
    imageLabel: "新增追蹤視窗截圖預留",
    imageTitle: "新增追蹤視窗",
    title: "新增即時提醒",
  },
] as const;

const personalReportCommandGuides = [
  {
    command: "/price-report settings",
    description: "設定只屬於自己的分類、商品關鍵字、內容類型與顯示上限。",
    imageLabel: "個人價格報告設定截圖預留",
    imageTitle: "個人報告設定",
    title: "設定個人價格報告",
  },
  {
    command: "/price-report now",
    description: "用目前設定手動產生一次 DM 報告，確認篩選結果是否正確。",
    imageLabel: "個人價格報告預覽截圖預留",
    imageTitle: "個人報告預覽",
    title: "預覽個人價格報告",
  },
] as const;

const serverReportCommandGuides = [
  {
    command: "/public-report manage",
    description: "管理者設定公開頻道、分類、關鍵字與啟用狀態。",
    imageLabel: "伺服器公開報告管理面板截圖預留",
    imageTitle: "伺服器公開報告管理",
    title: "設定伺服器公開報告",
  },
  {
    command: "/public-report test",
    description: "送出測試報告，確認公開頻道權限與 embed 顯示正常。",
    imageLabel: "伺服器公開報告測試截圖預留",
    imageTitle: "伺服器公開報告測試",
    title: "測試伺服器公開報告",
  },
  {
    command: "/public-report status",
    description: "查看伺服器公開報告的啟用狀態、頻道與最近一次發送結果。",
    imageLabel: "伺服器公開報告狀態截圖預留",
    imageTitle: "伺服器公開報告狀態",
    title: "檢查伺服器公開報告",
  },
] as const;

const discordFaqItems = [
  {
    question: "一般成員能用哪些指令？",
    answer:
      "一般成員可使用 /watch 即時目標價提醒與 /price-report 個人價格報告；/public-report 只提供給管理者。",
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
