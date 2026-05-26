# 部署設計

本文件定義 PartsRadarTW 第一版的部署方向。第一版以自架為主，目標環境預計是朋友提供的 Ubuntu 虛擬機，部署方式以 Docker / Docker Compose 為主。

本文件先描述部署邊界、服務拆分、資料保存與維運原則，不作為最終可直接執行的部署手冊。

## 部署目標

第一版部署需滿足：

- 網站可對外提供查詢服務。
- crawler 可在背景獨立執行。
- PostgreSQL 資料可持久保存。
- raw snapshot 壓縮檔可持久保存。
- web service 與 crawler service 分開，避免網站 request 被 crawler 影響。
- secrets 不進 Git。
- 未來可加入 Discord bot 而不需要重做整體架構。

## 目標環境

第一個正式環境：

- Ubuntu 虛擬機。
- Docker。
- Docker Compose。
- 對外網域與 HTTPS。
- 可保存 persistent volume 或主機掛載目錄。

目前不先決定：

- Ubuntu 精確版本。
- VM CPU、RAM、硬碟規格。
- 反向代理工具。
- CI/CD 服務。
- 備份儲存位置。

上述項目等取得實際主機條件後再定。

## Runtime Services

第一版正式部署預期包含：

| Service | 責任 |
| --- | --- |
| `web` | 執行 Next.js 網站與查詢 API |
| `crawler` | 執行原價屋資料抓取、解析與資料更新 |
| `postgres` | 保存商品、價格、crawler 狀態與 snapshot metadata |
| `reverse-proxy` | 對外提供 HTTP/HTTPS，轉發到 web service |

Raw snapshot 壓縮檔不作為獨立 service，而是透過 volume 或主機目錄掛載給 crawler 使用。

未來 Discord bot 可新增為：

```text
bot
```

bot 應讀取資料庫，不應直接抓取原價屋。

## Service Boundary

### web

`web` service 負責：

- 對外提供網站。
- 提供 Next.js Route Handlers。
- 讀取 PostgreSQL 中的正式商品與目前價格資料。
- 顯示來源狀態與資料更新時間。

`web` service 不負責：

- 執行 crawler。
- 抓取原價屋。
- 清理 raw snapshot。
- 長時間背景排程。

### crawler

`crawler` service 負責：

- 依排程檢查是否可啟動 crawl cycle。
- 抓取原價屋 `eachview.php?IGrp={分類編號}`。
- 保存 raw snapshot metadata 與壓縮檔。
- 驗證 response content。
- 解析商品與價格。
- 更新 products、price snapshots 與 current prices。
- 記錄異常與 backoff 狀態。

`crawler` service 不負責：

- 對外提供網站。
- 提供使用者 API。
- 直接發送使用者價格通知。

### postgres

`postgres` service 負責：

- 商品主檔。
- 目前價格。
- 價格歷史。
- crawl run 狀態。
- raw snapshot metadata。
- parse error 紀錄。

PostgreSQL 必須使用 persistent volume 或主機掛載目錄保存資料。

### reverse-proxy

`reverse-proxy` service 負責：

- 對外接收 HTTP/HTTPS。
- 管理 TLS certificate。
- 將網站流量轉發到 `web`。

第一版可選工具包含 Nginx、Caddy 或 Traefik；正式工具等部署前依 VM 條件與維護成本決定。

## Docker Compose 方向

正式部署可使用獨立 compose 檔，例如：

```text
compose.prod.yml
```

概念服務：

```text
reverse-proxy
web
crawler
postgres
```

原則：

- `web` 與 `crawler` 可以使用同一份 repo build 出不同啟動指令。
- `crawler` 不應和 `web` 放在同一個 process。
- `postgres` 不對公網開放。
- `web` 只透過 reverse proxy 對外。
- `crawler` 不需要對外開 port。

## Volumes And Storage

正式環境至少需要兩類持久化資料：

| 類型 | 用途 |
| --- | --- |
| PostgreSQL data volume | 保存資料庫內容 |
| Snapshot storage volume | 保存 raw snapshot 壓縮檔 |

建議概念路徑：

```text
/srv/partsradar-tw/postgres/
/srv/partsradar-tw/snapshots/
```

