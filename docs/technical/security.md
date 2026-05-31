# 資安基準

本文件定義 PartsRadarTW 第一版的資安基準。第一版不處理會員、付款、後台管理或公開第三方 API，因此本文件先聚焦在網站查詢、API、crawler、資料庫、raw snapshot 與自架部署的安全邊界。

本文件不是完整資安稽核清單。若未來加入登入、管理介面、價格提醒、Discord bot 管理通知或可修改資料的 API，需重新檢查並補充資安設計。

## 參考基準

第一版以 OWASP 常見文件作為安全設計參考：

- [OWASP Top 10:2021](https://owasp.org/Top10/2021/)：常見 Web application security risks。
- [OWASP API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)：常見 API security risks。
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)。
- [OWASP Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)。
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)。
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)。

## 第一版安全邊界

第一版對外只提供網站與查詢 API。

對外可存取：

- Next.js web app。
- 網站查詢 API。

不得對外公開：

- PostgreSQL。
- crawler service。
- raw snapshot storage。
- raw snapshot 下載或檢視 endpoint。
- parse error 查詢 endpoint。
- crawler 手動觸發 endpoint。

第一版 API 只提供讀取功能，不提供建立、修改或刪除資料的公開 endpoint。

## Secrets And Environment

規則：

- secrets 不進 Git。
- `.env.local`、`.env`、DB 密碼、VM SSH key、部署 token、Cloudflare Tunnel token 不提交。
- `.env.example` 只能放非敏感欄位名稱與安全預設值。
- `DATABASE_URL` 不應出現在 log、API response、前端 bundle 或文件範例的真實值中。
- 正式環境 secrets 由 VM、Docker Compose env file 或部署流程管理。

若未來 secrets 外洩，需更換對應密碼、token 或 key，並檢查 Git history、部署環境與 log。

## API Security

API 第一版需遵守：

- 查詢參數做型別、範圍與長度驗證。
- `pageSize` 設定上限。
- 不回傳 raw HTML、raw snapshot、parse error、crawler error stack、computed `source_item_key`、`iBuyToken` 獨立欄位或 DB 連線資訊；商品詳細頁可在 `source.url` 中使用原價屋 `iBuy` query 作為外部購買導流。
- `parse_errors.raw_image_url` 屬於內部 validation/debug 資料，不加入商品列表、商品詳細頁或任何公開 API response。
- 錯誤 response 使用泛用訊息，不把內部錯誤細節回傳給前端。
- 不提供公開 crawler trigger API。
- 不提供會修改資料的公開 API。

若未來 API 變成公開第三方 API，需重新設計 rate limit、API versioning、abuse protection 與 authentication。

## SQL Injection

第一版使用 Prisma 存取 PostgreSQL，預設應透過 Prisma query API 與參數化查詢處理使用者輸入。

規則：

- 不用字串拼接組 SQL。
- 若必須使用 raw SQL，需使用參數化查詢，不把 `q`、`igrp`、`minPrice`、`maxPrice`、`sort`、`page`、`pageSize` 直接拼進 SQL 字串。
- `sort`、`status` 等列舉型 query 必須使用 allowlist。
- 數字 query 需先轉型與檢查範圍。
- 字串搜尋需限制最大長度。

## XSS

網站會顯示原價屋商品名稱與分類資料，這些資料仍應視為不可信任輸入。

規則：

- React / Next.js 預設文字渲染即可處理一般 HTML escape，不應改成直接插入 HTML。
- 不使用 `dangerouslySetInnerHTML` 顯示商品名稱、來源內容或 raw snapshot。
- 不把 raw HTML 顯示在公開頁面。
- 若未來需要內部 raw snapshot viewer，需另開安全設計，至少包含權限、escape、下載限制與存取紀錄。
- 外部連結需避免保存或輸出包含 `PHPSESSID` 的 URL。

## Content Security Policy

