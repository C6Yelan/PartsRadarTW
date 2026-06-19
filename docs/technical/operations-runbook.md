# Operations Runbook

本文件保存 PartsRadarTW production 部署後的操作步驟。部署邊界、服務拆分、storage 與 security 原則仍以 [deployment.md](deployment.md) 為主；本文件只放可執行的維運流程與驗證 checklist。

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
- `/api/source-status` 回 `HTTP 200`，response 內有目前已啟用 CoolPC 分類。
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
- 若 `maintenance-daemon` 正在持有 external fetch lock，`crawler-daemon` 會寫入 price-priority signal 並在 `CRAWLER_LOCK_RETRY_SECONDS` 後重試；maintenance link health 會在下一個安全邊界讓路。
- `.env` 中的 `CRAWLER_INTERVAL_SECONDS`、`CRAWLER_BACKOFF_SECONDS` 與 `CRAWLER_CATEGORY_DELAY_MS` 已確認；預設分別為 `1800`、`3600`、`8000`。
- `.env` 中的 `CRAWLER_LOCK_RETRY_SECONDS` 已確認；預設 `120`。
- `.env` 中的 `PRODUCT_IMAGE_STORAGE_DIR` 與 `CRAWLER_NEW_PRODUCT_IMAGE_*` 已確認；crawler-daemon 只會在每輪價格 crawl 後補本輪新增商品圖片。
- `.env` 中的 `EXTERNAL_FETCH_LOCK_DIR`、`EXTERNAL_FETCH_LOCK_STALE_SECONDS` 與 `EXTERNAL_FETCH_PRIORITY_TTL_SECONDS` 已確認；價格 crawl 與 link health check 共用 lock，但價格 crawl 的 priority signal 會讓 link health 暫停。
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

若該輪有新品且 crawl 結果不需 backoff，log 會在價格 crawl summary 與 Discord 通知後顯示 `Starting new product image backfill` / `New product image backfill finished`。這段 follow-up 不會持有 external fetch lock，也不會掃描既有缺圖商品；若該輪疑似被擋或需要 backoff，會略過新品補圖。

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
- 單分類 fetch 例外會短 retry；若仍失敗，分類結果會保存 `error.name`、`error.message`、`error.cause.code` 與 `error.cause.message`，避免 log 只剩 `fetch failed`。
- 若整輪所有分類都是 `FETCH_FAILED`，daemon 會先用較短 retry 間隔重新嘗試，預設不超過 600 秒；其他 parse/block 失敗仍走 `CRAWLER_BACKOFF_SECONDS`。
- 若 shared external fetch lock 被 maintenance task 持有，crawler 會要求 priority retry，不會並行抓來源，也不會等完整 30 分鐘才再試。
- daemon log 不應輸出 `.env`、`DATABASE_URL`、Cloudflare token 或其他 secret。

驗證：

```bash
docker compose --profile scheduled-crawler config --services
docker compose --profile scheduled-crawler logs --tail=100 crawler-daemon
curl -i https://<domain>/api/source-status
```

## Product Link Health Check

商品外部連結健康檢查由 crawler ops command 執行，只更新 `product_link_health` 狀態供 UI 低干擾提示使用。它不在使用者 request lifecycle 內執行，也不會刪除商品、停用商品或移除連結。Production 的低頻排程由 `maintenance-daemon` 負責，手動 command 主要用於 dry-run、單次驗證或緊急補跑。

先看 persisted link health 診斷報表。這個 report 只讀 DB，不發送外部 request，也不列出原始 URL 或產品明細；它用來判讀 `source` 查看 / 購買連結的狀態、HTTP status 與 `failure_count` 分布：

```bash
docker compose --profile manual-crawler run --rm crawler \
  pnpm ops:product-links:report
```

常用 report 選項：

- `--kinds source`：只看指定連結種類；目前只支援 `source`。
- `--include-inactive`：包含 inactive 商品；預設只看 active 商品，和 production smoke 的 link health scope 一致。

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

- `--kinds source`：檢查原價屋查看 / 購買連結；目前只支援 `source`。
- `--igrp <number>`：限制單一分類。
- `--stale-after-hours <hours>`：只重查超過指定時間的既有紀錄，預設 48。
- `--failure-threshold <count>`：連續 404 / 410 達門檻才標記 broken，預設 3。
- `--min-delay-ms` / `--max-delay-ms`：控制 live request 間隔，預設 10000 到 20000 ms，避免對來源站造成壓力。

