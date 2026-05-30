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
- `.env.local`、`.env.production`、DB 密碼、VM SSH key、部署 token、TLS private key 不提交。
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
- `img-src` 允許本站、目前本機驗證用 CoolPC 圖片來源、`data:` 與 `blob:`。
- `connect-src` 限制為本站；開發環境額外允許 local HTTP / WebSocket。
- `object-src` 設為 `none`，`base-uri` 設為本站，`frame-ancestors` 設為 `none`，`form-action` 設為本站。
- production 環境啟用 `upgrade-insecure-requests`。

此 CSP 是目前階段的實用型 baseline，不是最終嚴格 CSP。公開宣傳或開放較大流量前，需在正式部署網域、圖片呈現方式與是否需要 CSP report endpoint 確認後，重新檢討 stricter CSP：

- 評估使用 nonce 或 hash，移除不必要的 inline script / inline style 例外。
- 依最終圖片策略收斂 `img-src`，例如自家縮圖網域、object storage / CDN 或 placeholder-only。
- 先以 `Content-Security-Policy-Report-Only` 觀察違規報告，再切換到 enforcement。
- 保留開發環境與 production 環境的差異，避免把 Next.js dev-only 例外帶入正式環境。

## 商品圖片 URL 安全

商品主要圖片由 crawler 從原價屋公開頁面解析，不接受使用者提交的任意圖片 URL。

規則：

- 只允許預期 CoolPC 來源網域或預期圖片路徑的圖片 URL。
- 圖片 URL 需限制 protocol、host 與 path pattern；不接受 `javascript:`、`data:` 或其他非預期 scheme。
- 本機驗證若使用一般 `<img>` 顯示外部圖片，需設定 `referrerPolicy`，避免把站內頁面路徑透過 Referer 傳給圖片來源站。
- 若使用 Next.js Image 或任何 image optimizer，必須設定明確 remote allowlist，只允許 `www.coolpc.com.tw` 與預期圖片路徑。
- 圖片 alt text 可由商品名稱產生，不需要爬取額外文字。
- API 不回傳 raw HTML、未驗證 URL、crawler 內部錯誤或 stack trace。
- 若後端未來會抓取、代理或快取圖片，需補 SSRF 防護：限制 protocol、host、port、redirect、private IP range 與 DNS rebinding 風險。

## 商品圖片來源與公開前處理策略

目前階段允許暫時使用 CoolPC / 原價屋來源圖片 URL，目的僅限本機開發、資料流驗證與小範圍測試。這不是 Phase 5 UI 的完成狀態，也不表示已取得圖片授權或一定符合合理使用。

目前資料流驗證階段不需要先完成：

- object storage。
- CDN。
- 圖片相關 DB 欄位大改。

進入 Phase 5 前，必須完成圖片呈現方式更換，至少完成以下其中一種方案：

- 改成自家小尺寸縮圖快取，前端顯示自己的縮圖 URL，不讓每位訪客直接消耗來源站圖片流量。
- 改成 placeholder / 分類圖示，降低圖片授權風險，但犧牲商品辨識體驗。

直接 hotlink 來源圖片只保留為本機資料流驗證與小範圍測試手段，不作為 Phase 5 UI 完成狀態。若採自家小尺寸縮圖快取，需同時規劃最小 storage、更新、失效與移除規則。

自家小尺寸縮圖通常仍是由來源圖片產生，因此它改善的是流量控制、穩定性與工程倫理，不代表自動取得圖片授權。

robots.txt 未禁止爬取、來源站沒有反爬機制、或公開頁面可由瀏覽器存取，都不等於授權使用圖片、完整商品文案、完整頁面 HTML 或原站排版。

第一版定位是非官方、非商業的商品搜尋與價格整理工具；不處理購買、付款、訂單或售後服務。商品查看與購買應導回原價屋來源頁，實際資訊以來源頁為準。

公開前待辦：

- 加上網站 footer 或關於頁聲明：非官方、非商業、資料來源、實際資訊以來源頁為準。
- 商品詳細頁或來源區塊應明確提供「前往原價屋查看／購買」。
- 規劃權利人或來源方要求移除資料 / 圖片時的處理方式；收到合理請求後應能移除。
- 避免複製完整商品文案、完整頁面 HTML、原站排版或任何不必要的創作性內容。

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

- 不記錄 DB 密碼、完整 `DATABASE_URL`、SSH key、部署 token 或 TLS private key。
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
