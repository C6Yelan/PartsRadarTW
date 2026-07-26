// apps/web/app/discord/page.tsx
// 依一般使用者與伺服器管理員分流 Discord bot 邀請、指令摘要與常見問題。

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, ExternalLinkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";
import TopbarBrandNavigation from "../TopbarBrandNavigation";
import { adminCommands, discordFaqItems, userCommands } from "./content";

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
        </section>

        <section
          className="discord-section"
          id="discord-user-guide"
          aria-labelledby="discord-user-guide-title"
        >
          <div className="discord-section-heading">
            <h2 id="discord-user-guide-title">提醒與個人價格報告</h2>
            <p>在 Discord 輸入指令後，依畫面欄位完成設定；一般使用者不需要管理員權限。</p>
          </div>
          <CommandSummary commands={userCommands} />
        </section>

        <section
          className="discord-section"
          id="discord-admin-guide"
          aria-labelledby="discord-admin-guide-title"
        >
          <div className="discord-section-heading">
            <h2 id="discord-admin-guide-title">公開價格報告設定</h2>
            <p>管理員可設定公開報告頻道、發送測試，並查看排程與資料狀態。</p>
          </div>
          <aside className="discord-permission-notice" aria-label="公開報告必要權限">
            <strong>必要權限</strong>
            <p>使用者需要「管理伺服器」權限；bot 在目標頻道需要「傳送訊息」與「嵌入連結」權限。</p>
          </aside>
          <CommandSummary commands={adminCommands} />
        </section>

        <section className="discord-section" id="discord-faq" aria-labelledby="discord-faq-title">
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

function CommandSummary({ commands }: { commands: readonly CommandItem[] }) {
  return (
    <ul className="discord-command-summary-list" aria-label="指令摘要">
      {commands.map((item) => (
        <li key={item.command}>
          <code>{item.command}</code>
          <span>{item.purpose}</span>
          <span>{item.result}</span>
        </li>
      ))}
    </ul>
  );
}

type CommandItem = (typeof userCommands)[number] | (typeof adminCommands)[number];