驗證重點：

- command log 不應輸出 `.env`、`DATABASE_URL` 或 secret。
- 首次 404 / 410 不應直接標記 `broken`，而是先累積為暫時失敗。
- 商品詳情頁只顯示低干擾健康提示，不應阻止使用者自行開啟外部連結。
- 若手動 live check，應先確認 `crawler-daemon` / `maintenance-daemon` 沒在持有 external fetch lock，避免額外來源壓力。

## Scheduled Maintenance Daemon

`maintenance-daemon` 負責低頻 product link health check：每天跑排程，但只選超過 48 小時未確認或 URL 已變更的 due links；每輪預設最多 200 條。商品圖片補圖不在 scheduled maintenance 內執行，需使用手動 backfill 工具。

此 service 只在 `scheduled-crawler` profile 啟動。它和 `crawler-daemon` 共用 `EXTERNAL_FETCH_LOCK_DIR`，避免定期價格抓取與 link health check 同時抓外部來源。daemon 啟動後預設先等 900 秒，再開始第一輪，降低部署或重啟時多個 daemon 同時起跑的機率。若價格 crawler 到點但 lock 被 link health 持有，crawler 會寫入短效 priority signal；maintenance 會在下一筆 link request 前或 request 間 delay 後暫停、釋放 lock，並在 `MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS` 後繼續下一輪。

啟動：

```bash
docker compose --profile scheduled-crawler up -d maintenance-daemon
docker compose --profile scheduled-crawler ps maintenance-daemon
```

查看 log：

```bash
docker compose --profile scheduled-crawler logs --tail=100 maintenance-daemon
```

常用設定：

- `MAINTENANCE_INTERVAL_SECONDS`：maintenance cycle 間隔，預設 86400，允許 3600 到 604800。
- `MAINTENANCE_INITIAL_DELAY_SECONDS`：daemon 啟動後第一次執行前的延遲，預設 900。
- `MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS`：因價格 crawler priority 暫停後多久再繼續，預設 300。
- `MAINTENANCE_LINK_LIMIT`：每輪最多 link candidates，預設 200。
- `MAINTENANCE_LINK_STALE_AFTER_HOURS`：link health due window，預設 48。
- `MAINTENANCE_LINK_MIN_DELAY_MS` / `MAINTENANCE_LINK_MAX_DELAY_MS`：link live request delay，預設 10000 到 20000 ms。
- `EXTERNAL_FETCH_LOCK_DIR`：crawler 與 maintenance 共用的外部抓取鎖路徑。
- `EXTERNAL_FETCH_LOCK_STALE_SECONDS`：鎖超過此秒數視為 stale，預設 43200。
- `EXTERNAL_FETCH_PRIORITY_TTL_SECONDS`：price-priority signal 有效秒數，預設 600。

單次 dry-run 驗證：

```bash
docker compose --profile manual-crawler run --rm crawler \
  pnpm ops:maintenance-daemon -- --dry-run --run-once --initial-delay-seconds 0
```

## Production Smoke Daemon

`smoke-daemon` 是第二版第一輪內部營運監控。它不抓原價屋資料、不寫入商品資料，也不公開內部監控頁；只定期檢查網站、API、crawler 資料流與本機維運狀態，並把結果輸出到 container log。

檢查項目：

- 首頁 HTTP 200。
- 第二版 `/build-list` route 可回應。
- `/api/source-status` 可回應，且來源成功時間沒有過舊。
- `/api/categories` 包含第二版第一批分類 `IGrp=8`、`IGrp=11`、`IGrp=16`。
- `/api/products?pageSize=1` 可回應且至少有一筆商品。
- product list API 回傳可解析的 `X-RateLimit-*` 與 `X-RateLimit-Client-Source` headers。
- 近 30 天降幅 / 增幅排序 API 可回應，且商品資料含 `priceMovement.rangeDays=30`。
- 商品詳細 API 可回應。
- 商品列表抽樣商品的 public product image API 可回應圖片內容。
- 商品價格歷史 API 可回應。
- 最新 successful scheduled crawler run 沒有過舊。
- 近 24 小時 suspected block / 真正 parser failure 沒有異常；`INVALID_IMAGE_URL` 會另列為 source image anomaly。
- source image anomaly 是第三方來源圖片 URL 品質訊號，低於門檻只視為 OK/info，超過門檻才 WARN，不直接 FAIL。smoke 會同時顯示 rows、distinct products 與 distinct raw image urls，避免把每輪重複寫入的 parse error rows 誤解成同等數量的受影響商品。
- display-ready active 商品數沒有低於門檻。
- active 商品缺圖數沒有超過門檻。
- active 商品 source link health 的 broken 與 temporary error 數沒有超過門檻。
- raw snapshot metadata 沒有明顯超過 retention grace。

