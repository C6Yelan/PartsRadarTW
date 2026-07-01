// apps/web/app/discord/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import SiteDisclaimer from "../site-disclaimer";

export const metadata: Metadata = {
  title: "Discord 通知 | PartsRadarTW",
  description: "邀請 PartsRadarTW Discord bot，設定商品目標價追蹤與個人價格報告。",
};

export const dynamic = "force-dynamic";

const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL?.trim();

const commandGuides = [
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
          <span>個人追蹤與價格報告</span>
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
            <p>邀請 bot 後，可在 Discord 追蹤商品目標價，或訂閱個人價格報告。</p>
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
            <p>若加入後看不到指令，請確認伺服器允許使用應用程式指令。</p>
          </aside>
        </section>

        <section className="discord-section" id="discord-commands" aria-labelledby="commands-title">
          <h2 id="commands-title">指令說明</h2>
          <p>加入後依照下方步驟操作；圖片位置會補上 Discord 實際介面截圖。</p>

          <div className="discord-command-guide-list">
            {commandGuides.map((guide, index) => (
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
                  <span className="discord-guide-step">步驟 {index + 1}</span>
                  <h3>{guide.title}</h3>
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
        </section>
      </main>

      <SiteDisclaimer />
    </div>
  );
}
