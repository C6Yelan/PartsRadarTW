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
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler
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

它不連 DB、不抓 CoolPC、不跑 crawler，也不長期維持 root runtime。`web`、`crawler`、`crawler-daemon`、`raw-snapshot-cleanup-daemon` 與 `smoke-daemon` 都會等 `storage-init` 成功完成後才啟動。

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
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm --no-deps crawler \
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
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel up -d cloudflared
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel ps cloudflared
```

關閉 tunnel：

```bash
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel stop cloudflared
```

驗證：

```bash
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel logs --tail=100 cloudflared
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
- 若另一個 crawler process 正在持有 external fetch lock，`crawler-daemon` 會在 `CRAWLER_LOCK_RETRY_SECONDS` 後重試，不會並行抓來源。
- `.env` 中的 `CRAWLER_INTERVAL_SECONDS`、`CRAWLER_BACKOFF_SECONDS` 與 `CRAWLER_CATEGORY_DELAY_MS` 已確認；預設分別為 `1800`、`3600`、`8000`。
- `.env` 中的 `CRAWLER_LOCK_RETRY_SECONDS` 已確認；預設 `120`。
- `.env` 中的 `PRODUCT_IMAGE_STORAGE_DIR` 與 `CRAWLER_NEW_PRODUCT_IMAGE_*` 已確認；crawler-daemon 只會在每輪價格 crawl 後補本輪新增商品圖片。
- `.env` 中的 `EXTERNAL_FETCH_LOCK_DIR` 與 `EXTERNAL_FETCH_LOCK_STALE_SECONDS` 已確認。
- `WEB_BIND_HOST` 與 `POSTGRES_BIND_HOST` 仍維持 `127.0.0.1`。

啟動：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d crawler-daemon
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler ps crawler-daemon
```

查看 log：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler logs --tail=100 crawler-daemon
```

若該輪有新品且 crawl 結果不需 backoff，log 會在價格 crawl summary 與 Discord 通知後顯示 `Starting new product image backfill` / `New product image backfill finished`。這段 follow-up 不會持有 external fetch lock，也不會掃描既有缺圖商品；若該輪疑似被擋或需要 backoff，會略過新品補圖。

停止：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler stop crawler-daemon
```

安全規則：

- 不提供公開 crawler trigger API。
- 不對外開 port。
- 低於 `60` 秒的 schedule interval / backoff 會被 daemon 拒絕。
- 低於 `3000` ms 的 category delay 會被 daemon 拒絕。
- 疑似被來源站攔截時，當輪 crawl 會停止並進入 backoff。
- 單分類 fetch 例外會短 retry；若仍失敗，分類結果會保存 `error.name`、`error.message`、`error.cause.code` 與 `error.cause.message`，避免 log 只剩 `fetch failed`。
- 若整輪所有分類都是 `FETCH_FAILED`，daemon 會先用較短 retry 間隔重新嘗試，預設不超過 600 秒；其他 parse/block 失敗仍走 `CRAWLER_BACKOFF_SECONDS`。
- 若 external fetch lock 已被持有，crawler 會使用 `CRAWLER_LOCK_RETRY_SECONDS` 的短 retry，不會並行抓來源，也不會等完整 30 分鐘才再試。
- daemon log 不應輸出 `.env`、`DATABASE_URL`、Cloudflare token 或其他 secret。

驗證：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler config --services
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler logs --tail=100 crawler-daemon
curl -i https://<domain>/api/source-status
```

## Product Availability

商品 availability 由 crawler 的既有 missing flow 提供，不執行獨立的來源連結檢查。只有成功 fetch 並解析的分類 crawl 才會累計 missing；fetch failed、suspected block 或 parse failed 不改變 missing 狀態。