Link health smoke 只統計 `source`。`source` 代表 public `source.url` 的原價屋查看 / 購買連結；原價屋來源列中的產品介紹連結已移除，不再進 DB、API、UI、link checker 或 smoke 門檻。`SMOKE_BROKEN_LINK_*` 與 `SMOKE_TEMPORARY_LINK_*` 舊變數仍可作為 local CLI / script fallback；Compose 新部署使用 `SMOKE_SOURCE_*_LINK_*`。

建議預設：

```env
SMOKE_SOURCE_BROKEN_LINK_WARN_COUNT=1
SMOKE_SOURCE_BROKEN_LINK_FAIL_COUNT=50
SMOKE_SOURCE_TEMPORARY_LINK_WARN_COUNT=100
SMOKE_SOURCE_TEMPORARY_LINK_FAIL_COUNT=500
```

啟動：

```bash
docker compose --profile scheduled-crawler up -d smoke-daemon
docker compose --profile scheduled-crawler ps smoke-daemon
```

查看 log：

```bash
docker compose --profile scheduled-crawler logs --tail=100 smoke-daemon
docker compose --profile scheduled-crawler logs -f smoke-daemon
```

單次驗證：

```bash
docker compose --profile scheduled-crawler run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url http://web:3000
```

若只要從任意機器檢查公開 HTTP routes / APIs，不需要連部署主機 DB，可使用 public-only 模式。這會檢查首頁、第二版配單 routes、source-status、商品列表 / 詳情 / 圖片 / 價格歷史 API、rate-limit headers 與 source freshness；不會檢查 DB-backed crawler freshness、parse errors、missing image count、link health 或 raw snapshot retention：

```bash
pnpm ops:production-smoke -- --public-only --base-url https://partsradar.net
```

若要確認 public tunnel / public domain，而不是只檢查 Compose internal network，可在部署機 `.env` 設定：

```dotenv
SMOKE_PUBLIC_BASE_URL=https://partsradar.net
```

`rate limit headers` check 會讀取 product list API 的公開 `X-RateLimit-*` headers：

- `OK` 代表 API 回傳可解析的 limit / remaining / reset / client source。
- `clientSource=cf` 或 `clientSource=xff` 代表 Cloudflare / proxy identity header 已被 app-level limiter 看到。
- `clientSource=unknown` 在內部 `http://web:3000` smoke 可接受；若 `SMOKE_PUBLIC_BASE_URL` 指向公開 HTTPS 網域仍是 `unknown`，smoke 會輸出 `WARN`，需檢查 Cloudflare Tunnel / proxy 是否傳入 `CF-Connecting-IP` 或 `X-Forwarded-For`。
- log 不輸出 raw IP、`.env`、DB URL、token 或 internal header dump。

結果判讀：

- `OK`：該項目前正常。
- `WARN`：服務仍可用，但資料流或維運狀態需要觀察，例如來源成功時間偏舊、近期有 suspected block、source image anomaly、缺圖或壞連結超過警戒值。
- `FAIL`：服務或資料流有明確失敗，例如 HTTP/API 掛掉、沒有 successful scheduled crawl、最新 crawler 疑似被擋、來源成功時間超過 fail 門檻。

若 `product image api` 是 `FAIL`，代表商品列表已導出 `/api/product-images/...webp`，但公開圖片 API 無法回應圖片內容。優先檢查 `product_images` volume 是否有檔案、`PRODUCT_IMAGE_STORAGE_DIR` 是否正確、`storage-init` 是否已修權限，以及 `crawler-daemon` 新品圖片補圖或手動 image backfill 是否實際補過缺圖。

常用設定：

