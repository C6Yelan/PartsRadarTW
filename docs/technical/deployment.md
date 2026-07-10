# 部署設計

本文件定義第一版自架部署邊界。可執行指令、private validation、Cloudflare Tunnel、scheduled crawler、cleanup 與 backfill 流程統一放在 [Operations Runbook](operations-runbook.md)。

## 部署目標

- Next.js 網站可對外提供查詢服務。
- crawler 在背景獨立執行，不影響 web request。
- PostgreSQL、raw snapshots、product image cache 都能持久保存。
- web、crawler、postgres、Cloudflare Tunnel 清楚分離。
- secrets 不進 Git。
- 後續價格歷史、配單、Excel 匯出與營運監控可在同一部署邊界內擴充，不以帳號或使用者通知服務為前提。

## 目標環境

第一個正式環境預計是 Ubuntu VM：

- Docker。
- Docker Compose。
- 對外網域與 HTTPS。
- Persistent volume 或主機掛載目錄。

等實際主機條件明確後再決定：

- Ubuntu 精確版本。
- CPU、RAM、磁碟。
- 備份儲存位置。
- CI/CD 與監控工具。

## Runtime Services

| Service | 責任 |
| --- | --- |
| `storage-init` | 一次性初始化 snapshot / product image named volume 權限 |
| `web` | Next.js 網站與查詢 API |
| `crawler` | 手動 crawl / backfill / ops tools |
| `crawler-daemon` | scheduled CoolPC crawl + new-product image cache follow-up |
| `raw-snapshot-cleanup-daemon` | scheduled raw snapshot cleanup |
| `smoke-daemon` | scheduled production smoke and admin webhook notification |
| `discord-bot` | Discord slash command bot for personal DM notifications |
| `postgres` | 商品、價格、crawler 狀態與 metadata |
| `cloudflared` | Cloudflare Tunnel public entry |

邊界：

- `web` 不執行 crawler、不抓 CoolPC、不清 raw snapshot。
- `crawler` 不對外提供網站或 API。
- `postgres` 不對公網開放。
- `cloudflared` 是公開入口；主機不需要直接開 HTTP/HTTPS inbound port。

## Compose 口徑

正式部署與本機 PostgreSQL 開發共用 `compose.yml` 作為 core runtime；crawler / cleanup daemons 放在 `compose.crawler.yml`，smoke / Discord bot 放在 `compose.ops.yml`，public tunnel 放在 `compose.tunnel.yml`。

預設 app stack：

- `postgres`
- `migrate`
- `seed`
- `web`

明確 profile：

- `manual-crawler`
- `scheduled-crawler`
- `ops`
- `discord-bot`
- `public-tunnel`

規則：

- `storage-init` 以 root 執行一次性 `mkdir` / `chown`，只修正 mounted storage volume 權限，不跑 crawler、不連 DB。
- Docker named volume 會覆蓋 image build 階段對 mount point 做過的 `chown`；初次部署或重建 volume 後需讓 `storage-init` 成功完成。
- `web`、`crawler`、`crawler-daemon`、`raw-snapshot-cleanup-daemon` 與 `smoke-daemon` 都等 `storage-init` 成功後才啟動；長時間 runtime 仍使用非 root user。
- `crawler`、`crawler-daemon` 與 `raw-snapshot-cleanup-daemon` 放在 `compose.crawler.yml`；啟動時需搭配 `-f compose.yml -f compose.crawler.yml`。
- `smoke-daemon` 與 `discord-bot` 放在 `compose.ops.yml`；啟動時需搭配 `-f compose.yml -f compose.ops.yml`。
- `crawler` 預設 command 是 help，避免 `docker compose up` 意外 live fetch。
- `crawler-daemon` 與 `raw-snapshot-cleanup-daemon` 在 `scheduled-crawler` profile 啟動；crawler command 保留 `--confirm-live-fetch`。
- `crawler-daemon` 使用 `EXTERNAL_FETCH_LOCK_DIR` 避免多個 crawler process 同時抓來源；lock contention 依 `CRAWLER_LOCK_RETRY_SECONDS` 重試。新品圖片快取只在每輪價格 crawl 完成並釋放 lock 後針對本輪新增商品執行，既有缺圖修復仍使用手動 backfill 工具。
- `cloudflared` 放在 `compose.tunnel.yml`，只在 `public-tunnel` profile 啟動。
- scheduled 與 manual live crawl 固定使用官方 CoolPC URL；raw replay 只保留在 `manual:validate-coolpc-live`，且不再提供來源網址設定。
- `web` 預設綁 `127.0.0.1:${WEB_PORT:-3000}`；公開流量走 Cloudflare Tunnel。
- `POSTGRES_*` 在 Compose 中必填，不使用 development fallback。
- `.env.example` 只放非敏感模板；正式 `.env` 不提交。

