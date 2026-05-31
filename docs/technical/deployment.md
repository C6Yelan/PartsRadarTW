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
| `cloudflared` | 透過 Cloudflare Tunnel 對外公開 web service |

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

### cloudflared

`cloudflared` service 負責：

- 建立到 Cloudflare 的 outbound tunnel。
- 由 Cloudflare 管理 public hostname、edge TLS 與外部流量入口。
- 將 tunnel 流量轉發到 Compose network 內的 `web:3000`。

第一版公開入口採 Cloudflare Tunnel，不在主機上直接開放 HTTP/HTTPS，也不先導入 Nginx / Caddy。Tunnel token 只放在部署主機 `.env`，不提交 Git。

## Docker Compose 方向

正式部署與本機 PostgreSQL 開發共用同一份 `compose.yml`。預設 `docker compose up` 會啟動 app stack：`postgres`、`migrate`、`seed`、`web`。本機若只需要 PostgreSQL，可明確執行 `docker compose up -d postgres`。`crawler` 保留在手動 profile，避免一般部署指令意外對來源站發出 live requests。

概念服務：

```text
cloudflared
web
crawler
postgres
```

原則：

- `web` 與 `crawler` 可以使用同一份 repo build 出不同啟動指令。
- `crawler` 不應和 `web` 放在同一個 process。
- `postgres` 不對公網開放。
- `web` 只透過 Cloudflare Tunnel 對外。
- `crawler` 不需要對外開 port。

### Phase 6 Current Compose

目前已建立第一個 production-like Compose skeleton：

- `Dockerfile`：同一份檔案提供 `web`、`crawler`、`migrate` build target。
- `compose.yml`：定義 `postgres`、`migrate`、`seed`、`web`、手動 profile 的 `crawler` service，以及 `public-tunnel` profile 的 `cloudflared` service。
- `.env.example`：提供本機與 private server validation 共用的非敏感環境變數模板；正式機實際使用的 `.env` 不提交 Git。
- `migrate` service 使用 root `pnpm db:deploy`，對應 Prisma `migrate deploy`，不使用 development migration。
- `seed` service 在 migration 後執行 root `pnpm db:seed`，以 idempotent upsert 初始化第一版 8 個 CoolPC 分類；`web` 與手動 `crawler` 都等 seed 成功後才啟動。
- `web` 預設只綁 `127.0.0.1:${WEB_PORT:-3000}`，適合無網域時先用 SSH tunnel 或 server 內部驗證；若要直接從外部 IP 測試，需明確設定 `WEB_BIND_HOST=0.0.0.0`。
- `crawler` 目前只作為手動 profile 與 Docker build target。production scheduled crawler daemon 尚未實作，因此預設 command 是 `--help`，避免 `docker compose up` 意外對來源站發出 live requests。
- `crawler` 的 manual crawl script 會優先使用 `--storage-dir`，其次使用 `SNAPSHOT_STORAGE_DIR`，因此 Compose 環境下 raw snapshot 會寫入 `snapshots` volume，而不是隨 `--rm` container 消失。
- `image-cache:backfill` 會優先使用 `--storage-dir`，其次使用 `PRODUCT_IMAGE_STORAGE_DIR`，因此 Compose 環境下商品縮圖會寫入 `product_images` volume。
- `product_images` volume 以唯讀方式掛給 `web`，以讀寫方式掛給 `crawler`。
- `snapshots` volume 只掛給 `crawler`，不由 `web` 公開。
- `cloudflared` 預設不啟動；只有明確指定 `--profile public-tunnel` 才會建立 Cloudflare Tunnel 對外公開入口。

本機或正式機 private validation 的基本流程：

```bash
cp .env.example .env
chmod 600 .env
docker compose up -d --build --force-recreate
curl http://127.0.0.1:3000/api/source-status
```

手動檢查 crawler image 與參數說明：

```bash
docker compose --profile manual-crawler run --rm crawler
```

若要在正式機上做 IP-only private validation，先維持 `WEB_BIND_HOST=127.0.0.1` 並用 SSH tunnel 連入。公開流量、Cloudflare Tunnel、正式網域與 stricter CSP 是後續 gate，不屬於這個 slice 的完成條件。

### Private Validation Checklist