- 連續 6 次成功 crawl 都未看到商品後，`Product.isActive` 才會改為 false，並保留 `missingSince`、`lastSeenAt` 與價格歷史。
- 商品重新出現時恢復 active、清除 missing state，並繼續原有商品歷史。
- 商品詳情對 inactive 商品顯示「可能已下架或暫時無法確認」的保守提示，並顯示價格資料與最後看見時間。
- `source.url` 仍供使用者前往原價屋自行確認；request lifecycle 不對來源站發送額外請求。

## Production Smoke Daemon

`smoke-daemon` 是第二版第一輪內部營運監控。它不抓原價屋資料、不寫入商品資料，也不公開內部監控頁；只定期檢查網站、API、crawler 資料流與本機維運狀態，並把結果輸出到 container log。

外部監控的公開檢查範圍與 Uptime Kuma / Cloudflare 建議見 [External Monitoring](external-monitoring.md)。公開監控只看 public route / API；DB-backed 與 Discord bot delivery 訊號留在 `smoke-daemon`、admin webhook 與 container logs。

檢查項目：

- 首頁 HTTP 200。
- 第二版 `/build-list` route 可回應。
- `/api/source-status` 可回應，且來源成功時間沒有過舊。
- `/api/categories` 可回應，且至少有一筆分類。
- `/api/products?pageSize=1` 可回應且至少有一筆商品。
- product list API 回傳可解析的 `X-RateLimit-*` 與 `X-RateLimit-Client-Source` headers。
- 商品詳細 API 可回應。
- 商品列表抽樣商品的 public product image API 可回應圖片內容。
- 商品價格歷史 API 可回應。
- 最新 successful scheduled crawler run 沒有過舊。
- 近 24 小時 suspected block / 真正 parser failure 沒有異常；`INVALID_IMAGE_URL` 會另列為 source image anomaly。
- source image anomaly 是第三方來源圖片 URL 品質訊號，低於門檻只視為 OK/info，超過門檻才 WARN，不直接 FAIL。smoke 會同時顯示 rows、distinct products 與 distinct raw image urls，避免把每輪重複寫入的 parse error rows 誤解成同等數量的受影響商品。
- display-ready active 商品數沒有低於門檻。
- active 商品缺圖數沒有超過門檻。
- raw snapshot metadata 沒有明顯超過 retention grace。
- 近 24 小時 personal 與 public Discord delivery 最新狀態沒有未恢復的 failed / rate limited；personal 依通知 stream、public 依報告頻道判斷，後續成功會覆蓋同 stream 的舊失敗。

啟動：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile ops up -d smoke-daemon
docker compose -f compose.yml -f compose.ops.yml --profile ops ps smoke-daemon
```

查看 log：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile ops logs --tail=100 smoke-daemon
docker compose -f compose.yml -f compose.ops.yml --profile ops logs -f smoke-daemon
```