- `SMOKE_INTERVAL_SECONDS`：daemon 檢查間隔，預設 300。
- `SMOKE_INITIAL_DELAY_SECONDS`：daemon 啟動後第一次檢查前的延遲，預設 60。
- `SMOKE_TIMEOUT_MS`：HTTP request timeout，預設 5000。
- `SMOKE_PRODUCT_IMAGE_SAMPLE_SIZE`：從 product list 抽查幾筆 public product image API，預設 5，最大 50。
- `SMOKE_SOURCE_WARN_AFTER_MINUTES` / `SMOKE_SOURCE_FAIL_AFTER_MINUTES`：來源成功時間門檻，預設 60 / 120。
- `SMOKE_CRAWLER_WARN_AFTER_MINUTES` / `SMOKE_CRAWLER_FAIL_AFTER_MINUTES`：successful scheduled crawler run 門檻，預設 90 / 180。
- `SMOKE_RECENT_WINDOW_HOURS`：suspected block / parse error 統計窗口，預設 24。
- `SMOKE_PARSE_ERROR_WARN_COUNT` / `SMOKE_PARSE_ERROR_FAIL_COUNT`：parse error 門檻，預設 20 / 100。
- `SMOKE_INVALID_IMAGE_URL_WARN_COUNT`：source image anomaly rows WARN 門檻，預設 2000；真正使用者可見影響仍由 active products / missing product images 判斷。
- `SMOKE_MISSING_IMAGE_WARN_COUNT` / `SMOKE_MISSING_IMAGE_FAIL_COUNT`：缺圖門檻，預設 200 / 500。
- `SMOKE_SOURCE_BROKEN_LINK_WARN_COUNT` / `SMOKE_SOURCE_BROKEN_LINK_FAIL_COUNT`：source 購買 / 查看連結 broken 門檻，預設 1 / 50。
- `SMOKE_SOURCE_TEMPORARY_LINK_WARN_COUNT` / `SMOKE_SOURCE_TEMPORARY_LINK_FAIL_COUNT`：source 購買 / 查看連結 temporary error 門檻，預設 100 / 500。

注意事項：

- `smoke-daemon` 的 log 可以作為第一輪內部監控呈現，不應直接公開給使用者。
- 這不是使用者通知功能，也不建立帳號、watchlist 或價格提醒。
- 第三版維運通知、內部狀態頁與外部監控方向以 [第三版 Roadmap](../planning/v3-roadmap.md) 為準。

## Internal Ops Status Page

`ops-web` 是內部維運狀態頁服務，使用同一個 `web` image，但獨立 Compose profile 與 port。公開 `web` service 會固定設定 `OPS_STATUS_ENABLED=false`，因此公開入口請求 `/ops/status` 應回 `HTTP 404`；只有 `ops-web` 會設定 `OPS_STATUS_ENABLED=true`。

狀態頁目前顯示：

- overall `OK` / `WARN` / `FAIL`。
- source freshness、crawler freshness、recent suspected block、parse error、source image anomaly。
- display-ready active product count、product image cache missing count。
- 目前部署 env / 程式預設推導出的 daemon 排程：價格 crawler、新增商品圖片補圖、link health maintenance、raw snapshot cleanup、production smoke 與 Discord bot due report scan。
- 外部抓取互斥策略：shared external-fetch lock、價格 crawler priority signal、maintenance 暫停延後，以及排程圖片補圖只處理本輪新增商品。
- `source` link health 的 `ok`、`temporary_error`、`broken` 聚合。
- raw snapshot retention drift。
- 最近 crawl runs 與 enabled source categories 的高層級時間資訊。

狀態頁不顯示 raw HTML、parse error raw content、crawler stack trace、DB URL、token、raw IP 或 internal header dump。

啟用前先在部署主機 `.env` 設定：

```env
OPS_STATUS_TOKEN=replace_with_random_ops_status_token
# OPS_WEB_BIND_HOST=127.0.0.1
# OPS_WEB_PORT=3001
```

啟動：

```bash
docker compose --profile ops up -d ops-web
docker compose --profile ops ps ops-web
```

驗證 public `web` 沒有公開狀態頁：

```bash
curl -i http://127.0.0.1:3000/ops/status
```

預期結果是 `HTTP 404`。

驗證內部 `ops-web`：

```bash
curl -i -H "x-ops-status-token: <OPS_STATUS_TOKEN>" \
  http://127.0.0.1:3001/ops/status
```

預期結果是 `HTTP 200`。若用瀏覽器開啟，可使用：

```text
http://127.0.0.1:3001/ops/status?token=<OPS_STATUS_TOKEN>
```