Web app 目前透過 Next.js headers 設定基本 Content Security Policy，作為瀏覽器層級的額外防線。此設定目標是降低外部 script、object、frame、base URI 與非預期 form action 風險，但不取代 React escape、API allowlist、圖片 URL allowlist 與 raw HTML 不公開等資料層防護。

目前基本規則：

- `default-src` 限制為本站。
- `script-src` 限制為本站；目前仍保留 inline script 相容性，開發環境額外允許 Next.js dev 需要的 `unsafe-eval`。
- `style-src` 限制為本站並保留 inline style 相容性。
- `img-src` 允許本站、`data:` 與 `blob:`；前端商品圖片應走站內商品圖片 API，不直接 hotlink CoolPC 圖片。
- `connect-src` 限制為本站；開發環境額外允許 local HTTP / WebSocket。
- `object-src` 設為 `none`，`base-uri` 設為本站，`frame-ancestors` 設為 `none`，`form-action` 設為本站。
- production 環境啟用 `upgrade-insecure-requests`。

Web app 也應送出基本安全 headers：

- `Referrer-Policy: strict-origin-when-cross-origin`，避免跨站請求帶出完整內部路徑。
- `X-Content-Type-Options: nosniff`，降低錯誤 MIME sniffing 風險。
- `X-Frame-Options: DENY`，與 CSP `frame-ancestors 'none'` 一起避免被 iframe 嵌入。
- `Permissions-Policy` 預設關閉 camera、microphone、geolocation、payment、usb 等目前不需要的瀏覽器能力。
- 不回傳 `X-Powered-By`。

此 CSP 是目前階段的實用型 baseline，不是最終嚴格 CSP。公開宣傳或開放較大流量前，需在正式部署網域、圖片呈現方式與是否需要 CSP report endpoint 確認後，重新檢討 stricter CSP：

- 評估使用 nonce 或 hash，移除不必要的 inline script / inline style 例外。
- 依最終部署圖片策略收斂 `img-src`，例如正式站內縮圖網域、object storage / CDN 或 placeholder-only。
- 先以 `Content-Security-Policy-Report-Only` 觀察違規報告，再切換到 enforcement。
- 保留開發環境與 production 環境的差異，避免把 Next.js dev-only 例外帶入正式環境。

## 商品圖片 URL 安全

商品主要圖片由 crawler 從原價屋公開頁面解析，不接受使用者提交的任意圖片 URL。

規則：

- 只允許預期 CoolPC 來源網域或預期圖片路徑的圖片 URL。
- 圖片 URL 需限制 protocol、host 與 path pattern；不接受 `javascript:`、`data:` 或其他非預期 scheme。
- 前端顯示商品圖片時應使用站內商品圖片 API URL，例如 `/api/product-images/{productId}.webp`。
- 若本機驗證暫時回到一般 `<img>` 顯示外部圖片，需設定 `referrerPolicy`，避免把站內頁面路徑透過 Referer 傳給圖片來源站。
- 若未來使用 Next.js Image 或任何 image optimizer 直接處理外部來源，必須設定明確 remote allowlist，只允許 `www.coolpc.com.tw` 與預期圖片路徑。
- 圖片 alt text 可由商品名稱產生，不需要爬取額外文字。
- API 不回傳 raw HTML、未驗證 URL、crawler 內部錯誤或 stack trace。
- 若後端未來會抓取、代理或快取圖片，需補 SSRF 防護：限制 protocol、host、port、redirect、private IP range 與 DNS rebinding 風險。

## 商品圖片來源與公開前處理策略

目前階段允許暫時使用 CoolPC / 原價屋來源圖片 URL，目的僅限本機開發、資料流驗證與小範圍測試。這不是 Phase 5 UI 的完成狀態，也不表示已取得圖片授權或一定符合合理使用。

目前資料流驗證階段不需要先完成：

- object storage。
- CDN。
- 圖片相關 DB 欄位大改。

