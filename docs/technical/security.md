# 資安基準

第一版沒有會員、付款、管理後台或公開第三方 API。本文件聚焦網站查詢、read-only API、crawler、DB、raw snapshot、商品圖片與自架部署邊界。

## 參考基準

- OWASP Top 10:2021。
- OWASP API Security Top 10:2023。
- SQL Injection Prevention、XSS Prevention、CSRF Prevention、Secrets Management cheat sheets。

## Public Boundary

對外可存取：

- Next.js web app。
- 網站查詢 API。
- 站內商品圖片 API。

不得對外公開：

- PostgreSQL。
- crawler service。
- raw snapshot storage。
- raw snapshot viewer / download。
- parse error API。
- crawler trigger API。

第一版公開 API 只讀，不提供建立、修改或刪除資料 endpoint。

## Secrets

規則：

- `.env`、`.env.local`、DB password、SSH key、Cloudflare Tunnel token、部署 token 不提交。
- `.env.example` 只放非敏感欄位與 placeholder。
- `DATABASE_URL` 不出現在 log、API response、client bundle 或文件真實值。
- Web runtime source 不使用 `console.*`，避免把後端錯誤或 internal state 帶到 browser console。
- CLI / daemon 入口只輸出 redacted error message，不直接 `console.error(error)` 輸出 stack 或 secret-bearing message。
- secrets 外洩時需 rotate，並檢查 Git history、部署環境與 log。

## API Security

- query 做型別、範圍、長度與 allowlist 驗證。
- `pageSize` 有上限。
- `sort`、`status` 等 enum 不接受任意字串。
- 錯誤 response 使用泛用訊息。
- 不回傳 raw HTML、raw snapshot、parse error、crawler stack、computed `source_item_key`、獨立 `iBuyToken`、DB 連線或 env。
- `parse_errors.raw_image_url` 只供內部 debug，不公開。
- 不提供 crawler trigger 或 state-changing public endpoint。
- 公開 API 使用 bounded in-memory rate limit 作為 app-level abuse guard。
- `api:read` 預設每 client 每 60 秒 120 次，涵蓋 categories、source-status 與 product detail。
- `api:list` 預設每 client 每 60 秒 360 次，涵蓋商品列表查詢，避免正常快速切分類、翻頁或排序時被一般 read 額度誤傷。
- `api:image` 預設每 client 每 60 秒 360 次，涵蓋商品縮圖 API。
- client identity 優先使用 Cloudflare `CF-Connecting-IP`，其次 `X-Forwarded-For` 第一個值；不把 IP 寫入公開 response。
- 超限回 `429`，只包含泛用 `rate_limited` 錯誤與 `Retry-After` / `X-RateLimit-*` headers。
- 這個 limiter 是單一 web container 內的保底防護；多 replica 不共享狀態，大量流量仍需 Cloudflare WAF / rate limiting 先擋。

若未來 API 對第三方開放，需重新設計 auth、versioning、rate limit 與 abuse protection。

## SQL Injection

第一版以 Prisma query API 與參數化查詢為主。

規則：

- 不用字串拼接組 SQL。
- 必須 raw SQL 時使用參數化查詢。
- `q`、`igrp`、price、sort、page、pageSize 不直接拼 SQL 字串。
- 數字 query 先轉型與檢查範圍。

## XSS

商品名稱與分類資料視為不可信輸入。

規則：

- 使用 React / Next.js 預設文字渲染。
- 不用 `dangerouslySetInnerHTML` 顯示商品、來源內容或 raw snapshot。
- 不公開 raw HTML。
- 外部連結不得保留或輸出 `PHPSESSID`。
- 未來若做 raw snapshot viewer，需另設權限、escape、下載限制與 audit log。

## CSP And Headers

目前 CSP 是實用 baseline，不是最終嚴格 CSP。

基本方向：

- `default-src` 限本站。
- `script-src` / `style-src` 限本站；目前保留必要 inline 相容性。
- `img-src` 允許本站、`data:`、`blob:`；正式商品圖片走站內 API。
- `connect-src` 限本站；dev 可允許 local HTTP / WebSocket。
- `object-src 'none'`、`base-uri 'self'`、`frame-ancestors 'none'`。
- production 啟用 `upgrade-insecure-requests`。

安全 headers：

- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Permissions-Policy` 關閉不需要的 browser capability
- 不回 `X-Powered-By`

公開宣傳前需評估 stricter CSP、nonce / hash、`Report-Only` 觀察與最終圖片來源策略。

## 商品圖片安全

來源圖片：

- 只由 crawler 從 CoolPC 公開頁解析。
- 不接受使用者提交任意圖片 URL。
- 只允許預期 protocol、host 與 `/eval/{IGrp}/` 圖片 path。
- 不接受 `javascript:`、`data:`、非預期 host、session token。

正式顯示：

- 前端使用站內 `/api/product-images/{productId}.webp`。
- `web` 不在訪客請求期間抓 CoolPC 圖片。
- backfill / crawler 低頻建立或更新 WebP cache。
- 缺圖或圖片被移除時使用 fallback，不 hotlink 來源站。

若未來使用 image optimizer 或 proxy：

- 需明確 remote allowlist。
- 需補 SSRF 防護：protocol、host、port、redirect、private IP range、DNS rebinding。

## 來源方 / 權利人請求

第一版以人工流程處理，不建立管理後台或公開刪除 API。

請求入口暫用 GitHub Issues；正式網域後應改成更私密的 email 或聯絡頁。

請求至少需要：

- PartsRadarTW 商品頁 URL 或可識別商品名稱。
- 請求範圍：移除圖片、修正資料、移除商品頁等。
- 請求原因。
- 可公開聯繫方式。GitHub Issues 不應要求敏感身分證明。

處理原則：

- 明確來自來源方或權利人的合理請求，優先降低公開風險。
- 圖片請求先移除 / 停用站內縮圖並顯示 fallback。
- 商品資料請求需讓商品不再出現在列表、搜尋與詳細頁。
- 修正 parser / DB 後需確認下次匯入不會把問題帶回。
- 公開前最低機制採資料庫永久 override / removal table，不用公開刪除 API 或管理後台。
- 公開 API/UI 必須依 override 排除商品、停用來源連結或回落圖片 fallback。
- crawler、image backfill 與 link checker 必須讀取 override，略過受影響商品、圖片或來源連結，避免重新產生。
- 圖片快取清理由 idempotent ops script 依 product ID / image key 執行；重複執行不得破壞其他商品圖片。
- 內部紀錄保存日期、來源、商品 ID、來源 URL、採取動作與後續規則。

## CSRF And Access Control

第一版公開 API 只讀且無登入，CSRF 風險較低。

規則：

- `GET` endpoint 不修改資料。
- 未來若加入登入、管理後台、提醒設定或 crawler trigger，需重新設計 CSRF / auth。
- PostgreSQL 不開公網。
- crawler 不開 port。
- raw snapshot、parse error、`raw_image_url` 只限內部維運。

## Crawler And Outbound Safety

Crawler 只允許固定來源：

```text
https://www.coolpc.com.tw/eachview.php?IGrp={分類編號}
```

規則：

- 不接受公開使用者輸入 URL。
- production base URL 只允許 `https://www.coolpc.com.tw`。
- daemon 預設不隨 `docker compose up -d` 啟動，只能透過 `scheduled-crawler` profile。
- daemon command 保留 `--confirm-live-fetch`。
- 不對外開 port，不提供 HTTP trigger。
- interval / backoff 不低於 60 秒，分類間 delay 不低於 3000 ms。
- 疑似攔截停止當輪並 backoff。
- scheduled crawler 與 maintenance daemon 共用 external fetch lock，避免價格抓取、連結檢查與缺圖補齊同時打外部來源。
- manual crawler、scheduled crawler、link checker、image backfill 不應同時跑；手動 ops 前應先檢查 scheduled daemon 狀態或暫停相關 service。

## Raw Snapshot And Logging

Raw snapshot：

- gzip 不提交 Git。
- 不公開下載。
- 不由 web server 直接公開。
- `apps/crawler/tests/coolpc/fixtures` 只保留最小化 HTML；fixture 應移除 session token 與不必要大量內容。
- retention：一般 30 天、異常 90 天。

Logging：

- 不記錄 DB password、完整 `DATABASE_URL`、SSH key、部署 token、Cloudflare token。
- 公開 API 不回 stack trace。
- crawler log 可記錄分類、URL、HTTP status、內容狀態與錯誤類型。
- raw HTML 不寫入一般 application log。

## Post-v1 Hardening

以下不是 v1 blocker：

- Cloudflare WAF / Security Rules。
- 分散式 Rate limiting / Redis-backed limiter。
- 更嚴格 CSP。
- Bot / crawler 防護。
- Docker reverse proxy with HTTPS origin。
- 管理後台 auth / audit log。
- 自動弱點掃描與完整 monitoring。