外部可見性邊界：

- `OPS_WEB_BIND_HOST` 預設必須維持 `127.0.0.1`。
- `cloudflared` / public reverse proxy 只能導向 `web:3000`，不得導向 `ops-web:3000`。
- 若需要遠端查看，優先用 SSH tunnel 或內網 VPN，不把 `ops-web` 暴露到 public tunnel。
- `OPS_STATUS_TOKEN` 不得提交 Git，也不得放入公開文件、Discord 或 issue。

## Discord Webhook Notification Foundation

目前已實作的 Discord webhook 通知基礎使用 incoming webhook。`crawler-daemon` 會在每輪 scheduled crawl 成功寫入價格變動後，以 embed 對公開頻道列出本輪變價商品與金額差；`smoke-daemon` 則在每輪 production smoke summary 後，依 notification policy 以 embed 對管理者頻道送出 `WARN` / `FAIL` / `RECOVERED` 通知。Discord bot foundation 與 slash command 行為另見下方 bot 小節。

可選 secret：

- `DISCORD_PUBLIC_WEBHOOK_URL`：公開頻道 webhook，第一輪只用於公開價格變動清單。
- `DISCORD_ADMIN_WEBHOOK_URL`：管理者頻道 webhook，可用於維運告警，但仍不得包含 secret、raw HTML、stack trace、raw IP、internal header dump 或完整 DB URL。
- `PRICE_CHANGE_DISCORD_MAX_ITEMS`：單輪 crawler public Discord 變價通知最多列出的商品數，預設 50，可調高到 200。超過上限時只列出前 N 筆，訊息會標示被上限隱藏的筆數。
- `SMOKE_DISCORD_STATE_FILE`：smoke Discord notification policy 狀態檔；local script 預設 `storage/ops/smoke-discord-state.json`，Compose `smoke-daemon` 預設 `/var/lib/partsradar/snapshots/ops/smoke-discord-state.json`，讓 dedupe state 留在 named volume。部署主機若曾設定 `SMOKE_DISCORD_STATE_FILE=storage/ops/smoke-discord-state.json`，建議移除該行或改成 container absolute path，避免 state 寫在 ephemeral container filesystem。
- `SMOKE_DISCORD_COOLDOWN_SECONDS`：相同 smoke 異常通知的再次提醒間隔，預設 3600 秒。

安全邊界：

- `.env.example` 只保留 placeholder；真實 webhook URL 只能放在 untracked `.env` 或部署 secret。
- 未設定或仍是 `replace_with_*` placeholder 時，sender 視為 disabled 並略過送出。
- sender 會預設 `allowed_mentions.parse = []`，避免內容中的 `@everyone` / `@here` 觸發非預期 mention。
- sender 不負責判斷通知內容是否可外送；呼叫端與後續 notifier policy 必須先保證只傳送已整理過的安全摘要。
- sender 只做 Discord payload 格式限制、mention 防呆與 transport error message 的最小清理，避免 sender 自身回傳的錯誤文字帶出 webhook URL、DB URL、URL credentials 或常見 secret env assignment。
- notifier policy 不得把 secret、raw HTML、stack trace、raw IP、internal header dump、完整 DB URL 或未整理的第三方來源內容傳給 sender。
- Discord rate limit 不硬寫固定限制；sender 會回傳 `Retry-After` / `retry_after` 解析出的等待時間，後續 notifier policy 再決定何時重試。

public price-change notification 行為：

- `crawler-daemon` 每輪 scheduled crawl 結束後，用該輪 `crawlRunId` 讀取新建立的 `price_snapshots`，並和同商品上一筆 snapshot 比對。
- `SUCCESS_CHANGED` 代表分類解析結果 hash 變動，可能是商品名稱、圖片、商品新增 / 消失或價格變動；它不等於一定有可發送的舊價 / 新價差。
- 只有已有舊價且價格真的改變的商品會送到公開 Discord；第一批新品、沒有舊價的商品、同價更新不會送出。
- `crawler-daemon` log 會列出每輪與每分類的 `priceSnapshots`，並在跳過通知時列出 `queriedSnapshots`、`unmatchedSnapshots`、`unchangedSnapshots` 與 `currencyMismatches`。若 `priceSnapshots > 0` 但 `unmatchedSnapshots > 0`，通常代表新品、商品 identity 改變或缺少同 product id 的前一筆價格。
- 訊息使用 Discord embed，依 DB 的 `sourceCategory.displayName` 大分類與 `vendorName` 小分類分組，列出商品名稱、站內商品連結、舊價、新價與差額，時間以 Asia/Taipei 的 `MM/DD HH:MM GMT+8` 顯示。
- 公開訊息不包含 iBuy token、來源購買 URL、raw HTML、crawler error detail、DB/internal URL 或維運 link-health/smoke 明細。
- 沒有變價或未設定 `DISCORD_PUBLIC_WEBHOOK_URL` 時不送 Discord；public webhook 發送失敗或 rate limit 只寫安全 log，不會讓 crawler daemon 停止。