在沒有正式網域前，正式機只作為 private validation 環境。這個階段的目標是確認主機、Docker、資料庫、migration、seed、web service 與 volume wiring 正常，不是公開上線。

前置條件：

- repo 已在主機上 clone，且 `main` 已 fast-forward 到最新 `origin/main`。
- Docker 與 Docker Compose 可由目前使用者執行。
- `.env` 由 `.env.example` 複製而來，且未被 Git 追蹤。
- `POSTGRES_PASSWORD` 已改成強密碼，不使用範例預設值。
- `WEB_BIND_HOST=127.0.0.1`，避免尚未設定 Cloudflare Tunnel / CSP 前直接對外公開。

驗證指令：

```bash
git status --short --branch
git log --oneline -1
docker compose config
docker compose up -d --build --force-recreate
docker compose ps -a
curl -i http://127.0.0.1:3000/api/source-status
docker compose --profile manual-crawler run --rm crawler
```

成功標準：

- `git status --short --branch` 沒有非預期變更；`.env` 不出現在 Git status。
- `docker compose config` 可解析。
- `migrate` 與 `seed` 都以 exit code 0 結束。
- `postgres` 狀態為 healthy。
- `web` 狀態為 healthy，且只綁定 `127.0.0.1:3000`。
- `/api/source-status` 回 `HTTP 200`，response 內有第一版 8 個 CoolPC 分類。
- 手動 `crawler` command 只顯示 help / 參數說明，不發出 live fetch。

本機瀏覽器測試時，從使用者電腦建立 SSH tunnel：

```bash
ssh -L 3000:127.0.0.1:3000 <user>@<server-ip>
```

然後在本機開啟：

```text
http://127.0.0.1:3000
```

失敗時優先檢查：

- Docker 權限或 daemon 是否可用。
- 3000 或 5432 是否被既有服務占用。
- `.env` 是否仍使用錯誤 DB 名稱、帳號或密碼。
- `migrate` logs 是否顯示 Prisma migration 或 `DATABASE_URL` 問題。
- `seed` logs 是否顯示 Prisma seed 或連線問題。
- `web` logs 是否顯示 DB 連線、Prisma Client、`PRODUCT_IMAGE_STORAGE_DIR` 或 Next.js startup 問題。

禁止事項：

- 不執行 `docker compose down --volumes`，除非已確認可以丟棄該主機資料。
- 不設定 `WEB_BIND_HOST=0.0.0.0`，除非後續已完成公開前 gate。
- 不啟動 Cloudflare Tunnel 或正式網域作為此 checklist 的一部分。
- 不啟動 crawler live fetch，不做低頻手動 crawl 以外的資料抓取。
- 不提交或 push `.env`、主機 secrets、Cloudflare Tunnel token 或部署 token。

### Cloudflare Tunnel Public Entry

公開入口採 Cloudflare remotely-managed Tunnel。Cloudflare dashboard 負責 tunnel 設定與 public hostname；repo 只保存 `cloudflared` service 與 profile，不保存實際網域或 token。

Cloudflare 端設定：

- 建立 remotely-managed tunnel。
- Public hostname 使用正式網域或子網域。
- Service 設為 `http://web:3000`。
- 保留 DNS proxy / Cloudflare edge TLS，由 Cloudflare 處理外部 HTTPS。
- SSL/TLS edge certificate 確認為 active。
- 開啟 Always Use HTTPS，讓 `http://<domain>` 導向 `https://<domain>`。
- 開啟 Automatic HTTPS Rewrites，降低 mixed content 風險。
- TLS 1.3 開啟，Minimum TLS Version 先設為 TLS 1.2。
- HSTS 不在第一輪公開時直接開長期或 preload；若要啟用，先用短 max-age 驗證。

主機端 `.env` 需加入：

```bash
CLOUDFLARE_TUNNEL_TOKEN=<cloudflare tunnel token>
```

啟動 tunnel：

```bash
docker compose --profile public-tunnel up -d cloudflared
docker compose --profile public-tunnel ps cloudflared
```

關閉 tunnel：

```bash
docker compose --profile public-tunnel stop cloudflared
```

驗證：

```bash
docker compose --profile public-tunnel logs --tail=100 cloudflared
curl -I http://<domain>/
curl -I https://<domain>/
curl -i https://<domain>/api/source-status
```

公開前 gate：