實際路徑等部署時依 VM 權限與磁碟規劃決定。

規則：

- volume 內容不可提交到 Git。
- raw snapshot 一般資料最長保留 30 天。
- raw snapshot 異常資料最長保留 90 天。
- price snapshots 不套用 raw snapshot 的 30 / 90 天保存期限。

## Environment And Secrets

正式環境變數由 VM 或部署流程管理，不提交到 Git。

第一版正式環境至少需要：

| 名稱 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `COOLPC_BASE_URL` | 原價屋來源網址 |
| `SNAPSHOT_STORAGE_DIR` | container 內 snapshot 保存路徑 |
| `CRAWLER_INTERVAL_SECONDS` | crawler 週期 |
| `CRAWLER_BACKOFF_SECONDS` | 連續失敗 backoff |
| `NODE_ENV` | production |

規則：

- `.env.production` 不提交。
- DB 密碼不寫入文件範例。
- VM SSH key、部署 token、TLS private key 不提交。
- `.env.example` 只能放非敏感預設值與欄位名稱。

## Deployment Flow

第一版部署流程概念：

1. VM 安裝 Docker 與 Docker Compose。
2. VM 取得 repo 或部署產物。
3. 建立正式環境變數。
4. 建立 PostgreSQL 與 snapshot persistent volume。
5. 啟動 `postgres`。
6. 等待 PostgreSQL 可連線。
7. 執行 Prisma migration。
8. migration 成功後啟動 `web`。
9. 啟動 `crawler`。
10. 設定 reverse proxy 與 HTTPS。
11. 檢查網站、API、crawler run 與資料更新狀態。

正式指令等專案初始化與 compose 檔建立後再補。

## Migration

Prisma migration 應在部署時明確執行。

原則：

- migration 應在 PostgreSQL service 可連線後執行。
- 正式部署使用 `prisma migrate deploy` 或對應 package script 套用已提交的 migration。
- migration 不由 web request 觸發。
- migration 失敗時不應繼續啟動新版服務。
- migration 前應確認有可用備份。
- schema 變更應先在本機或 staging-like 環境測過。

第一版若沒有 staging 環境，至少應在本機以接近正式的 Docker Compose 流程驗證 migration。

## Backup

正式部署至少需要備份：

- PostgreSQL。
- raw snapshot storage。
- 環境變數與部署設定，但不得把 secrets 放入公開 repo。

備份原則：

- DB 備份比 raw snapshot 更優先。
- 備份需能還原，不只產生檔案。
- raw snapshot 因有保存期限，可依容量調整備份範圍。
- price snapshots 屬於長期資料，應保存在 DB 備份內。

第一版備份頻率先不硬定；等 VM 容量、資料量與實際更新頻率明確後再決定。

## Monitoring And Operations

第一版最小維運檢查：

- `web` service 是否存活。
- `crawler` service 是否存活。
- `postgres` 是否可連線。
- 最近一次 successful crawl 時間。
- 是否進入 backoff。
- snapshot storage 是否接近容量上限。

第一版可先用 log 與手動檢查維運；正式監控與告警工具等資料流穩定後再選。

未來 Discord bot 可用來發送：

- crawler 連續失敗通知。
- 疑似被攔截通知。
- snapshot storage 容量警告。

## Security

第一版部署需符合：

- PostgreSQL 不開放公網連線。
- 只開放必要 port，例如 HTTP/HTTPS 與 SSH。
- SSH 登入應避免使用弱密碼。
- secrets 不進 Git。
- raw snapshot 不提供公開下載。
- API 不暴露 crawler internal error、raw HTML 或內部 token。

完整第一版資安基準以 [security.md](security.md) 為準。

## Rollback

第一版 rollback 概念：

- 保留上一版可用 image 或部署產物。
- migration 前先備份 DB。
- 若 web 新版失敗，優先回復 web image。
- 若 crawler 新版解析錯誤，停止 crawler，避免繼續寫入錯誤資料。
- 若 migration 已改變 schema，需依實際 migration 設計判斷是否可回退。

Crawler 發現疑似解析錯誤或大量異常時，應優先停止 crawler 並保留既有網站資料。