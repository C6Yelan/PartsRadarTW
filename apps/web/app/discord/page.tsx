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

          <aside className="discord-permission-panel" aria-label="權限需求">
            <h3>安裝提醒</h3>
            <p>若加入後看不到指令，請確認伺服器允許使用應用程式指令。</p>
          </aside>
        </section>

        <section className="discord-section" id="discord-commands" aria-labelledby="commands-title">
          <h2 id="commands-title">指令說明</h2>
          <p>加入後在 Discord 輸入以下指令開始設定。</p>
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
      </main>

      <SiteDisclaimer />
    </div>
  );
}