單次驗證：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile ops run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url http://web:3000
```

若只要從任意機器檢查公開 HTTP routes / APIs，不需要連部署主機 DB，可使用 public-only 模式。這會檢查首頁、第二版配單 routes、source-status、商品列表 / 詳情 / 圖片 / 價格歷史 API、rate-limit headers 與 source freshness；不會檢查 DB-backed crawler freshness、parse errors、missing image count 或 raw snapshot retention：

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
- `WARN`：服務仍可用，但資料流或維運狀態需要觀察，例如來源成功時間偏舊、近期有 suspected block、source image anomaly、缺圖或 Discord bot delivery 最新狀態仍是失敗 / rate limit。
- `FAIL`：服務或資料流有明確失敗，例如 HTTP/API 掛掉、沒有 successful scheduled crawl、最新 crawler 疑似被擋、來源成功時間超過 fail 門檻。

若 `product image api` 是 `FAIL`，代表商品列表已導出 `/api/product-images/...webp`，但公開圖片 API 無法回應圖片內容。優先檢查 `product_images` volume 是否有檔案、`PRODUCT_IMAGE_STORAGE_DIR` 是否正確、`storage-init` 是否已修權限，以及 `crawler-daemon` 新品圖片補圖或手動 image backfill 是否實際補過缺圖。

常用設定：

- `SMOKE_INTERVAL_SECONDS`：daemon 檢查間隔，預設 900。Public uptime 建議交由 Uptime Kuma / Cloudflare / `monitor:public-smoke` 追蹤；此 daemon 保留 DB-backed 與 deployment-internal 訊號。
- `SMOKE_INITIAL_DELAY_SECONDS`：daemon 啟動後第一次檢查前的延遲，預設 60。
- `SMOKE_TIMEOUT_MS`：HTTP request timeout，預設 5000。
- `SMOKE_PRODUCT_IMAGE_SAMPLE_SIZE`：從 product list 抽查幾筆 public product image API，預設 5，最大 50。
- `SMOKE_SOURCE_WARN_AFTER_MINUTES` / `SMOKE_SOURCE_FAIL_AFTER_MINUTES`：來源成功時間門檻，預設 60 / 120。
- `SMOKE_CRAWLER_WARN_AFTER_MINUTES` / `SMOKE_CRAWLER_FAIL_AFTER_MINUTES`：successful scheduled crawler run 門檻，預設 90 / 180。
- `SMOKE_RECENT_WINDOW_HOURS`：suspected block / parse error / Discord bot delivery 最新狀態檢查窗口，預設 24。
- `SMOKE_PARSE_ERROR_WARN_COUNT` / `SMOKE_PARSE_ERROR_FAIL_COUNT`：parse error 門檻，預設 20 / 100。
- `SMOKE_INVALID_IMAGE_URL_WARN_COUNT`：source image anomaly rows WARN 門檻，預設 2000；真正使用者可見影響仍由 active products / missing product images 判斷。
- `SMOKE_MISSING_IMAGE_WARN_COUNT` / `SMOKE_MISSING_IMAGE_FAIL_COUNT`：缺圖門檻，預設 200 / 500。

注意事項：

- `smoke-daemon` 的 log 可以作為第一輪內部監控呈現，不應直接公開給使用者。
- 這不是使用者通知功能，也不建立帳號、watchlist 或價格提醒。
- 第三版維運通知與外部監控方向以 [第三版 Roadmap](../planning/v3-roadmap.md) 為準。

## Discord Admin Webhook Notification Foundation

Discord webhook 僅保留給管理者告警。`smoke-daemon` 會在每輪 production smoke summary 後，依 notification policy 以 embed 對管理者頻道送出 `WARN` / `FAIL` / `RECOVERED` 通知，包含近 24 小時仍未被後續成功覆蓋的 personal / public Discord delivery failed / rate limited 數量；摘要不包含 user id、channel id 或 delivery error message。公開價格報告由 Discord bot 發送，另見下方 bot 小節。

可選 secret：

- `DISCORD_ADMIN_WEBHOOK_URL`：管理者頻道 webhook，可用於維運告警，但仍不得包含 secret、raw HTML、stack trace、raw IP、internal header dump 或完整 DB URL。
- `SMOKE_DISCORD_STATE_FILE`：smoke Discord notification policy 狀態檔；local script 預設 `storage/ops/smoke-discord-state.json`，Compose `smoke-daemon` 預設 `/var/lib/partsradar/snapshots/ops/smoke-discord-state.json`，讓 dedupe state 留在 named volume。部署主機若曾設定 `SMOKE_DISCORD_STATE_FILE=storage/ops/smoke-discord-state.json`，建議移除該行或改成 container absolute path，避免 state 寫在 ephemeral container filesystem。
- `SMOKE_DISCORD_COOLDOWN_SECONDS`：相同 smoke 異常通知的再次提醒間隔，預設 21600 秒（6 小時）。首次異常、異常 check 組合／等級變化與恢復仍立即通知。

安全邊界：

- `.env.example` 只保留 placeholder；真實 webhook URL 只能放在 untracked `.env` 或部署 secret。
- 未設定或仍是 `replace_with_*` placeholder 時，sender 視為 disabled 並略過送出。
- sender 會預設 `allowed_mentions.parse = []`，避免內容中的 `@everyone` / `@here` 觸發非預期 mention。
- sender 不負責判斷通知內容是否可外送；呼叫端與後續 notifier policy 必須先保證只傳送已整理過的安全摘要。
- sender 只做 Discord payload 格式限制、mention 防呆與 transport error message 的最小清理，避免 sender 自身回傳的錯誤文字帶出 webhook URL、DB URL、URL credentials 或常見 secret env assignment。
- notifier policy 不得把 secret、raw HTML、stack trace、raw IP、internal header dump、完整 DB URL 或未整理的第三方來源內容傳給 sender。
- Discord rate limit 不硬寫固定限制；sender 會回傳 `Retry-After` / `retry_after` 解析出的等待時間，後續 notifier policy 再決定何時重試。

smoke Discord notification policy 行為：

- 未設定 `DISCORD_ADMIN_WEBHOOK_URL` 時略過通知，且不更新 notification state。
- `OK -> OK` 不送 Discord。
- `OK -> WARN`、`OK -> FAIL`、`WARN -> FAIL` 或異常 fingerprint 改變時送一次。
- 相同 `WARN` / `FAIL` 在 cooldown 內不重複送；超過 cooldown 可再次提醒。
- `WARN -> OK` 或 `FAIL -> OK` 送 `RECOVERED` 一次。
- `WARN` / `FAIL` embed 以 `Asia/Taipei` 顯示檢查時間，只列異常 check 名稱與安全摘要；`RECOVERED` 只列前一狀態、台北恢復時間與目前 OK/WARN/FAIL counts，不列所有 OK check，也不再放 runbook link。
- Discord 發送失敗、rate limit 或 state file 寫入失敗只會寫入安全 log，不會讓 `smoke-daemon` 崩潰或停止後續檢查。
- `--run-once` 也會走相同 policy，可用於主機端單次驗證。

## Discord Bot Notifications

Discord bot 處理公開價格報告、使用者 slash command 與個人化通知。公開價格報告會發送到設定的伺服器頻道；即時價格報告會回覆在指令發出的 Discord context；每日私訊價格報告與目標價提醒以 DM 發送。

Bot 目標：

- 公開價格報告：本輪 scheduled crawl 有符合設定的既有商品價格變動或新增商品時，由 bot 發送到指定公開頻道。
- 目標價提醒：使用者追蹤單一商品，價格小於等於目標價時收到 DM。
- 每日私訊價格報告：使用者設定固定 interval / window / scope、分類篩選與內容類型篩選，定期收到特定時間段內實際變價商品報告。

目前已實作：

- `discord-bot` Compose profile 與 `pnpm ops:discord-bot` daemon entrypoint。
- Discord slash command registration。
- `/public-report status/manage/test`：管理伺服器公開價格報告，分別用於查看狀態、開啟設定面板與發送單次測試報告；此指令以 Discord command 權限限制可見性，只有具備管理伺服器權限的成員通常會看到。頻道設定、分類、最多五組商品名稱關鍵字與降價 / 漲價 / 新增商品內容類型寫入 `discord_public_price_report_settings`。公開報告目標頻道需允許 bot 傳送訊息與嵌入連結。手動測試不更新排程 cursor 且不會自動重試；新啟用的設定只處理後續 crawl run，不補發先前輪次。
- Public price report：bot daemon 讀取已啟用的 `discord_public_price_report_settings`，掃描 scheduled crawl 後尚未送出的 `crawlRunId`，讀取該輪新建立的 `price_snapshots`，和同商品上一筆 snapshot 比對，套用該伺服器的公開報告篩選後送到公開 Discord；沒有舊價的 first-seen 商品只在設定包含新增商品時送出，同價更新不會送出。
- Public price report 訊息使用 bot embed，依 DB 的 `sourceCategory.displayName` 大分類與 `vendorName` 小分類分組，列出 signed 漲跌金額、舊價、新價、商品名稱與站內商品連結。送達、略過、失敗與 rate limit 會寫入 `discord_public_price_report_deliveries`，以 `crawlRunId + channelId` 去重；失敗只保存 structured category、HTTP status 與數字 Discord code。
- `/price-report now`：使用者手動要求最近 `24h` / `12h` / `6h` 價格報告，bot 會在指令發出的頻道或私訊 context 以 embed 回覆中文報告；若使用者已有啟用中的每日設定，手動報告會沿用該設定的分類、商品名稱關鍵字與內容類型，方便確認報告內容。
- Slash command 只註冊 global command，供伺服器與 DM 使用，避免 Discord client 同時顯示 global 與 guild 的重複 `/price-report`。
- `/price-report now` 報告只為有資料的「價格變動」或「新增商品」產生 embed；摘要時間、統計數字與價格變動方向標題使用 Markdown emphasis 強化區隔；價格變動 embed 先分「降價」與「漲價」，商品列以單行呈現 signed 漲跌金額、舊價、新價與站內商品連結；新增商品 embed 以單行呈現目前價格與站內商品連結；兩者都依 DB 的 `sourceCategory.displayName` 大分類與 `vendorName` 小分類分組，並在小分類已顯示品牌時移除商品名稱開頭重複品牌；兩邊都沒資料時才送一個空報告摘要。
- 個人與公開價格報告固定最多列 50 筆，上限套用在價格變動與新增商品兩區合計；不提供 slash command、設定面板、CLI 或 env override。per-user cooldown 套用在實際產生報告的 `now` 指令與 settings 面板的「傳送預覽 DM」。
- 每次 `/price-report now` 或 settings「傳送預覽 DM」會寫入 `discord_notification_deliveries`，供後續去重、排程與維運檢視使用。
- 排程每日私訊價格報告若發送失敗或遇到 Discord rate limit，會保留上次成功時間並在 10 分鐘後重試；後續成功後才推進到下一個正式每日時間。
- `/price-report settings`：開啟私密設定面板，以 embed 顯示每日私訊價格報告狀態、最近一次 delivery 狀態與目前設定，並用選單調整統計區間、分類篩選與報告內容類型；分類選單只列實際分類，部分分類狀態可按「改為全部分類」恢復不限制分類。
- settings 面板的「傳送預覽 DM」會以目前設定產生一次 DM 報告，即使每日私訊價格報告尚未啟用也可先確認篩選效果與私訊可用性；多則 report chunks 會直接送到使用者 DM，settings 面板只回報送達狀態或可理解的失敗原因。
- 「調整關鍵字」會開啟最多五格的 modal；不同格擇一符合，每格內以空白表示所有詞都要符合，全部留空代表不限。儲存仍使用逗號分隔 OR 組，例如 `RTX 5090, DDR5` 代表 `(RTX AND 5090) OR DDR5`。
- 「調整時間」只設定每日私訊發送時間；`time` 使用台北時間 `HH:mm`，並接受手機常見的全形數字、全形冒號與冒號周邊空白。報告內容至少包含降價、漲價或新增商品其中一種。
- 「開啟每日私訊價格報告」會依目前面板設定啟用每日 DM；「關閉每日私訊價格報告」會直接關閉該 DM 排程。
- `/watch`：開啟 ephemeral 統合管理介面，依最近更新優先的固定順序，分頁列出目前 Discord 使用者啟用中的目標價追蹤。使用者可按「新增追蹤」開啟表單，貼 PartsRadarTW 商品頁分享連結、網址列 `/products/<id>` URL 或站內商品 ID，並輸入純數字目標價格；全形數字會先轉為半形，`NT$`、逗號、內部空格、小數、負數與文字仍會拒絕。使用者也可從選單挑選既有追蹤後查看目前價格、價格資料時間、目標價格與追蹤狀態，再修改目標價或經確認後移除單筆追蹤。每頁最多 25 筆，介面不提供篩選、排序選單或批次移除，也不顯示資料庫 watch ID。
- Bot daemon 會掃描啟用且尚未通知的 watch；當目前價格與 watch 幣別一致且小於等於目標價時，以精簡 DM embed 發送商品名稱、目前價格、目標價格、站內商品連結與單一價格資料時間。
- 同一 watch 成功發送後只通知一次；修改目標價或重新啟用 watch 會清除通知狀態。發送失敗或 Discord rate limit 不會標記成功，後續掃描仍可重試。
- 每輪最多處理 25 筆達標 watch，並以 15 分鐘 notification claim lease 避免同時執行的 daemon 重複發送；程序在 claim 後中斷時，逾時 claim 可由後續掃描接手。
- 每次目標價發送結果會寫入 `discord_notification_deliveries`，`kind=TARGET_PRICE`，供維運檢查成功、失敗與 rate limit 狀態。

目前設定：

- `DISCORD_BOT_TOKEN`：Discord bot token，只能放在 untracked `.env` 或部署 secret。
- `DISCORD_APPLICATION_ID`：Discord application id。
- `DISCORD_BOT_REGISTER_COMMANDS_ON_START`：daemon 啟動時是否註冊 slash command，預設 `true`。
- `DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED`：是否執行公開價格報告排程與互動，預設 `true`；設為 `false` 時保留設定但暫停發送與設定操作。
- `DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED`：是否執行個人價格報告排程與互動，預設 `true`；設為 `false` 時保留使用者設定但暫停 DM 報告。
- `DISCORD_FEATURE_TARGET_WATCHES_ENABLED`：是否執行目標價追蹤掃描與互動，預設 `true`；設為 `false` 時保留 watch rows 但暫停通知與管理操作。
- `DISCORD_BOT_COMMAND_COOLDOWN_SECONDS`：每位使用者手動指令 cooldown，預設 60。
- `DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS`：bot daemon 的目標價掃描間隔與每日私訊價格報告 fallback 掃描上限，預設 300 秒，允許 60 到 3600。每日私訊價格報告若有更早的 `nextSendAt`，daemon 會睡到該 due time 附近才醒來；目標價仍依設定間隔掃描，最短 sleep 為 1 秒，避免高頻輪詢。

啟動：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot up -d discord-bot
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot ps discord-bot
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot logs --tail=100 discord-bot
```