進入 Phase 5 前，必須完成圖片呈現方式更換。第一版採自家小尺寸縮圖快取，前端顯示站內商品圖片 API URL，不讓每位訪客直接消耗來源站圖片流量，也不依賴部署時圖片資料夾與 Web app 原始碼位在固定相對位置。placeholder / 分類圖示只作為缺圖、下載失敗或移除圖片後的 fallback，不作為主要圖片策略。

直接 hotlink 來源圖片只保留為本機資料流驗證與小範圍測試手段，不作為 Phase 5 UI 完成狀態。自家縮圖快取初始實作以手動 backfill 為主，不在訪客請求期間抓取來源圖片；來源圖片請求需使用低頻率與浮動間隔，避免固定快速抓取。production storage、更新、失效、搬遷與移除規則記錄在 deployment 文件，Phase 6 Docker / 部署實作需依該策略設定 persistent volume。

自家小尺寸縮圖通常仍是由來源圖片產生，因此它改善的是流量控制、穩定性與工程倫理，不代表自動取得圖片授權。

robots.txt 未禁止爬取、來源站沒有反爬機制、或公開頁面可由瀏覽器存取，都不等於授權使用圖片、完整商品文案、完整頁面 HTML 或原站排版。

第一版定位是非官方、非商業的商品搜尋與價格整理工具；不處理購買、付款、訂單或售後服務。商品查看與購買應導回原價屋來源頁，實際資訊以來源頁為準。

Production 商品縮圖快取安全原則：

- `PRODUCT_IMAGE_STORAGE_DIR` 應指向明確 mounted path，不依賴 repo 相對路徑。
- `web` 只讀取站內縮圖，不在訪客請求期間抓取來源站圖片。
- `crawler` 或 backfill 流程才可建立、更新或覆寫縮圖檔案，並需保留低頻率與浮動間隔。
- 圖片檔案不存在、被移除或讀取失敗時，前端使用 fallback，不重新 hotlink 來源圖片。
- 收到合理移除請求時，應移除或停用對應縮圖，並補 blocklist、DB override 或其他永久紀錄，避免後續 crawler / backfill 自動重新產生。
- 若保留處理證據，應放在非公開 quarantine 目錄，不得由 web service 直接公開。

公開前待辦：

- 已加上基本網站 footer 聲明：非官方、非商業、資料來源、實際資訊以來源頁為準，並提供 GitHub Issues 作為第一版臨時更正 / 移除請求入口。專用網域信箱或聯絡頁延後到第二版或正式網域確定後處理。
- 商品詳細頁或來源區塊應明確提供「前往原價屋查看／購買」。
- 依下方流程處理權利人或來源方要求移除資料 / 圖片的合理請求。
- 依 deployment 文件完成 production product image cache volume、備份、搬遷與清理策略。
- 避免複製完整商品文案、完整頁面 HTML、原站排版或任何不必要的創作性內容。

## 來源方或權利人更正 / 移除請求流程

第一版先採人工處理流程，不建立管理後台、自動審核系統或公開刪除 API。網站 footer 目前使用 GitHub Issues 作為臨時入口；這不是正式法務通道。第二版或正式網域確定後，應改成專用 email、聯絡頁或其他更適合一般使用者與來源方的私密聯絡方式。

請求入口應要求最少必要資訊：

- PartsRadarTW 商品頁 URL 或可識別的商品名稱。
- 請求範圍：移除圖片、修正商品資料、移除商品頁，或其他明確要求。
- 請求原因：來源方要求、權利人要求、資料錯誤、圖片不應使用、連結失效或其他原因。
- 可公開提供的聯繫方式或後續確認方式。GitHub Issues 是公開頁面，不應要求對方在 issue 中提供身分證明、合約、內部文件或其他敏感資料。

收到請求後的處理原則：

