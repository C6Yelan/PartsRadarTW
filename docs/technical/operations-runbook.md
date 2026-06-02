# Operations Runbook

本文件保存 PartsRadarTW 第一版部署後的操作步驟。部署邊界、服務拆分、storage 與 security 原則仍以 [deployment.md](deployment.md) 為主；本文件只放可執行的維運流程與驗證 checklist。

所有指令都假設在部署主機的 repo 根目錄執行。正式 `.env` 不提交 Git，且所有 `replace_with_*` placeholder 都必須先替換成主機專用值。

## Private Validation

在沒有正式網域前，正式機只作為 private validation 環境。這個階段的目標是確認主機、Docker、資料庫、migration、seed、web service 與 volume wiring 正常，不是公開上線。

前置條件：

- repo 已在主機上 clone，且部署 branch 已 fast-forward 到目標 commit。
- Docker 與 Docker Compose 可由目前使用者執行。
- `.env` 由 `.env.example` 複製而來，且未被 Git 追蹤。
- `POSTGRES_DB`、`POSTGRES_USER` 與 `POSTGRES_PASSWORD` 已填入正式值，不使用 `replace_with_*` placeholder。
- `POSTGRES_PASSWORD` 是強密碼。
- `POSTGRES_BIND_HOST=127.0.0.1`，除非有額外防火牆與私網限制，否則不得公開 PostgreSQL。
- `WEB_BIND_HOST=127.0.0.1`，避免尚未設定 Cloudflare Tunnel / CSP 前直接對外公開。

驗證指令：

```bash
git status --short --branch
git log --oneline -1
docker compose config
docker compose up --build --force-recreate storage-init
docker compose up -d --build --force-recreate
docker compose ps -a
curl -i http://127.0.0.1:3000/api/source-status
docker compose --profile manual-crawler run --rm crawler
```

成功標準：

- `git status --short --branch` 沒有非預期變更；`.env` 不出現在 Git status。
- `docker compose config` 可解析。
- `storage-init` 以 exit code 0 結束。
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
- `storage-init` logs 是否顯示 mounted storage path 權限初始化失敗。
- `web` logs 是否顯示 DB 連線、Prisma Client、`PRODUCT_IMAGE_STORAGE_DIR` 或 Next.js startup 問題。

禁止事項：

- 不執行 `docker compose down --volumes`，除非已確認可以丟棄該主機資料。
- 不設定 `WEB_BIND_HOST=0.0.0.0`，除非後續已完成公開前 gate。
- 不啟動 Cloudflare Tunnel 或正式網域作為 private validation 的一部分。
- 不啟動 crawler live fetch，不做低頻手動 crawl 或明確排程 profile 以外的資料抓取。
- 不提交或 push `.env`、主機 secrets、Cloudflare Tunnel token 或部署 token。

## Storage Volume Permissions

`web`、`crawler` 與 scheduled daemons 都以非 root `node` user 執行。Docker image build 階段雖然會建立 `/var/lib/partsradar` 並設定 owner，但 Docker named volume 掛載後會覆蓋該 mount point；初次建立或重建 named volume 時，實際目錄可能變成 `root:root`，導致 crawler 寫 raw snapshot gzip 或 product image cache 時失敗。

`storage-init` 是一次性 root service，只負責：

- `mkdir -p /var/lib/partsradar/snapshots /var/lib/partsradar/product-images`
- `chown -R node:node /var/lib/partsradar/snapshots /var/lib/partsradar/product-images`

它不連 DB、不抓 CoolPC、不跑 crawler，也不長期維持 root runtime。`web`、`crawler`、`crawler-daemon` 與 `raw-snapshot-cleanup-daemon` 都會等 `storage-init` 成功完成後才啟動。

初次部署、重建 volume、或懷疑 owner 錯誤時可手動重跑：

```bash
docker compose up --build --force-recreate storage-init
docker compose ps -a storage-init
docker compose logs --tail=100 storage-init
```

若 crawler log 出現：

```text
EACCES: permission denied, open '/var/lib/partsradar/snapshots/coolpc/<hash>.html.gz'
```

先檢查 mounted volume owner 是否為 `node:node`：

```bash
docker compose --profile manual-crawler run --rm --no-deps crawler \
  sh -lc 'ls -ld /var/lib/partsradar/snapshots /var/lib/partsradar/product-images'
```

若不是 `node:node`，先重跑 `storage-init`，再 recreate 需要寫入 storage 的服務。不要用 `docker compose down --volumes` 修權限，除非已確認可以丟棄該主機資料。