smoke Discord notification policy 行為：

- 未設定 `DISCORD_ADMIN_WEBHOOK_URL` 時略過通知，且不更新 notification state。
- `OK -> OK` 不送 Discord。
- `OK -> WARN`、`OK -> FAIL`、`WARN -> FAIL` 或異常 fingerprint 改變時送一次。
- 相同 `WARN` / `FAIL` 在 cooldown 內不重複送；超過 cooldown 可再次提醒。
- `WARN -> OK` 或 `FAIL -> OK` 送 `RECOVERED` 一次。
- policy message 使用 Discord embed，直接列出 smoke status、異常 check 名稱與該 check 的安全摘要 message；不再放 runbook link。
- Discord 發送失敗、rate limit 或 state file 寫入失敗只會寫入安全 log，不會讓 `smoke-daemon` 崩潰或停止後續檢查。
- `--run-once` 也會走相同 policy，可用於主機端單次驗證。

## Discord Bot Personalized Notifications

Discord bot foundation 已開始實作，並和 webhook foundation 分開。Webhook 只做公開價格變動廣播與 admin smoke 告警；Discord bot 才處理使用者 slash command 與個人化通知。手動報告會回覆在指令發出的 Discord context；每日價格提醒以 DM 發送。

Bot 目標：

- 個人目標價提醒：使用者追蹤單一商品，價格小於等於目標價時收到 DM。
- 個人價格變動報告：使用者設定固定 interval / window / scope，定期收到特定時間段內實際變價商品報告。

目前已實作：

- `discord-bot` Compose profile 與 `pnpm ops:discord-bot` daemon entrypoint。
- Discord slash command registration。
- `/price-report now`：使用者手動要求最近 `24h` / `12h` / `6h` 價格報告，bot 會在指令發出的頻道或私訊 context 以 embed 回覆中文報告。
- Slash command 只註冊 global command，供伺服器與 DM 使用，避免 Discord client 同時顯示 global 與 guild 的重複 `/price-report`。
- `/price-report now` 報告只為有資料的「價格變動」或「新增商品」產生 embed；摘要時間、統計數字與價格變動方向標題使用 Markdown emphasis 強化區隔；價格變動 embed 先分「降價」與「漲價」，商品列以單行呈現 signed 漲跌金額、舊價、新價與站內商品連結；新增商品 embed 以單行呈現目前價格與站內商品連結；兩者都依 DB 的 `sourceCategory.displayName` 大分類與 `vendorName` 小分類分組，並在小分類已顯示品牌時移除商品名稱開頭重複品牌；兩邊都沒資料時才送一個空報告摘要。
- `/price-report now` 每次最多列 `DISCORD_PRICE_REPORT_MAX_ITEMS` 筆，預設 50；上限套用在兩區合計列出的商品數；per-user cooldown 只套用在實際產生報告的 `now` 指令。
- 每次 `/price-report now` 會寫入 `discord_notification_deliveries`，供後續去重、排程與維運檢視使用。
- `/price-report settings`：查看每日價格報告設定，並提供「開啟/修改每日報告」與「關閉每日報告」按鈕。
- 「開啟/修改每日報告」會開啟 modal，要求設定統計區間、最多列出商品數與每日私訊發送時間；`time` 使用台北時間 `HH:mm`。
- 「關閉每日報告」會直接關閉每日價格報告 DM。
- `/watch`：開啟表單保存或更新目前 Discord 使用者對單一 PartsRadarTW 商品的目標價追蹤；商品欄位可貼 PartsRadarTW 商品頁分享連結、網址列 `/products/<id>` URL 或站內商品 ID，目標價格填純數字。回覆會顯示目前價格、目標價與是否已達標。
- `/watchlist`：顯示目前 Discord 使用者啟用中的目標價追蹤，包含目前價格、目標價格、狀態與站內連結。
- `/unwatch`：停用目前 Discord 使用者的單一目標價追蹤；送出後會列出自己的啟用中追蹤，選擇商品後需再按確認按鈕才會取消。