- 對於明確來自來源方或權利人的合理請求，優先降低公開風險，不以嚴格法務審查拖延移除。
- 若請求只針對圖片，優先移除或停用站內快取縮圖，前端應顯示既有 fallback，不應顯示破圖或重新 hotlink 來源圖片。
- 若請求針對商品資料或商品頁，應讓該商品不再出現在公開列表、搜尋結果與商品詳細頁；不能只在單一 UI 位置隱藏。
- 若資料錯誤但不需要移除，可先修正 crawler/parser 規則或 DB 內容，並確認下一次資料匯入不會把錯誤內容重新帶回。
- 若移除是因為來源方或權利人要求，需建立 blocklist、parser 規則或人工維護紀錄，避免後續 crawler 或 backfill 自動重新匯入同一筆資料或圖片。
- 若只是不確定的第三方檢舉，可先暫時隱藏有疑慮圖片或商品，待確認後再決定是否恢復。

每次處理應留下內部紀錄，但不要公開敏感資料。紀錄至少包含：

- 收到日期。
- 請求來源與公開聯繫入口。
- 受影響的商品 ID、商品名稱、來源 URL 或圖片 URL。
- 採取的動作，例如移除快取圖、停用公開商品、修正 parser 規則、加入 blocklist。
- 處理日期與處理人。
- 是否需要後續在正式儲存、crawler 排程或資料重匯入流程中補永久規則。

正式部署前仍需決定 production 層面的具體執行方式，例如快取清理命令、DB override / blocklist 設計、crawler 是否讀取移除清單，以及是否建立更私密的聯絡入口。圖片檔案儲存位置與 production volume 原則記錄在 deployment 文件。

## CSRF

第一版公開 API 只提供讀取功能，且不提供登入與狀態修改 endpoint，因此 CSRF 風險較低。

規則：

- `GET` endpoint 不應修改資料。
- 若未來加入登入、管理後台、使用者提醒設定、crawler 手動觸發或任何 state-changing endpoint，需加入 CSRF 防護或使用適合 API 架構的同等防護。
- 未來 state-changing endpoint 需避免單靠 cookie session 就接受跨站請求。

## Access Control

第一版沒有會員與管理後台，因此 access control 主要是部署與 API 邊界。

規則：

- PostgreSQL 不開放公網。
- crawler 不對外開 port。
- snapshot storage 不提供公開路徑。
- production logs、raw snapshot、parse error 與 `raw_image_url` 僅限伺服器內部或管理者維運使用。
- 未來若加入管理功能，必須先設計 authentication、authorization、session 管理與 audit log。

## SSRF And Outbound Requests

第一版 crawler 只允許抓取固定來源：

```text
https://www.coolpc.com.tw/eachview.php?IGrp={分類編號}
```

規則：

- crawler 不接受使用者輸入的任意 URL。
- `COOLPC_BASE_URL` 應只在環境設定中指定，不由前端或公開 API 控制。
- 若未來支援更多來源，需使用 allowlist，不提供任意 URL fetch。

## Raw Snapshot

raw snapshot 用於 parser 重跑、除錯與攔截判斷，不是公開資料產品。

規則：

- raw snapshot 壓縮檔不提交 Git。
- raw snapshot 不提供公開下載。
- raw snapshot storage 不由 web server 直接公開。
- API 不回傳 raw HTML。
- fixture 若需要提交，應移除 `PHPSESSID` 與不必要的大量內容。
- raw snapshot retention 依資料流文件規則執行，一般 30 天、異常 90 天。

## Logging

log 應協助除錯，但不能洩漏內部資料。

規則：

- 不記錄 DB 密碼、完整 `DATABASE_URL`、SSH key、部署 token 或 Cloudflare Tunnel token。
- 不在公開 API response 回傳 stack trace。
- crawler error 可記錄分類、URL、HTTP status、內容判定狀態與錯誤類型。
- raw HTML 不直接寫入一般 application log；若需保存，使用 raw snapshot storage。

## 第一版不處理

第一版不先建立：

- 使用者帳號安全策略。
- 密碼儲存策略。
- OAuth / Discord login。
- 管理後台權限模型。
- 自動弱點掃描流程。
- WAF 或完整 SIEM / monitoring。

以上項目等功能進入規劃後再補。
