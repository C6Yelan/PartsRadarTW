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
| `crawler-daemon` | scheduled CoolPC crawl |
| `maintenance-daemon` | scheduled link health check and missing image backfill |
| `raw-snapshot-cleanup-daemon` | scheduled raw snapshot cleanup |
| `discord-bot` | Discord slash command bot for personal DM notifications |
| `postgres` | 商品、價格、crawler 狀態與 metadata |
| `cloudflared` | Cloudflare Tunnel public entry |

邊界：

- `web` 不執行 crawler、不抓 CoolPC、不清 raw snapshot。
- `crawler` 不對外提供網站或 API。
- `postgres` 不對公網開放。
- `cloudflared` 是公開入口；主機不需要直接開 HTTP/HTTPS inbound port。

## Compose 口徑

正式部署與本機 PostgreSQL 開發共用 `compose.yml`。

預設 app stack：

- `postgres`
- `migrate`
- `seed`
- `web`

明確 profile：

- `manual-crawler`
- `scheduled-crawler`
- `public-tunnel`

規則：

- `storage-init` 以 root 執行一次性 `mkdir` / `chown`，只修正 mounted storage volume 權限，不跑 crawler、不連 DB。
- Docker named volume 會覆蓋 image build 階段對 mount point 做過的 `chown`；初次部署或重建 volume 後需讓 `storage-init` 成功完成。
- `web`、`crawler`、`crawler-daemon`、`maintenance-daemon` 與 `raw-snapshot-cleanup-daemon` 都等 `storage-init` 成功後才啟動；長時間 runtime 仍使用非 root user。
- `crawler` 預設 command 是 help，避免 `docker compose up` 意外 live fetch。
- `crawler-daemon` 與 `maintenance-daemon` 只在 `scheduled-crawler` profile 啟動，且 command 保留 `--confirm-live-fetch`。
- `crawler-daemon` 與 `maintenance-daemon` 共用 `EXTERNAL_FETCH_LOCK_DIR`，避免定期價格抓取、連結檢查與缺圖補齊同時打外部來源。
- `cloudflared` 只在 `public-tunnel` profile 啟動。
- `COOLPC_BASE_URL` 在 production Compose 固定為 `https://www.coolpc.com.tw`。
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
- `crawler` 或 backfill 工具負責建立 / 更新縮圖。
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
| `SNAPSHOT_STORAGE_DIR` | container 內 snapshot path |
| `PRODUCT_IMAGE_STORAGE_DIR` | container 內縮圖 path |
| `CRAWLER_INTERVAL_SECONDS` / `CRAWLER_BACKOFF_SECONDS` / `CRAWLER_CATEGORY_DELAY_MS` | scheduled crawler 節奏 |
| `CRAWLER_IMAGE_BACKFILL_LIMIT` / `CRAWLER_IMAGE_BACKFILL_MIN_DELAY_MS` / `CRAWLER_IMAGE_BACKFILL_MAX_DELAY_MS` / `CRAWLER_IMAGE_BACKFILL_TIMEOUT_MS` | scheduled crawler 成功後的小批次即時補圖節奏 |
| `MAINTENANCE_INTERVAL_SECONDS` / `MAINTENANCE_INITIAL_DELAY_SECONDS` / `MAINTENANCE_TASK_COOLDOWN_SECONDS` | scheduled maintenance 節奏 |
| `MAINTENANCE_LINK_LIMIT` / `MAINTENANCE_LINK_STALE_AFTER_HOURS` / `MAINTENANCE_LINK_MIN_DELAY_MS` / `MAINTENANCE_LINK_MAX_DELAY_MS` | link health maintenance 節奏 |
| `MAINTENANCE_IMAGE_LIMIT` / `MAINTENANCE_IMAGE_MIN_DELAY_MS` / `MAINTENANCE_IMAGE_MAX_DELAY_MS` | missing image backfill maintenance 節奏 |
| `EXTERNAL_FETCH_LOCK_DIR` / `EXTERNAL_FETCH_LOCK_STALE_SECONDS` | 外部抓取 shared lock |
| `RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS` | cleanup daemon 節奏 |
| `DISCORD_BOT_TOKEN` / `DISCORD_APPLICATION_ID` / `DISCORD_GUILD_ID` | Discord bot 個人化通知設定；只在 `discord-bot` profile 啟用時需要 |
| `DISCORD_BOT_REGISTER_COMMANDS_ON_START` / `DISCORD_PRICE_REPORT_MAX_ITEMS` / `DISCORD_BOT_COMMAND_COOLDOWN_SECONDS` / `DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS` | Discord bot 指令註冊、報告列數、cooldown 與每日報告 due setting 檢查間隔 |
| `CLOUDFLARED_IMAGE` | 固定版本 cloudflared image |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel token |
| `NODE_ENV` | production |

規則：

- `.env`、DB password、SSH key、Cloudflare token 不提交。
- `.env.example` 只能放欄位與非敏感 placeholder。
- 未啟用 `public-tunnel` 時仍可能需要非空 placeholder，因 Compose 會先解析整份檔案。

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
12. 啟動 `scheduled-crawler` profile 中的 `crawler-daemon`、`maintenance-daemon` 與 `raw-snapshot-cleanup-daemon`。
13. 若啟用 Discord 個人化通知，設定 bot secret 後啟動 `discord-bot` profile。
14. 建立 Cloudflare remotely-managed tunnel。
15. 啟動 `public-tunnel` profile。
16. 驗證正式網域、API、圖片 API、crawler、maintenance、Discord bot 與資料狀態。

## Migration / Backup / Monitoring

Migration：

- 正式部署使用 `prisma migrate deploy` 或 root `pnpm db:deploy`。
- migration 失敗時不啟動新版服務。
- schema 變更前需有備份與本機 / staging-like 驗證。

Backup：

- PostgreSQL 最優先。
- Product image cache 應備份或有明確重建計畫。
- Raw snapshot 可依 retention 與容量決定備份範圍。
- DB 與 image cache 還原時間點需盡量接近。

最小監控：

- `web`、`crawler-daemon`、`maintenance-daemon`、`postgres` 存活。
- 最近 successful crawl。
- backoff 狀態。
- snapshot / image cache 容量。
- 商品圖片 API 404 / fallback 是否異常增加。

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