尚未實作：

- 目標價達標 DM worker。

目前設定：

- `DISCORD_BOT_TOKEN`：Discord bot token，只能放在 untracked `.env` 或部署 secret。
- `DISCORD_APPLICATION_ID`：Discord application id。
- `DISCORD_BOT_REGISTER_COMMANDS_ON_START`：daemon 啟動時是否註冊 slash command，預設 `true`。
- `DISCORD_PRICE_REPORT_MAX_ITEMS`：`/price-report now` 最多列出的商品數，預設 50。
- `DISCORD_BOT_COMMAND_COOLDOWN_SECONDS`：每位使用者手動指令 cooldown，預設 60。
- `DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS`：bot daemon 的 fallback 掃描上限，預設 300，允許 60 到 3600。每輪處理後會讀取下一筆啟用中的 `nextSendAt`；若時間早於此上限，daemon 會睡到該 due time 附近才醒來，最短 sleep 為 1 秒，避免高頻輪詢。

啟動：

```bash
docker compose --profile discord-bot up -d discord-bot
docker compose --profile discord-bot ps discord-bot
docker compose --profile discord-bot logs --tail=100 discord-bot
```

只註冊 slash command 並退出：

```bash
docker compose --profile discord-bot run --rm discord-bot \
  pnpm --filter @partsradar/crawler ops:discord-bot -- --register-commands
```

已定案的第一輪限制：

- 目前指令只開放每日報告；資料模型保留 `daily`、`every_12h`、`every_6h` 供後續擴充。
- `window` 只支援 `24h`、`12h`、`6h`。
- 目前只支援全站 `all`；`watchlist` scope 等 `/watch` 系列完成後再開放。
- 時區固定 `Asia/Taipei`。
- Price report 每次最多列 50 筆，超過上限時顯示另有幾筆未列出。
- `/watch` 第一版支援 PartsRadarTW 商品頁分享連結、站內 `/products/<id>` URL 或站內商品 ID，不以原價屋 iBuy URL 作為主流程。
- 同一 watch 達標後預設只通知一次；使用者修改目標價或重新建立 watch 才重新啟用。

安全邊界：

- `/price-report now` 只產生全站價格報告，可在指令所在頻道或私訊回覆；每日提醒與未來含個人追蹤清單或目標價設定的通知不得在公開頻道暴露。
- Bot 只保存 Discord user id 與必要偏好，不建立網站帳號。
- Bot token 只能放在 untracked `.env` 或部署 secret。
- Bot 訊息不得包含 iBuy token、來源購買 URL、raw HTML、crawler error detail、DB/internal URL、raw IP 或 internal headers。
- Bot commands 需有簡單 cooldown / rate limit。

## Second-Version Public Closeout

2026-06-03 第二版部署 closeout 基準：

```text
bd0b5646c4595c77d4cdbbb8c2f7a2187d54e735
fix(web): remove unstable coolpc import tool
```

已驗收：

- `web` / `postgres` healthy。
- `storage-init` / `migrate` / `seed` exit 0。
- `crawler-daemon` / `maintenance-daemon` / `smoke-daemon` / `raw-snapshot-cleanup-daemon` 持續執行。
- `/build-list` local / public 都回 `HTTP 200`。
- `/tools/coolpc-import` local / public 都回 `HTTP 404`。
- `/tools/coolpc-import.user.js` local / public 都回 `HTTP 404`。
- `/api/source-status` public 回 `HTTP 200`。
- `/api/products?pageSize=1` public 回 `HTTP 200`。
- `smoke-daemon` 最近檢查沒有未解釋的 `FAIL`。

目前可接受的觀察項：

- `link health: broken=0 temporary=111`：來源連結 temporary 狀態觀察，broken 為 0，不阻擋第二版完成。
- `missing product images: 8/3000`：仍在 smoke `OK` 範圍內。

若未來 public-only smoke 又顯示 `/build-list` 為 `HTTP 404`、`source freshness` 失敗或 `product image api` 抽樣 404，依下列順序收斂。所有指令仍假設在部署主機 repo 根目錄執行。

