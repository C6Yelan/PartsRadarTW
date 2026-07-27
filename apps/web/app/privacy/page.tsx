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
      intro="本政策說明 PartsRadarTW 在提供網站與選用的 Discord 功能時，會處理哪些資料、如何使用與保存，以及使用者可以如何行使權利。"
      introTitle="本站不提供網站帳號、付款或購物功能。"
      lastUpdated={{ dateTime: "2026-07-27", label: "2026 年 7 月 27 日" }}
      subtitle="資料項目、保存期限與權利申請"
      title="隱私權政策"
    >
      <section className="public-info-section" id="privacy-scope">
        <h2>適用範圍與資料處理者</h2>
        <p>
          本政策適用於 PartsRadarTW 網站及其提供的 Discord 功能，資料管理者為 PartsRadarTW
          專案。網站服務由專案自行管理，並使用 Cloudflare 提供連線與安全防護；選用 Discord
          功能時，Discord 會處理帳號識別資料、Bot
          私訊及伺服器頻道訊息。這些服務可能在台灣以外的地區處理資料。
        </p>
        <p>前往原價屋、Discord、Cloudflare 或其他外部網站後，應另依該服務的政策處理。</p>
      </section>

      <section className="public-info-section" id="privacy-collected-data">
        <h2>蒐集與處理的資料</h2>
        <ul className="public-info-section-list">
          <li>
            使用 Discord
            功能時所需的使用者、伺服器及頻道識別碼，以及目標價提醒、報告篩選、發送時間與啟用狀態。
          </li>
          <li>通知是否成功、是否重複、發送時間及錯誤類別等必要紀錄；不會為此保存完整訊息內容。</li>
          <li>
            為維持連線安全及防止濫用而處理的 IP 位址、瀏覽器或裝置資訊、請求時間及必要的連線紀錄。
          </li>
          <li>使用者主動寄送的 Email、案件編號，以及確認 Discord 帳號控制權所需的驗證狀態。</li>
        </ul>
      </section>

      <section className="public-info-section" id="privacy-purpose">
        <h2>使用目的</h2>
        <p>
          上述資料只用於提供目標價提醒與價格報告、確認通知狀態、防止重複或濫用、維持服務安全、排查故障，以及處理資料權利申請。不會用於廣告投放、跨網站追蹤、出售個人資料或建立行銷個人檔案。
        </p>
      </section>

      <section className="public-info-section" id="privacy-retention">
        <h2>保存期限</h2>
        <ul className="public-info-section-list">
          <li>啟用中的目標價提醒與個人報告設定：功能使用期間。</li>
          <li>已停用的個人報告與目標價提醒：停用後 30 天。</li>
          <li>已停用的公開報告設定：依停用原因保存 30 天或 60 天。</li>
          <li>通知發送與系統安全紀錄：最長 30 天。</li>
          <li>
            已完成、取消或逾期的驗證案件會移除可直接識別 Discord
            使用者的資料；不含使用者識別資訊的最小案件紀錄再保存 7 天。
          </li>
        </ul>
      </section>

      <section className="public-info-section" id="privacy-browser-data">
        <h2>瀏覽器本機資料</h2>
        <p>
          配單中的商品
          ID、數量、順序與更新時間只儲存在目前瀏覽器的本機儲存空間，不會自動上傳，也不會跨裝置同步。清除本站的瀏覽器資料即可移除。
        </p>
      </section>

      <section className="public-info-section" id="privacy-requests">
        <h2>使用者權利與申請方式</h2>
        <p>
          使用者可以申請查詢或閱覽個人資料、取得複製本、補充或更正資料、停止蒐集、處理或使用資料，以及刪除資料。
        </p>
        <p>
          請寄信至 <a href="mailto:contact@partsradar.net">contact@partsradar.net</a>
          ，主旨填寫「[Privacy] 資料權利申請」，內文提供申請類型及 Discord
          使用者識別碼。請勿提供密碼、Bot token、備用碼、付款資料、身分證件或其他不必要的私人資料。
        </p>
        <p>
          為避免他人冒用申請，管理員建立案件後，Bot 會向該 Discord 帳號私訊 30
          分鐘有效的八位數驗證碼；請在原 Email 往來中回覆驗證碼。未提供 Discord
          使用者識別碼或未完成驗證時，將無法確認資料歸屬及處理申請，但不影響使用網站的基本查詢功能。驗證完成後原則上於
          30 日內處理，若案件需要額外確認會另行回覆。
        </p>
        <p>
          刪除申請完成後，使用中的系統會移除屬於該使用者的提醒、個人報告設定與通知紀錄，相關提醒與個人報告功能也會停止；共用商品、價格及其他使用者的資料不受影響。
        </p>
      </section>

      <section className="public-info-section" id="privacy-backups">
        <h2>備份與還原</h2>
        <p>
          資料刪除後，使用中的系統會立即停止使用並移除相關資料。無法逐筆修改的備份可能依既定保存週期保留至到期，因此備份中的副本不一定會同時消失；若使用備份還原系統，必須重新套用已完成的刪除要求，才會恢復相關通知服務。
        </p>
      </section>

      <section className="public-info-section" id="privacy-updates">
        <h2>聯絡與政策更新</h2>
        <p>
          如對本政策或個人資料處理有疑問，可透過上述 Email 聯絡。政策若有重要變更，會發布於
          <Link href="/announcements">網站公告</Link>。
        </p>
      </section>
    </PublicInfoPageLayout>
  );
}