只註冊 slash command 並退出：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  pnpm --filter @partsradar/crawler ops:discord-bot -- --register-commands
```

已定案的第一輪限制：

- 目前指令只開放每日私訊價格報告；資料模型保留 `daily`、`every_12h`、`every_6h` 供後續擴充。
- `window` 只支援 `24h`、`12h`、`6h`。
- `scope` 仍只支援全站 `all`；個人化只做分類、商品名稱關鍵字與內容類型篩選，不接 `/watch` 清單，避免將 price-report 與單品目標價追蹤耦合。
- 時區固定 `Asia/Taipei`。
- Price report 每次最多列 50 筆，超過上限時顯示另有幾筆未列出。
- `/watch` 第一版支援 PartsRadarTW 商品頁分享連結、站內 `/products/<id>` URL 或站內商品 ID，不以原價屋 iBuy URL 作為主流程。
- 目標價追蹤只註冊 `/watch`；舊 `/watchlist` 與 `/unwatch` 不再註冊，daemon 啟動時的 global command PUT 會以目前指令集合取代舊集合。
- 同一 watch 達標後預設只通知一次；使用者修改目標價或重新建立 watch 才重新啟用。

安全邊界：

- `/price-report now` 只產生全站價格報告，可在指令所在頻道或私訊回覆；每日提醒與目標價達標通知只使用 DM，不得在公開頻道暴露個人追蹤資料。
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
- `crawler-daemon` / `smoke-daemon` / `raw-snapshot-cleanup-daemon` 持續執行。
- `/build-list` local / public 都回 `HTTP 200`。
- `/tools/coolpc-import` local / public 都回 `HTTP 404`。
- `/tools/coolpc-import.user.js` local / public 都回 `HTTP 404`。
- `/api/source-status` public 回 `HTTP 200`。
- `/api/products?pageSize=1` public 回 `HTTP 200`。
- `smoke-daemon` 最近檢查沒有未解釋的 `FAIL`。

目前可接受的觀察項：

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
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel logs --tail=100 cloudflared
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel up -d cloudflared
curl -I https://partsradar.net/build-list
```