先確認部署主機已 fast-forward 到包含第二版 routes 的目標 commit，並 recreate web stack：

```bash
git status --short --branch
git log --oneline -1
git pull --ff-only origin <deployment-branch>
git log --oneline -1
docker compose config
docker compose up --build --force-recreate storage-init
docker compose up -d --build --force-recreate
curl -I http://127.0.0.1:3000/build-list
```

若本機 route 已是 `HTTP 200`，但公開網域仍是 `HTTP 404`，檢查 `cloudflared` 是否連到目前 compose network 中的 `web:3000`，並重啟 tunnel：

```bash
docker compose --profile public-tunnel logs --tail=100 cloudflared
docker compose --profile public-tunnel up -d cloudflared
curl -I https://partsradar.net/build-list
```

若 `source freshness` 失敗，先確認 scheduled crawler 正常啟動並查看最近 log：

```bash
docker compose --profile scheduled-crawler up -d crawler-daemon
docker compose --profile scheduled-crawler ps crawler-daemon
docker compose --profile scheduled-crawler logs --tail=100 crawler-daemon
curl -i https://partsradar.net/api/source-status
```

若需要立即恢復 freshness，且確認沒有其他 live fetch 或 maintenance task 正在持有 external fetch lock，可手動跑一次低速 crawl。不要把此命令做成公開 API 或常駐入口：

```bash
docker compose --profile manual-crawler run --rm crawler \
  pnpm manual:crawl-coolpc-once -- --confirm-live-fetch --delay-ms 8000
```

若 `product image api` 抽樣 404，先依本文件的 [Product Image Cache Backfill](#product-image-cache-backfill) 章節用 `--dry-run` 確認候選，再按分類或全量低速補圖。補圖完成後重跑 public smoke。

最後同時跑 public-only 與部署主機內部 smoke；第二版正式完成前不應留下未解釋的 `FAIL`：

```bash
pnpm ops:production-smoke -- --public-only --base-url https://partsradar.net
docker compose --profile scheduled-crawler run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url http://web:3000
```

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

商品資料 crawl 主流程會把 `primary_image_url` 寫入 DB；`crawler-daemon` 在每輪價格 crawl 完成並釋放 external fetch lock 後，只針對本輪新增商品建立本地 WebP 縮圖。`maintenance-daemon` 不做圖片補圖；新主機、重建 volume 或大量缺圖修復仍使用手動 product image cache backfill，避免低優先度圖片維護反覆掃描既有商品並卡住價格資料更新。

先跑小批次 dry-run：

```bash
docker compose --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --dry-run --limit 20
```

若 public smoke 的 `product image api` 失敗，且失敗商品集中在第二版新增分類，先用分類限縮補圖，避免一開始就全量抓取。第二版第一批新增分類是 `IGrp=8`、`IGrp=11`、`IGrp=16`：

```bash
docker compose --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --dry-run --igrp 16 --limit 20
docker compose --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --dry-run --igrp 11 --limit 20
docker compose --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --dry-run --igrp 8 --limit 20
```

確認候選與 storage path 正常後，再用低速 live fetch 分類補跑。每次只跑一個分類，確認 tmux session 結束與 log summary 後，再換下一個分類，避免同時對來源站送出多批 image requests：

```bash
mkdir -p logs/deployment
tmux new-session -d -s product-image-backfill-igrp16 -c "$PWD" 'docker compose --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --confirm-live-fetch --igrp 16 --min-delay-ms 5000 --max-delay-ms 12000 2>&1 | tee logs/deployment/product-image-backfill-igrp16.log'
tmux ls
```

`IGrp=16` 完成後，將 session name、`--igrp` 與 log filename 改成 `11` 或 `8` 再重跑。

每個分類完成後，重跑 public smoke 或至少抽查列表圖片 API；`product image api` 不應再是 `HTTP 404`：

```bash
docker compose --profile scheduled-crawler run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url https://partsradar.net
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
- 不和 `manual:crawl-coolpc-once`、`crawler-daemon` 或 `maintenance-daemon` 同時執行，避免和 scheduled 新品補圖或其他外部來源檢查重疊。
- 中斷後可重跑；已存在的 `.webp` 會被 skipped。
- 圖片寫入 volume 後通常不需要重啟 `web`，重新整理頁面即可讀到新檔案。