- `web` 仍綁 `127.0.0.1:${WEB_PORT:-3000}`，不得改成直接對外公開。
- 主機不需要開放 HTTP/HTTPS inbound port；Cloudflare Tunnel 只需要 outbound 連線。
- `postgres` 仍只綁 `127.0.0.1:5432`，不得對外公開。
- `crawler` 不對外開 port，也不得提供公開 trigger API。
- 圖片 backfill 已完成或前端 fallback 可接受。
- `/api/source-status` 可回 `HTTP 200`。
- `http://<domain>/` 會導向 `https://<domain>/`。
- 正式網域 smoke test 完成後，再考慮 stricter CSP 與公開宣傳。

### Product Image Cache Backfill

商品資料 crawl 只會把 `primary_image_url` 寫入 DB，不會自動下載站內 WebP 縮圖。新主機或新 volume 上若只有商品、沒有圖片，需手動跑 product image cache backfill。

先跑小批次 dry-run：

```bash
docker compose --profile manual-crawler run --rm crawler pnpm image-cache:backfill -- --dry-run --limit 20
```

全量 backfill 應用 `tmux` 放背景慢慢跑，避免 SSH 中斷造成流程停止：

```bash
mkdir -p logs/deployment
tmux new-session -d -s product-image-backfill -c "$PWD" 'docker compose --profile manual-crawler run --rm crawler pnpm image-cache:backfill -- --confirm-live-fetch --min-delay-ms 3000 --max-delay-ms 5000 2>&1 | tee logs/deployment/product-image-backfill.log'
tmux ls
```

查看進度：

```bash
tail -f logs/deployment/product-image-backfill.log
```

完成或中途檢查圖片數量：

```bash
docker compose exec -T web sh -lc 'find /var/lib/partsradar/product-images -type f -name "*.webp" | wc -l'
```

Backfill 規則：

- 不使用 `--overwrite`，除非明確要重建已存在的圖片。
- 不和 `crawl:coolpc-once` 同時執行，避免對來源站產生額外負載。
- 中斷後可重跑；已存在的 `.webp` 會被 skipped。
- 圖片寫入 volume 後通常不需要重啟 `web`，重新整理頁面即可讀到新檔案。

## Volumes And Storage

正式環境至少需要三類持久化資料：

| 類型 | 用途 |
| --- | --- |
| PostgreSQL data volume | 保存資料庫內容 |
| Snapshot storage volume | 保存 raw snapshot 壓縮檔 |
| Product image cache volume | 保存站內商品縮圖快取 |

建議概念路徑：

```text
/srv/partsradar-tw/postgres/
/srv/partsradar-tw/snapshots/
/srv/partsradar-tw/product-images/
```

實際路徑等部署時依 VM 權限與磁碟規劃決定。

規則：

- volume 內容不可提交到 Git。
- raw snapshot 一般資料最長保留 30 天。
- raw snapshot 異常資料最長保留 90 天。
- price snapshots 不套用 raw snapshot 的 30 / 90 天保存期限。

## Product Image Cache Storage

第一版 production 商品圖片策略使用站內小尺寸 WebP 縮圖快取，不在訪客請求期間抓取來源站圖片，也不直接 hotlink 原價屋圖片。

建議 production path：

```text
host path: /srv/partsradar-tw/product-images/
container path: /var/lib/partsradar/product-images/
env: PRODUCT_IMAGE_STORAGE_DIR=/var/lib/partsradar/product-images
```

實際 host path 可依 VM 磁碟與權限調整，但 container 內應使用明確 mounted path，不依賴 repo 相對路徑。

讀寫責任：

- `web` 只讀取 `PRODUCT_IMAGE_STORAGE_DIR`，透過 `/api/product-images/{productId}.webp` 回傳站內縮圖。
- `crawler` 或手動 backfill 工具負責建立、更新或覆寫縮圖檔案。
- 訪客請求圖片時不得觸發來源站下載；來源圖片下載只能由 crawler / backfill 流程控制頻率、間隔與錯誤處理。
- 圖片檔名第一版維持 `{productId}.webp`。目前資料量不需要先做 hash 分層目錄；若未來檔案數量或檔案系統壓力明顯增加，再評估分層。

更新與清理規則：

