// apps/web/app/privacy/page.tsx
// 公開說明 PartsRadarTW 的資料項目、保存期限、處理角色與權利申請流程。

import type { Metadata } from "next";
import Link from "next/link";
import PublicInfoPageLayout from "../public-info/components/PublicInfoPageLayout";

export const metadata: Metadata = {
  alternates: {
    canonical: "/privacy",
  },
  title: "隱私權政策 | PartsRadarTW",
  description: "PartsRadarTW 的資料處理、保存期限與權利申請說明。",
};

export default function PrivacyPage() {
  return (
    <PublicInfoPageLayout
      intro="本政策說明網站與選用的 Discord 功能為了提供服務、維持安全及處理權利申請所使用的必要資料。"
      introTitle="本站不提供網站帳號、付款或購物功能。"
      lastUpdated={{ dateTime: "2026-07-27", label: "2026 年 7 月 27 日" }}
      subtitle="資料項目、保存期限與權利申請"
      title="隱私權政策"
    >
      <section className="public-info-section" id="privacy-scope">
        <h2>適用範圍與處理角色</h2>
        <p>
          本政策適用於 PartsRadarTW。網站與資料庫運行於專案自行管理的伺服器；Cloudflare
          提供公開連線與安全防護；Discord 處理 Bot
          私訊、伺服器頻道訊息及相關平台識別資料。這些服務可能在台灣以外處理資料。
        </p>
        <p>前往原價屋、Discord、Cloudflare 或其他外部網站後，應另依該服務的政策處理。</p>
      </section>

      <section className="public-info-section" id="privacy-collected-data">
        <h2>可能處理的資料</h2>
        <ul className="public-info-section-list">
          <li>
            Discord user、guild 與 channel ID，以及目標價 watch、報告篩選、發送時間與啟用狀態。
          </li>
          <li>
            發送、去重、retry、rate limit、權限錯誤與 delivery metadata；錯誤資料以類別、HTTP status
            與 provider code 為主。
          </li>
          <li>
            Cloudflare 及服務端為連線、安全與濫用防護可能處理的 IP、User-Agent、request metadata
            與時間。
          </li>
          <li>使用者主動寄出的 Email、案件編號與帳號控制權驗證狀態。</li>
        </ul>
      </section>

      <section className="public-info-section" id="privacy-purpose">
        <h2>使用目的</h2>
        <p>
          上述資料只用於發送目標價提醒、個人或公開價格報告、防止重複發送、處理 retry
          與權限失效、安全及濫用防護、服務維運、事故分析，以及完成資料查詢或刪除申請。不用於廣告投放、跨網站追蹤或建立行銷個人檔案。
        </p>
      </section>

      <section className="public-info-section" id="privacy-retention">
        <h2>保存期限</h2>
        <ul className="public-info-section-list">
          <li>啟用中的 watch 與個人報告設定：功能使用期間。</li>
          <li>已停用的個人報告設定與 target-price watch：30 天。</li>
          <li>Bot 確定被移除或頻道確定消失的公開報告設定：停用後 60 天。</li>
          <li>長期 permission failure 的公開報告設定：停用後 30 天。</li>
          <li>成功、skipped、failed 或 rate-limited delivery metadata：最長 30 天。</li>
          <li>Application logs：最長 30 天，實際輪替由部署端的 Docker 或 journald 管理。</li>
          <li>
            已 consume、cancel 或 expire 的驗證案件會清除可直接連回 Discord 使用者的 ID 與驗證碼
            digest；最小案件 metadata 再保存 7 天。
          </li>
        </ul>
      </section>

      <section className="public-info-section" id="privacy-browser-data">
        <h2>瀏覽器本機資料</h2>
        <p>
          配單中的商品 ID、數量、順序與更新時間儲存在目前瀏覽器的
          localStorage，不會自動上傳，也不會跨裝置同步。清除本站的瀏覽器資料即可移除。
        </p>
      </section>

      <section className="public-info-section" id="privacy-requests">
        <h2>資料查詢與刪除申請</h2>
        <p>
          請寄信至 <a href="mailto:contact@partsradar.net">contact@partsradar.net</a>
          ，主旨填寫「[Privacy] 資料查詢申請」或「[Privacy] 資料刪除申請」，內文提供申請類型及
          Discord user ID。請勿提供密碼、Bot
          token、備用碼、付款資料、身分證件或其他不必要的私人資料。
        </p>
        <p>
          管理員建立案件後，Bot 會向該 Discord 帳號私訊 30 分鐘有效的八位數驗證碼；請在原 Email
          thread 回覆驗證碼。未完成驗證時不會查詢或刪除個人資料。驗證完成後原則上於 30
          日內處理，若案件需要額外確認會另行回覆。
        </p>
        <p>
          Active database 中屬於該使用者的提醒、個人報告設定與 delivery metadata
          會以交易方式刪除；共用商品、價格及其他使用者資料不受影響。刪除完成後，既有提醒與個人報告功能會停止。
        </p>
      </section>

      <section className="public-info-section" id="privacy-backups">
        <h2>備份與還原</h2>
        <p>
          Active database 的刪除會立即停止正常使用並移除資料；無法逐筆修改的備份可能依部署端已固定的
          rotation 保留到期後自然移除，因此不宣稱所有備份副本會瞬間消失。還原期間必須先停止 Discord
          outbound，完成 migration、privacy cleanup、資料檢查及人工核准後才可恢復發送。
        </p>
      </section>

      <section className="public-info-section" id="privacy-updates">
        <h2>聯絡與政策更新</h2>
        <p>
          也可透過上述 Email 提出更正、停止使用、安全問題與網站錯誤回報。政策若有重要變更，會發布於
          <Link href="/announcements">網站公告</Link>。
        </p>
      </section>
    </PublicInfoPageLayout>
  );
}
