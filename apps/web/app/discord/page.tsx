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

const adminChecklist = [
  {
    title: "邀請機器人",
    command: "邀請連結",
    description: "使用本頁邀請按鈕將 PartsRadarTW bot 加入 Discord 伺服器。",
  },
  {
    title: "開啟管理面板",
    command: "/public-report manage",
    description: "具備管理伺服器權限的成員可設定公開報告頻道與啟用狀態。",
  },
  {
    title: "指定發送頻道",
    command: "設為此頻道",
    description: "在要接收公開價格報告的頻道按下按鈕，bot 會保存該頻道設定。",
  },
  {
    title: "送出測試報告",
    command: "/public-report test",
    description: "確認 bot 在該頻道具備傳送訊息與嵌入連結權限。",
  },
] as const;

const personalCommandGuides = [
  {
    command: "/watch",
    imageLabel: "/watch 管理面板介面圖準備中",
    imageTitle: "/watch 管理面板",
    points: [
      "輸入 /watch 會開啟個人商品追蹤面板。",
      "面板會列出目前追蹤的商品、目標價與達標狀態。",
      "從這裡可以新增追蹤、修改目標價或移除追蹤。",
    ],
    title: "開啟商品目標價追蹤",
  },
  {
    command: "新增追蹤",
    imageLabel: "新增追蹤彈出視窗介面圖準備中",
    imageTitle: "新增追蹤視窗",
    points: [
      "按下「新增追蹤」後會跳出填寫視窗。",
      "貼上 PartsRadarTW 商品頁網址，並輸入你的目標價。",
      "儲存後，商品達到目標價時會發送提醒。",
    ],
    title: "填寫商品網址與目標價",
  },
  {
    command: "管理追蹤",
    imageLabel: "管理既有追蹤介面圖準備中",
    imageTitle: "管理既有追蹤",
    points: [
      "在 /watch 面板選擇已追蹤商品即可查看設定。",
      "可直接修改目標價，或按確認按鈕後移除追蹤。",
      "修改目標價後，達標提醒會重新依新設定判斷。",
    ],
    title: "修改或移除既有追蹤",
  },
  {
    command: "/price-report settings",
    imageLabel: "個人價格報告設定介面圖準備中",
    imageTitle: "價格報告設定",
    points: [
      "設定要看的分類、商品關鍵字、內容類型與顯示上限。",
      "可用多組關鍵字追蹤不同商品範圍，例如 RTX 5090、DDR5。",
      "設定完成後，排程報告會依照個人條件產生。",
    ],
    title: "客製化個人價格報告",
  },
  {
    command: "/price-report now",
    imageLabel: "立即產生價格報告介面圖準備中",
    imageTitle: "立即產生報告",
    points: [
      "使用目前設定立即產生一次價格報告。",
      "適合在調整分類或關鍵字後確認結果是否符合預期。",
      "如果內容過長，bot 會像正式報告一樣拆成多封 embed。",
    ],
    title: "立即預覽報告結果",
  },
] as const;

const serverCommandGuides = [
  {
    command: "/public-report status",
    imageLabel: "公開報告狀態介面圖準備中",
    imageTitle: "公開報告狀態",
    points: [
      "查看目前公開報告是否啟用、設定在哪個頻道。",
      "同時會顯示最近一次公開報告的發送狀態。",
      "這個指令只用來檢查狀態，不會改動設定。",
    ],
    title: "查看伺服器公開報告狀態",
  },
  {
    command: "/public-report manage",
    imageLabel: "公開報告管理面板介面圖準備中",
    imageTitle: "公開報告管理面板",
    points: [
      "開啟公開價格報告設定面板。",
      "可將目前頻道設為公開報告頻道，或暫停、啟用、清除設定。",
      "公開報告會在排程爬蟲完成且有價格變動時發送。",
    ],
    title: "設定公開價格報告頻道",
  },
  {
    command: "/public-report test",
    imageLabel: "公開報告測試結果介面圖準備中",
    imageTitle: "公開報告測試結果",
    points: [
      "立即送出一份測試公開報告到已設定的頻道。",
      "若頻道權限不足，bot 會回覆需要補上的權限。",
      "適合在設定頻道後確認報告能正常顯示。",
    ],
    title: "驗證公開報告是否可送出",
  },
] as const;

const discordFaqItems = [
  {
    question: "看不到 bot 指令怎麼辦？",
    answer:
      "先確認邀請時有勾選應用程式指令，並重新開啟 Discord 指令選單；伺服器也可能限制特定身分組使用 app 指令。",
  },
  {
    question: "為什麼 /public-report 不是每個人都看得到？",
    answer:
      "公開報告會改動伺服器頻道設定，因此只提供給具備管理伺服器權限的成員；一般成員仍可使用 /watch 與 /price-report。",
  },
  {
    question: "公開報告可以只看特定商品嗎？",
    answer:
      "可以。管理者在 /public-report manage 面板中調整分類、降價或漲價、商品關鍵字與顯示上限，測試報告與自動報告都會套用同一組設定。",
  },
  {
    question: "收不到個人私訊提醒怎麼辦？",
    answer:
      "請確認你允許該伺服器成員傳送私訊，或先從伺服器內對 bot 發出 /watch、/price-report now 重新確認互動。",
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
          <span>個人追蹤與公開報告</span>
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
            <p>邀請 bot 後，可追蹤個人商品目標價，也能讓伺服器頻道接收公開價格報告。</p>
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
                管理者設定
              </a>
              <a className="control-button secondary" href="#discord-commands">
                查看指令說明
              </a>
            </div>
          </div>

          <aside className="discord-visual-panel" aria-label="Discord 指令操作示意圖">
            <div
              className="discord-visual-placeholder"
              aria-label="指令操作示意圖準備中"
              role="img"
            >
              <strong>指令操作示意圖</strong>
              <span>圖片準備中</span>
            </div>
            <p>一般使用者可使用個人指令；公開報告管理指令只會顯示給具備管理伺服器權限的成員。</p>
          </aside>
        </section>

        <section className="discord-section" id="discord-admin" aria-labelledby="admin-title">
          <div className="discord-section-heading">
            <span className="eyebrow">Server setup</span>
            <h2 id="admin-title">管理者設定檢查</h2>
            <p>公開價格報告只需要設定一次；完成後 bot 會自動把價格變動送到指定頻道。</p>
          </div>

          <ol className="discord-admin-checklist">
            {adminChecklist.map((item, index) => (
              <li key={item.title}>
                <span className="discord-check-number">{index + 1}</span>
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
            <p>圖片位置會補上 Discord 實際介面截圖；目前先以流程與填寫內容說明。</p>
          </div>

          <div className="discord-command-group">
            <h3>個人通知</h3>
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
                      <strong>圖片準備中</strong>
                    </div>
                  </div>

                  <div className="discord-guide-copy">
                    <span className="discord-guide-step">個人 {index + 1}</span>
                    <h4>{guide.title}</h4>
                    <code>{guide.command}</code>
                    <ul>
                      {guide.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="discord-command-group">
            <h3>伺服器公開報告</h3>
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
                      <strong>圖片準備中</strong>
                    </div>
                  </div>

                  <div className="discord-guide-copy">
                    <span className="discord-guide-step">管理 {index + 1}</span>
                    <h4>{guide.title}</h4>
                    <code>{guide.command}</code>
                    <ul>
                      {guide.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
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
            <p>整理邀請 bot、設定公開報告與接收個人通知時最常遇到的狀況。</p>
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