- 新商品或圖片 URL 變更後，由 crawler / backfill 產生或更新對應縮圖。
- 缺圖、讀取失敗或檔案不存在時，前端使用既有 fallback，不重新 hotlink 來源圖片。
- 第一版不做自動大量刪圖 job，避免資料狀態判斷錯誤造成誤刪。
- 對 inactive 商品，可先保留縮圖，除非容量壓力或權利人 / 來源方要求移除。
- 若收到合理移除請求，應移除或停用對應縮圖，並建立 blocklist、DB override 或其他永久紀錄，避免後續 crawler / backfill 又重新產生相同圖片。
- 若需要保留處理證據，可先將圖片移到非公開 quarantine 目錄；quarantine 目錄不得由 web service 直接公開。

備份與搬遷：

- Product image cache volume 應納入 production 備份或搬遷計畫。
- 縮圖理論上可由來源圖片重新產生，但重新抓取來源圖片有頻率、穩定性與授權風險，因此 production 不應把此目錄視為可隨意丟棄的暫存。
- DB 備份與 product image cache 備份需保持相近時間點，避免 DB 有商品但圖片 cache 大量缺失。
- 若部署到新機器，應先還原 DB 與 product image cache，再啟動 web，讓前端不需要在公開流量期間等待圖片重新 backfill。

## Environment And Secrets

正式環境變數由 VM 或部署流程管理，不提交到 Git。

第一版正式環境至少需要：

| 名稱 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `COOLPC_BASE_URL` | 原價屋來源網址 |
| `SNAPSHOT_STORAGE_DIR` | container 內 snapshot 保存路徑 |
| `PRODUCT_IMAGE_STORAGE_DIR` | container 內商品縮圖快取保存路徑，正式部署應設為明確 mounted path |
| `CRAWLER_INTERVAL_SECONDS` | crawler 週期 |
| `CRAWLER_BACKOFF_SECONDS` | 連續失敗 backoff |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare remotely-managed tunnel token，只在啟用 `public-tunnel` profile 時需要 |
| `NODE_ENV` | production |

規則：

- `.env` 不提交。
- DB 密碼不寫入文件範例。
- VM SSH key、部署 token、Cloudflare Tunnel token 不提交。
- `.env.example` 只能放非敏感預設值與欄位名稱。

## Deployment Flow

第一版部署流程概念：

1. VM 安裝 Docker 與 Docker Compose。
2. VM 取得 repo 或部署產物。
3. 建立正式環境變數。
4. 建立 PostgreSQL、snapshot 與 product image cache persistent volume。
5. 啟動 `postgres`。
6. 等待 PostgreSQL 可連線。
7. 執行 Prisma migration。
8. 確認 `PRODUCT_IMAGE_STORAGE_DIR` 指向 product image cache mounted path。
9. migration 成功後啟動 `web`。
10. 啟動 `crawler` 或手動 backfill / crawler 流程。
11. 在 Cloudflare 建立 remotely-managed tunnel 與 public hostname。
12. 主機 `.env` 加入 `CLOUDFLARE_TUNNEL_TOKEN`，並啟動 `public-tunnel` profile。
13. 檢查網站、API、商品圖片 API、crawler run 與資料更新狀態。

目前 Phase 6 已把 production-like services、Cloudflare Tunnel public entry profile 與 private validation 指令合併進唯一的 `compose.yml`。備份排程與 crawler daemon 指令仍待後續 slice 補齊。

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
- product image cache storage。
- 環境變數與部署設定，但不得把 secrets 放入公開 repo。

備份原則：

- DB 備份比 raw snapshot 更優先。
- 備份需能還原，不只產生檔案。
- raw snapshot 因有保存期限，可依容量調整備份範圍。
- product image cache 可重建但不應視為純暫存；若沒有備份，搬遷後需安排低頻 backfill，且公開流量期間可能大量 fallback。
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
- product image cache 是否接近容量上限。
- 商品圖片 API 是否大量回傳 404 或 fallback。

第一版可先用 log 與手動檢查維運；正式監控與告警工具等資料流穩定後再選。

未來 Discord bot 可用來發送：

- crawler 連續失敗通知。
- 疑似被攔截通知。
- snapshot storage 容量警告。

## Security

第一版部署需符合：

- PostgreSQL 不開放公網連線。
- Cloudflare Tunnel 模式下不需要開放 HTTP/HTTPS inbound port；主機只保留必要 SSH 存取。
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