## Runtime Image Hygiene

`.dockerignore` 應排除：

- `.env`、`.env.*`、secret、token。
- `.git`、local agent metadata、`PROJECT_CONTEXT.md`。
- `logs/`、`temp/`、`storage/`、raw snapshots、product image cache。
- `docs/`、repo-only 文件與部署輔助檔。
- tests、fixtures、Vitest config 與測試輸出。

`web` container 仍需要 `DATABASE_URL`；此 secret 不得出現在 log、API response、client bundle 或文件真實值中。

## Storage

Production 至少需要：

| 類型 | 用途 |
| --- | --- |
| PostgreSQL data volume | 保存 DB |
| Snapshot storage volume | 保存 raw snapshot gzip |
| Product image cache volume | 保存站內 WebP 縮圖 |

建議主機路徑：

```text
/srv/partsradar-tw/postgres/
/srv/partsradar-tw/snapshots/
/srv/partsradar-tw/product-images/
```

規則：

- volume 內容不提交 Git。
- Docker named volume 初次建立時可能是 `root:root`，且會覆蓋 Docker image build 階段的 mount point owner。`storage-init` 必須在寫入 snapshot / product image cache 的服務啟動前完成，讓 `/var/lib/partsradar/snapshots` 與 `/var/lib/partsradar/product-images` 屬於 `node:node`。
- 若 crawler log 出現 `EACCES` writing `/var/lib/partsradar/snapshots/...html.gz`，先檢查 mounted volume owner 是否仍為 `node:node`，再重跑 `storage-init`。
- raw snapshot 一般 30 天、異常 90 天。
- price snapshots 不套用 raw snapshot retention。
- raw snapshot cleanup 指令與 daemon 見 [Operations Runbook](operations-runbook.md#raw-snapshot-cleanup)。

## Product Image Cache

第一版正式 UI 使用站內小尺寸 WebP 縮圖快取，不在訪客請求期間抓來源站圖片，也不直接 hotlink CoolPC。

建議 container path：

```text
PRODUCT_IMAGE_STORAGE_DIR=/var/lib/partsradar/product-images
```

責任：

- `web` 只讀 `PRODUCT_IMAGE_STORAGE_DIR`，透過 `/api/product-images/{productId}.webp` 回傳。
- `crawler-daemon` 只針對本輪新增商品建立縮圖，不做全量或反覆缺圖掃描。
- 手動 backfill 工具負責新主機、重建 volume 或大量缺圖修復。
- 缺圖、檔案不存在或讀取失敗時，前端使用 fallback。
- 圖片 cache 需納入備份 / 搬遷計畫，不視為可任意丟棄的暫存。

## Environment And Secrets

正式 `.env` 至少包含：

| 名稱 | 用途 |
| --- | --- |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB 設定；密碼需強密碼 |
| `POSTGRES_BIND_HOST` | 正式預設 `127.0.0.1` |
| `DATABASE_URL` | host-side Prisma 指令使用 |
| `WEB_BIND_HOST` | Tunnel / reverse proxy 情境維持 `127.0.0.1` |
| `API_READ_RATE_LIMIT_MAX` / `API_LIST_RATE_LIMIT_MAX` / `API_IMAGE_RATE_LIMIT_MAX` | Web API 每 window 的 read / list / image 限流額度 |
| `API_RATE_LIMIT_WINDOW_SECONDS` / `API_RATE_LIMIT_CACHE_SIZE` | Web API 限流 window 與 bounded cache 大小 |
| `CSP_MODE` / `CSP_REPORT_URI` | Web build 時的 CSP enforce / report-only 模式與可選回報端點 |
| `SNAPSHOT_STORAGE_DIR` | container 內 snapshot path |
| `PRODUCT_IMAGE_STORAGE_DIR` | container 內縮圖 path |
| `CRAWLER_INTERVAL_SECONDS` / `CRAWLER_BACKOFF_SECONDS` / `CRAWLER_LOCK_RETRY_SECONDS` / `CRAWLER_CATEGORY_DELAY_MS` | scheduled crawler 節奏 |
| `CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS` / `CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS` / `CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS` / `CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES` | scheduled crawler 新增商品圖片快取節奏 |
| `EXTERNAL_FETCH_LOCK_DIR` / `EXTERNAL_FETCH_LOCK_STALE_SECONDS` | scheduled crawler 外部抓取鎖 |
| `RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS` | cleanup daemon 節奏 |
| `DISCORD_BOT_TOKEN` / `DISCORD_APPLICATION_ID` | Discord bot token 與 application id；公開價格報告頻道由 `/public-report` 指令設定 |
| `NEXT_PUBLIC_DISCORD_BOT_INVITE_URL` | 網站 `/discord` 邀請按鈕使用的公開 Discord bot invite URL；由 web runtime 讀取，不得放 token。 |
| `DISCORD_BOT_REGISTER_COMMANDS_ON_START` / `DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED` / `DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED` / `DISCORD_FEATURE_TARGET_WATCHES_ENABLED` | Discord bot 指令註冊與 public / personal / target watch 子功能 runtime flags；flags 預設 `true`，可作為 emergency kill switch |
| `DISCORD_PRICE_REPORT_MAX_ITEMS` / `DISCORD_BOT_COMMAND_COOLDOWN_SECONDS` / `DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS` | Discord bot 報告列數、cooldown 與每日報告 fallback 掃描上限；近期待發報告會睡到 due time |
| `CLOUDFLARED_IMAGE` | 固定版本 cloudflared image |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel token |
| `NODE_ENV` | production |

Discord bot 權限：

- 公開安裝 invite URL 使用 `scope=bot%20applications.commands` 與 `permissions=0`。
- URL 格式：`https://discord.com/oauth2/authorize?client_id=<DISCORD_APPLICATION_ID>&scope=bot%20applications.commands&permissions=0`
- Developer Portal 不需要開啟 privileged gateway intents；程式以 `intents: 0` 連線。
- 不要求 `Administrator`、`Read Message History` 或 `Message Content Intent`。
- `/public-report` 註冊為管理者指令，只有具備管理伺服器權限的成員通常會在 Discord 指令清單看到；這是 command visibility 設定，不是 bot 安裝權限。
- `/public-report status/manage/test` 分別用於查看狀態、調整公開報告頻道與發送測試報告；管理面板可調整分類、降價 / 漲價、商品關鍵字與顯示上限。
- 公開價格報告目標頻道需允許 bot `Send Messages` 與 `Embed Links`；若缺少權限，bot 會在 `/public-report test` 或面板測試流程回覆可讀中文提示。
- Slash command interaction response 與使用者 DM 不需要伺服器管理權限；admin 維運告警仍走 admin webhook。
- 若使用者看不到指令，通常是 `applications.commands` 未安裝或伺服器整合設定限制；bot 收不到 interaction 時無法主動回覆，只能依安裝文件重新邀請或請伺服器管理員調整 Discord Integrations / App command permissions。

規則：

- `.env`、DB password、SSH key、Cloudflare token 不提交。
- `.env.example` 只能放欄位與非敏感 placeholder。
- 未載入 `compose.tunnel.yml` 時不需要 Cloudflare Tunnel placeholder；真正啟動 tunnel 前必須換成固定版本 image 與真實 token。

## Deployment Flow

概念流程：

1. VM 安裝 Docker / Compose。
2. 取得 repo 或部署產物。
3. 建立 `.env` 並替換所有 placeholder。
4. 建立 persistent volumes。
5. 執行 `storage-init`，初始化 snapshot / product image volume 權限。
6. 啟動 `postgres`。
7. 執行 migration。
8. 執行 seed。
9. 啟動 `web`。
10. private validation `/api/source-status`。
11. 視需要先手動跑 product image backfill。
12. 以 `compose.crawler.yml` 啟動 `scheduled-crawler` profile 中的 `crawler-daemon` 與 `raw-snapshot-cleanup-daemon`。
13. 以 `compose.ops.yml` 啟動 `ops` profile 中的 `smoke-daemon`。
14. 若啟用 Discord 個人化通知，設定 bot secret 後以 `compose.ops.yml` 啟動 `discord-bot` profile。
15. 建立 Cloudflare remotely-managed tunnel。
16. 以 `compose.tunnel.yml` 啟動 `public-tunnel` profile。
17. 驗證正式網域、API、圖片 API、crawler、smoke、Discord bot 與資料狀態。

## Migration / Backup / Monitoring

Migration：

- 正式部署使用 `prisma migrate deploy` 或 root `pnpm db:deploy`。
- `20260702093000_add_discord_public_report_filters` 會替 `discord_public_price_report_settings` 新增公開報告篩選欄位；部署後既有公開報告預設維持全部分類、降價與漲價、無關鍵字、最多 50 筆。
- 從舊版升級時，套用 G03 migration 前先用舊版 Compose definition 停止並移除 `maintenance-daemon` container，避免舊 process 在 table drop 後繼續存取已移除 schema。
- `20260710120000_remove_product_link_health` 會刪除 link-health table 與 enums；部署前必須備份 DB，rollback 需使用備份或另寫反向 migration，不能假設 dropped data 可自動復原。
- migration 失敗時不啟動新版服務。
- schema 變更前需有備份與本機 / staging-like 驗證。

Backup：

- PostgreSQL 最優先。
- Product image cache 應備份或有明確重建計畫。
- Raw snapshot 可依 retention 與容量決定備份範圍。
- DB 與 image cache 還原時間點需盡量接近。
- `pnpm backup:create` 會建立 PostgreSQL dump、product image volume archive 與 checksum；`BACKUP_INCLUDE_SNAPSHOTS=1` 時才額外封存 raw snapshots。
- `pnpm backup:restore-drill -- backups/<timestamp>` 只還原到臨時 drill database，驗證 dump 可讀後預設刪除該臨時 DB，不覆蓋正式 DB。

最小監控：

- `web`、`crawler-daemon`、`smoke-daemon`、`discord-bot`、`postgres` 存活。
- 最近 successful crawl。
- backoff 狀態。
- snapshot / image cache 容量。
- 商品圖片 API 404 / fallback 是否異常增加。
- Discord bot notification delivery failed / rate limited 是否異常增加。

## Security And Rollback

資安基準以 [security.md](security.md) 為準。部署層最低要求：

- PostgreSQL 不對公網。
- Cloudflare Tunnel 模式不直接開 HTTP/HTTPS inbound port。
- raw snapshot 不公開。
- API 不暴露 crawler internal error、raw HTML 或 secret。

Rollback：

- 保留上一版 image 或部署產物。
- migration 前先備份 DB。
- web 新版失敗先回復 web image。
- crawler 解析異常時先停 crawler，避免繼續寫錯資料。
- migration 是否可回退依該 migration 設計判斷。
