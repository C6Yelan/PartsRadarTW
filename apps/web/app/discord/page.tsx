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

        <Link className="control-button secondary discord-back-link" href="/">
          返回查詢
        </Link>
      </header>

      <main className="discord-page">
        <section className="discord-hero" aria-labelledby="discord-title">
          <div className="discord-hero-copy">
            <span className="eyebrow">PartsRadarTW Discord bot</span>
            <h2 id="discord-title">把商品價格變動帶到你的 Discord</h2>
            <p>
              Bot 提供目標價追蹤與個人價格報告。設定都在 Discord 內完成，網站不建立帳號，也不需要把
              Discord 身分綁定到網站登入。
            </p>
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
                  暫未開放邀請
                </span>
              )}
              <a className="control-button secondary" href="#discord-commands">
                查看指令說明
              </a>
            </div>
          </div>

          <aside className="discord-permission-panel" aria-label="權限需求">
            <h3>安裝權限</h3>
            <p>
              公開邀請使用 Discord application commands 與 bot scope，權限值為 0；不要求
              Administrator、Message Content 或頻道管理權限。
            </p>
            <p>若伺服器限制應用程式指令，請由伺服器管理員允許 PartsRadarTW 的 slash command。</p>
          </aside>
        </section>

        <section className="discord-section" aria-labelledby="discord-features">
          <h2 id="discord-features">可以做什麼</h2>
          <ul className="discord-feature-list">
            <li>
              <strong>目標價追蹤</strong>
              <span>指定商品與理想價格，達標後透過私訊通知。</span>
            </li>
            <li>
              <strong>個人價格報告</strong>
              <span>依分類、關鍵字與內容類型訂閱定期價格變動摘要。</span>
            </li>
            <li>
              <strong>即時預覽</strong>
              <span>先把報告傳到自己的 DM，確認私訊與篩選設定是否正常。</span>
            </li>
          </ul>
        </section>

        <section className="discord-section" id="discord-commands" aria-labelledby="commands-title">
          <h2 id="commands-title">指令說明</h2>
          <p>加入機器人後，在 Discord 輸入以下 slash command 開始設定。</p>
          <ul className="discord-command-list">
            <li>
              <code>/watch</code>
              <span>開啟商品目標價追蹤管理頁，可新增、修改或移除追蹤。</span>
            </li>
            <li>
              <code>/price-report settings</code>
              <span>設定個人價格報告的時間、分類、商品關鍵字、內容類型與顯示上限。</span>
            </li>
            <li>
              <code>/price-report now</code>
              <span>立即產生一份符合目前設定的價格報告。</span>
            </li>
          </ul>
        </section>

        <section className="discord-section" aria-labelledby="discord-notes">
          <h2 id="discord-notes">使用前確認</h2>
          <ul className="discord-note-list">
            <li>
              <strong>私訊通知</strong>：目標價達標與定期報告會透過 Discord DM 發送。
            </li>
            <li>
              <strong>資料來源</strong>：價格資料來自 PartsRadarTW 已整理的原價屋公開商品資訊。
            </li>
            <li>
              <strong>邀請狀態</strong>：如果按鈕顯示暫未開放，代表站台尚未設定公開邀請網址。
            </li>
          </ul>
        </section>
      </main>

      <SiteDisclaimer />
    </div>
  );
}