若 `source freshness` 失敗，先確認 scheduled crawler 正常啟動並查看最近 log：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d crawler-daemon
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler ps crawler-daemon
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler logs --tail=100 crawler-daemon
curl -i https://partsradar.net/api/source-status
```

若需要立即恢復 freshness，且確認沒有其他 live fetch 或 crawler process 正在持有 external fetch lock，可手動跑一次低速 crawl。不要把此命令做成公開 API 或常駐入口：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm manual:crawl-coolpc-once -- --confirm-live-fetch --delay-ms 8000
```

若 `product image api` 抽樣 404，先依本文件的 [Product Image Cache Backfill](#product-image-cache-backfill) 章節用預設 dry-run 確認候選，再按分類或全量低速補圖。補圖完成後重跑 public smoke。

最後同時跑 public-only 與部署主機內部 smoke；第二版正式完成前不應留下未解釋的 `FAIL`：

```bash
pnpm ops:production-smoke -- --public-only --base-url https://partsradar.net
docker compose -f compose.yml -f compose.ops.yml --profile ops run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url http://web:3000
```

## Backup And Restore Drill

備份腳本預設讀取部署主機 repo 根目錄的 untracked `.env`，並透過 `docker compose` 存取 `postgres` service 與 named volumes。備份輸出會寫到 ignored `backups/<timestamp>/`。

建立備份：

```bash
pnpm backup:create
```

預設內容：

- `postgres.dump`：PostgreSQL custom-format dump。
- `product-images.tgz`：`product_images` volume archive，若 volume 存在。
- `SHA256SUMS`：備份檔校驗值。

若需要把 raw snapshot volume 也封存：

```bash
BACKUP_INCLUDE_SNAPSHOTS=1 pnpm backup:create
```

還原演練不覆蓋正式 DB；它會建立 `${POSTGRES_DB}_restore_drill`，還原 dump、查詢基本表格，最後預設刪除臨時 DB：

```bash
pnpm backup:restore-drill -- backups/<timestamp>
```

若要保留演練 DB 供人工檢查：

```bash
KEEP_RESTORE_DRILL_DB=1 pnpm backup:restore-drill -- backups/<timestamp>
```

正式還原到 production DB 前，需先停 `web`、`crawler-daemon`、`discord-bot` 與其他會寫 DB 的服務，並另外寫明該次事故的還原目標與資料時間點；不要把 restore-drill 腳本改成直接覆蓋正式 DB。

## Raw Snapshot Cleanup

Raw snapshot cleanup 預設只做 dry run。Production 環境應透過 `crawler` container 執行，確保使用 container 內的 `DATABASE_URL`、`SNAPSHOT_STORAGE_DIR` 與 mounted snapshot volume：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm --no-deps crawler \
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup

docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm --no-deps crawler \
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup -- --confirm-delete
```

本機開發環境若已有可連線的 `.env` / `DATABASE_URL` 與 snapshot storage，可直接執行：

```bash
pnpm ops:raw-snapshots:cleanup
```

cleanup 會依 active snapshot root 找到 raw snapshot 壓縮檔，刪除超過保留期限的 metadata，並只移除不再被任何保留中 snapshot metadata 參照的 gzip 檔案。設定 `SNAPSHOT_STORAGE_DIR` 時會取代內建 default；`--storage-dir` 只能使用該 active root 或其受控子目錄，child 內的 gzip path 仍以 active root 為相對基準記錄。正式刪除與 scheduled/manual/replay writer 共用同一把 storage mutation lock；writer 執行中會直接停止刪除且不改動資料。dry-run 不取得或修改該 lock，因此 writer 執行中仍可列出 candidates。若要先驗證目前資料是否會產生 candidates，可暫時用較短 retention 做 dry run：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm --no-deps crawler \
  pnpm --filter @partsradar/crawler ops:raw-snapshots:cleanup -- \
  --normal-retention-days 1 --abnormal-retention-days 1
```

Production 也會透過 `compose.crawler.yml` 的 `scheduled-crawler` profile 啟動 `raw-snapshot-cleanup-daemon`，預設每 24 小時執行一次正式 cleanup：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d raw-snapshot-cleanup-daemon
```

`raw-snapshot-cleanup-daemon` 會明確帶 `--confirm-delete`，但仍沿用同一套 30 / 90 天保留規則、path 防呆與 shared gzip reference 檢查。若要調整執行頻率，可設定 `RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS`；允許範圍是 3600 到 604800 秒。

## Product Image Cache Backfill

商品資料 crawl 主流程會把 `primary_image_url` 寫入 DB；`crawler-daemon` 在每輪價格 crawl 完成並釋放 external fetch lock 後，只針對本輪新增商品建立本地 WebP 縮圖。新主機、重建 volume 或大量缺圖修復仍使用手動 product image cache backfill，避免低優先度圖片維護反覆掃描既有商品並卡住價格資料更新。

裸命令預設是 dry-run，不會對來源站送 request。先跑小批次預覽：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --limit 20
```

若 public smoke 的 `product image api` 失敗，且失敗商品集中在第二版新增分類，先用分類限縮補圖，避免一開始就全量抓取。第二版第一批新增分類是 `IGrp=8`、`IGrp=11`、`IGrp=16`：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --igrp 16 --limit 20
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --igrp 11 --limit 20
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --igrp 8 --limit 20
```

確認候選與 storage path 正常後，再用低速 live fetch 分類補跑。每次只跑一個分類，確認 tmux session 結束與 log summary 後，再換下一個分類，避免同時對來源站送出多批 image requests：

```bash
mkdir -p logs/deployment
tmux new-session -d -s product-image-backfill-igrp16 -c "$PWD" 'docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --confirm-live-fetch --igrp 16 --min-delay-ms 5000 --max-delay-ms 12000 2>&1 | tee logs/deployment/product-image-backfill-igrp16.log'
tmux ls
```

`IGrp=16` 完成後，將 session name、`--igrp` 與 log filename 改成 `11` 或 `8` 再重跑。

每個分類完成後，重跑 public smoke 或至少抽查列表圖片 API；`product image api` 不應再是 `HTTP 404`：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile ops run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url https://partsradar.net
```

全量 backfill 應用 `tmux` 放背景慢慢跑，避免 SSH 中斷造成流程停止：

```bash
mkdir -p logs/deployment
tmux new-session -d -s product-image-backfill -c "$PWD" 'docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler pnpm ops:image-cache:backfill -- --confirm-live-fetch --min-delay-ms 3000 --max-delay-ms 5000 2>&1 | tee logs/deployment/product-image-backfill.log'
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
- 不和 `manual:crawl-coolpc-once` 或 `crawler-daemon` 同時執行，避免和 scheduled 新品補圖或其他外部來源請求重疊。
- 中斷後可重跑；已存在的 `.webp` 會被 skipped。
- 圖片寫入 volume 後通常不需要重啟 `web`，重新整理頁面即可讀到新檔案。

## Product Vendor Backfill

Vendor metadata backfill 裸命令預設只預覽分類差異，不寫 DB：

```bash
pnpm ops:product-vendors:backfill -- --limit 20
```

確認預覽結果後，只有明確加入 `--confirm-write` 才會更新已變更商品；可搭配 `--igrp` 或 `--limit` 收斂範圍：

```bash
pnpm ops:product-vendors:backfill -- --confirm-write --igrp 4 --limit 20
```
