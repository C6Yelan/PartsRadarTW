# Security Policy

PartsRadarTW 會處理公開商品資料、部署 secrets、raw source snapshots，以及選用 Discord 功能所需的識別資料。本文件說明目前程式提供的安全界線與已知限制。

## 回報安全問題

GitHub private vulnerability reporting 目前尚未啟用。若發現安全漏洞，請寄信至 `partsradartw@gmail.com`，主旨註明 `[Security]`，並提供受影響功能、可能影響與最小重現步驟。

請不要在公開 issue、Discussion 或 pull request 貼出 token、webhook、連線字串、個人資料、完整 exploit 或尚未修補的敏感細節；來信也請勿附上真實密碼、token 或不必要的個人資料。

本專案沒有發布版本化的安全支援週期。安全修正以目前維護中的程式為準。

## 公開介面

公開部署包含網站頁面與 [Public API](docs/api.md) 列出的 routes。

網站沒有登入、管理後台、付款或下單介面。配單 refresh 不會保存 request body。

API input 會在 DB 查詢前驗證，錯誤回應不包含 Prisma、DB、crawler 或 env 細節。

## Secrets 與部署

- 真實 `.env` 一律不追蹤；`.env.example` 只放 placeholder 與非秘密預設。
- PostgreSQL 與 web 的 Compose port 預設只綁定 loopback。
- crawler 沒有公開 port 或 HTTP 觸發入口。
- Cloudflare Tunnel、Discord bot 與 admin webhook 都是選用功能，secret 只應存在於部署環境。
- Docker runtime 使用 non-root `node`；只有一次性的 `storage-init` 以 root 建立並調整 volume 權限。

Web 會設定 CSP、`Referrer-Policy`、`X-Content-Type-Options`、`X-Frame-Options` 與 `Permissions-Policy`，並移除 `X-Powered-By`。目前 CSP 為相容應用程式所需仍包含 `unsafe-inline`；HSTS 與 edge WAF 必須由實際入口另行設定，不能假設已啟用。

## 資料界線

- Raw HTML、parse errors、crawler stack trace、DB 欄位與內部識別不屬於 public API。
- 商品來源圖片只接受固定原價屋 HTTPS host/path，經 crawler 下載並轉成站內 WebP；訪客圖片請求不會 proxy 外部 URL。
- Raw snapshot 依內容狀態採不同保留期；實際部署必須依 [cleanup runbook](docs/operations.md#raw-snapshot-cleanup) 啟動並監控 cleanup。
- 瀏覽器配單只保存商品 ID、數量、順序與時間戳於 localStorage；refresh 商品資料不持久化。
- Discord 功能會保存 Discord user、guild、channel ID、價格報告偏好、目標價 watch 與 delivery audit metadata。程式目前沒有完整的 Discord 資料 retention／自助刪除 policy，因此不得宣稱沒有個人資料或保證固定刪除期限。

## Rate limiting

每個 web process 使用有界 LRU rate limiter，設定與預設值以 [`.env.example`](.env.example) 為準。它不是跨 replica 的分散式限流器；大量公開流量仍應在可信任的 reverse proxy 或 edge 層加入額外限制。

## 維運安全

- Live crawler、圖片下載、刪除與 DB backfill 必須使用各 CLI 的明確 confirmation flag。
- Raw snapshot writer 與 cleanup 共用 mutation lock；外部來源抓取另有 overlap lock。
- 部署 migration 前先備份並確認 migration history；不要重寫已套用的 migration。
- Production log 與 Discord transport error 會套用共用 secret redaction，但仍不應輸入不必要的敏感內容。
