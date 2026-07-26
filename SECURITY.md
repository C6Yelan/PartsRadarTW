# Security Policy

PartsRadarTW 會處理公開商品資料、部署 secrets、raw source snapshots，以及選用 Discord 功能所需的識別資料。本文件說明目前程式提供的安全界線與已知限制。

## 回報安全問題

若發現安全漏洞，請寄信至 `contact@partsradar.net`，主旨註明 `[Security]`，並提供受影響功能、可能影響與最小重現步驟。

請不要在公開 issue、Discussion 或 pull request 貼出 token、webhook、連線字串、個人資料、完整 exploit 或尚未修補的敏感細節；來信也請勿附上真實密碼、token 或不必要的個人資料。

## 公開介面

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
- CoolPC HTML 與商品圖片 request 只接受各自固定的原價屋 HTTPS host/path；每一個 redirect 都會重新驗證，並保留 timeout、response size、Content-Type 與內容驗證。訪客圖片請求不會 proxy 外部 URL。
- Raw snapshot 依內容狀態採不同保留期；實際部署必須依 [cleanup runbook](docs/operations.md#raw-snapshot-cleanup) 啟動並監控 cleanup。
- 瀏覽器配單只保存商品 ID、數量、順序與時間戳於 localStorage；refresh 商品資料不持久化。
- Discord 功能會保存 Discord user、guild、channel ID、價格報告偏好、目標價 watch 與 delivery audit metadata；保存期限及 Email／Bot DM 驗證的查詢與刪除流程以[隱私權政策](https://partsradar.net/privacy)為準。

## Rate limiting

每個 web process 使用有界 LRU rate limiter，設定與預設值以 [`.env.example`](.env.example) 為準。Production 只把單一合法 `CF-Connecting-IP` 視為 client identity，不信任 `X-Forwarded-For`；development／test 才允許單一合法 XFF。它不是跨 replica 的分散式限流器；大量公開流量仍應在 Cloudflare edge 設定額外限制。

## 維運安全

- Live crawler、圖片下載、刪除與 DB backfill 必須使用各 CLI 的明確 confirmation flag。
- Raw snapshot writer 與 cleanup 共用 mutation lock；外部來源抓取另有 overlap lock。
- 部署 migration 前先備份並確認 migration history；不要重寫已套用的 migration。
- Production log 與 Discord transport error 會套用 secret redaction；CoolPC network error 只保留 bounded 類別與安全錯誤碼。仍不應輸入不必要的敏感內容。
- Restore 必須依 [Operations restore gate](docs/operations.md#backup-與-restore-責任) 在隔離環境、Discord outbound 關閉的狀態完成。

## Repository 與部署端責任

Repository tests 可以證明 request identity、redirect policy、資料庫 migration、privacy cleanup 與瀏覽器流程。Cloudflare HSTS／WAF／rate limit、origin exposure、TrueNAS ACL／snapshot、GitHub protection／secret scanning、Discord Portal 權限／MFA，以及 CoolPC 內容使用決策都必須由部署或專案負責人另行人工確認；本文件不宣稱這些外部設定已完成，也不判定 CoolPC 擷取或圖片使用是否合法。