## Cloudflare Tunnel

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
CLOUDFLARED_IMAGE=cloudflare/cloudflared:<pinned-version>
CLOUDFLARE_TUNNEL_TOKEN=<cloudflare tunnel token>
```

`CLOUDFLARED_IMAGE` 不使用 `latest`。若不啟用 `public-tunnel` profile，本機或 private validation 可保留 `.env.example` 內的非敏感 placeholder；真正啟動 tunnel 前必須換成固定版本 image 與真實 token。

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

## Scheduled CoolPC Crawler

定期資料更新由 `crawler-daemon` service 負責。此 service 預設不啟動，必須明確指定 `scheduled-crawler` profile。

啟動前條件：

- 手動 `manual:crawl-coolpc-once` 已在同一台主機成功跑過，且 `/api/source-status` 可回 `ok`。
- `product-image-backfill` 沒在跑，避免同時對來源站產生額外負載。
- `.env` 中的 `CRAWLER_INTERVAL_SECONDS`、`CRAWLER_BACKOFF_SECONDS` 與 `CRAWLER_CATEGORY_DELAY_MS` 已確認；預設分別為 `1800`、`3600`、`8000`。
- `WEB_BIND_HOST` 與 `POSTGRES_BIND_HOST` 仍維持 `127.0.0.1`。

啟動：

```bash
docker compose --profile scheduled-crawler up -d crawler-daemon
docker compose --profile scheduled-crawler ps crawler-daemon
```

查看 log：

```bash
docker compose --profile scheduled-crawler logs --tail=100 crawler-daemon
```

停止：

```bash
docker compose --profile scheduled-crawler stop crawler-daemon
```

安全規則：

- 不提供公開 crawler trigger API。
- 不對外開 port。
- 低於 `60` 秒的 schedule interval / backoff 會被 daemon 拒絕。
- 低於 `3000` ms 的 category delay 會被 daemon 拒絕。
- 疑似被來源站攔截時，當輪 crawl 會停止並進入 backoff。
- daemon log 不應輸出 `.env`、`DATABASE_URL`、Cloudflare token 或其他 secret。

驗證：

```bash
docker compose --profile scheduled-crawler config --services
docker compose --profile scheduled-crawler logs --tail=100 crawler-daemon
curl -i https://<domain>/api/source-status
```

## Product Link Health Check

商品外部連結健康檢查由 crawler ops command 執行，只更新 `product_link_health` 狀態供 UI 低干擾提示使用。它不在使用者 request lifecycle 內執行，也不會刪除商品、停用商品或移除連結。

先跑小批次 dry-run，確認候選數與 log 內容：

```bash
docker compose --profile manual-crawler run --rm crawler \
  pnpm ops:product-links:check -- --dry-run --limit 25
```

確認後再跑 live check。live 模式必須明確加 `--confirm-live-fetch`，並保留 request delay。正式跑預設會檢查所有超過 48 小時未確認或 URL 已變更的候選連結，`--limit` 只作為小批次測試或緊急限量使用：

```bash
docker compose --profile manual-crawler run --rm crawler \
  pnpm ops:product-links:check -- --confirm-live-fetch
```

常用選項：

- `--kinds source,introduction`：檢查原價屋購買連結與產品介紹連結，預設兩者都檢查。
- `--igrp <number>`：限制單一分類。
- `--stale-after-hours <hours>`：只重查超過指定時間的既有紀錄，預設 48。
- `--failure-threshold <count>`：連續 404 / 410 達門檻才標記 broken，預設 3。
- `--min-delay-ms` / `--max-delay-ms`：控制 live request 間隔，預設 10000 到 20000 ms，避免對來源站或第三方介紹頁造成壓力。

驗證重點：

- command log 不應輸出 `.env`、`DATABASE_URL` 或 secret。
- 首次 404 / 410 不應直接標記 `broken`，而是先累積為暫時失敗。
- 商品詳情頁只顯示低干擾健康提示，不應阻止使用者自行開啟外部連結。
- 正式排程化前，先以小批次確認來源站沒有明顯攔截或異常回應。

## Raw Snapshot Cleanup

Raw snapshot cleanup 預設只做 dry run。Production 環境應透過 `crawler` container 執行，確保使用 container 內的 `DATABASE_URL`、`SNAPSHOT_STORAGE_DIR` 與 mounted snapshot volume：

```bash
docker compose --profile manual-crawler run --rm --no-deps crawler \
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup

docker compose --profile manual-crawler run --rm --no-deps crawler \
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup -- --confirm-delete
```

本機開發環境若已有可連線的 `.env` / `DATABASE_URL` 與 snapshot storage，可直接執行：

```bash
pnpm ops:raw-snapshots:cleanup
```

cleanup 會依 `SNAPSHOT_STORAGE_DIR` 找到 raw snapshot 壓縮檔，刪除超過保留期限的 metadata，並只移除不再被任何保留中 snapshot metadata 參照的 gzip 檔案。執行前應確認 manual crawler、scheduled crawler 與 raw replay 沒有同時寫入 raw snapshot storage。若要先驗證目前資料是否會產生 candidates，可暫時用較短 retention 做 dry run：

```bash
docker compose --profile manual-crawler run --rm --no-deps crawler \
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup -- \
  --normal-retention-days 1 --abnormal-retention-days 1
```

Production 也會透過 `scheduled-crawler` profile 啟動 `raw-snapshot-cleanup-daemon`，預設每 24 小時執行一次正式 cleanup：

```bash
docker compose --profile scheduled-crawler up -d raw-snapshot-cleanup-daemon
```

`raw-snapshot-cleanup-daemon` 會明確帶 `--confirm-delete`，但仍沿用同一套 30 / 90 天保留規則、path 防呆與 shared gzip reference 檢查。若要調整執行頻率，可設定 `RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS`；允許範圍是 3600 到 604800 秒。

## Product Image Cache Backfill

商品資料 crawl 只會把 `primary_image_url` 寫入 DB，不會自動下載站內 WebP 縮圖。新主機或新 volume 上若只有商品、沒有圖片，需手動跑 product image cache backfill。

先跑小批次 dry-run：

```bash
docker compose --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --dry-run --limit 20
```

全量 backfill 應用 `tmux` 放背景慢慢跑，避免 SSH 中斷造成流程停止：

```bash
mkdir -p logs/deployment
tmux new-session -d -s product-image-backfill -c "$PWD" 'docker compose --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --confirm-live-fetch --min-delay-ms 3000 --max-delay-ms 5000 2>&1 | tee logs/deployment/product-image-backfill.log'
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
- 不和 `manual:crawl-coolpc-once` 同時執行，避免對來源站產生額外負載。
- 中斷後可重跑；已存在的 `.webp` 會被 skipped。
- 圖片寫入 volume 後通常不需要重啟 `web`，重新整理頁面即可讀到新檔案。
