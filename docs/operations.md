# Operations

本 runbook 只收錄目前程式與 Compose 可執行的操作。手動 crawl、cleanup 與 backfill CLI 都先 dry-run／preview，再使用明確 confirmation flag。

以下指令預設從 repository root 執行，且 `.env` 已正確設定。不要在輸出或 ticket 貼出 secret。

## 核心服務健康檢查

使用時機：部署後、incident 開始時或例行確認。

```bash
docker compose ps -a
docker compose logs --tail=100 postgres migrate seed web
curl --fail http://127.0.0.1:3000/api/source-status
curl --fail 'http://127.0.0.1:3000/api/products?pageSize=1'
```

成功標準：PostgreSQL 與 web healthy；migration／seed exit 0；API HTTP 200 且 source status 有啟用分類。

失敗處理：先讀取對應 service log。不要在 migration 失敗後強制標記 migration 成功，也不要刪 volume重試。

## 初始化 storage

使用時機：新主機、volume 重建或 ownership 錯誤。

```bash
docker compose run --rm storage-init
```

成功標準：`snapshots` 與 `product_images` volume 目錄存在且 runtime `node` 可寫。

失敗處理：確認 Docker volume、磁碟空間與 host filesystem；不要把 runtime service改成 root長期執行。

## Production smoke

### Public-only

使用時機：不提供 DB secret 的外部監控，或 public cutover 後。

```bash
pnpm ops:production-smoke -- --public-only --base-url https://partsradar.net
```

檢查 homepage、配單頁、公開 API、抽樣圖片、來源 freshness 與 rate-limit headers。成功標準為沒有 FAIL；WARN 仍需人工判讀。

### Full smoke

使用時機：private release validation 或排查 DB／crawler／Discord delivery。

```bash
docker compose -f compose.yml -f compose.ops.yml --profile ops run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url http://web:3000
```

Full smoke 另檢查 crawler run、CoolPC 篩選同步、parse errors、來源圖片異常、商品篩選品質、active products、缺圖、snapshot retention 與近期 Discord delivery。只有 FAIL 使用 non-zero exit；WARN 不會自動阻止 shell pipeline，因此部署流程必須解析摘要。

預設門檻只是起始值。應依 production baseline 調整 env，不能把「沒有 FAIL」誤寫成門檻已校準。

### Smoke notification state compatibility

Production smoke notification state 只支援 schema v3。v1、v2 與它們的備份都不相容，從舊備份還原時不得直接覆蓋目前的 v3 state。Parser 會拒絕舊版本；daemon 仍依現有安全流程使用空白 v3 state，並在成功週期寫回新狀態。

部署端只能在確認目前 state 為有效 v3、daemon health 正常且已完成預期週期後，才辨識並刪除明確的舊 smoke notification state 副本。不得使用廣泛檔名或遞迴刪除。此規則不適用於 PostgreSQL 備份、Prisma migration、product image storage、raw snapshots、CoolPC filter sync state、其他 daemon state、Discord database records 或其他 Docker volume 資料。

## Scheduled crawler

使用時機：核心 web 與 DB 驗證完成後啟動價格更新。

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d
docker compose -f compose.yml -f compose.crawler.yml logs --tail=100 crawler-daemon image-cache-recovery-daemon raw-snapshot-cleanup-daemon
```

成功標準：Crawler 完成分類週期，沒有疑似阻擋或無限 backoff；圖片修復不占用價格 crawler 的 external-fetch lock；cleanup daemon 能取得正確 snapshot path。

失敗處理：遇到 suspected block、來源錯誤或 external fetch lock 衝突時先停止 crawler-daemon，保存 snapshot 與 log，再用 offline raw replay分析。不要提高並行或移除 request delay硬試。

`crawler-daemon` 預設每 7 天讀取一次 CoolPC 估價頁的既有篩選條件，只有已知群組與本站既有標籤映射全部通過驗證才發布。新條件、來源結構變動或抓取失敗會保留上一版可用狀態，並由 full smoke／Discord 管理告警回報；不會阻止一般價格 crawl。狀態預設保存在 snapshot volume 的 `ops/coolpc-filter-sync-state.json`，週期可用 `CRAWLER_FILTER_SYNC_INTERVAL_SECONDS` 調整。

Crawl lifecycle 維運 marker：建立 run 後若有未吸收的 lifecycle failure，可完成 best-effort finalization 時會寫入 `crawl_run_lifecycle_failure`。下一次成功取得 raw snapshot mutation lock 的 live crawl，會先將未完成的 `RUNNING` run 收斂為 `FETCH_FAILED` 並寫入 `crawl_run_interrupted_reconciled`；只有實際收斂時才記錄 sanitized count。這兩個 marker 都代表需要檢查 crawler 與 DB 維運 log，不是成功狀態。

停止 writers：

```bash
docker compose -f compose.yml -f compose.crawler.yml stop crawler-daemon image-cache-recovery-daemon raw-snapshot-cleanup-daemon
```

## 手動 crawl

使用時機：排程前驗證單次完整資料流。Live fetch 必須明確確認。

先看說明：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler
```

Live one-shot：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm manual:crawl-coolpc-once -- --confirm-live-fetch --storage-dir /var/lib/partsradar/snapshots
```

成功標準：每個啟用分類有明確結果，沒有 suspected block，商品／價格寫入摘要合理。

失敗處理：停止後續 scheduled crawler，以保存的 raw snapshot做 replay；不要把 live fetch加入 automated tests。

## Raw snapshot cleanup

使用時機：檢查 30 天正常／90 天異常 snapshot保留規則。

Dry-run：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm ops:raw-snapshots:cleanup -- --storage-dir /var/lib/partsradar/snapshots
```

確認摘要與備份後刪除：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm ops:raw-snapshots:cleanup -- --confirm-delete --storage-dir /var/lib/partsradar/snapshots
```

成功標準：刪除數與 dry-run一致，沒有 retained reference 被移除，mutation lock 正常釋放。

失敗處理：lock busy時停止，不要刪 lock檔繞過。檔案與 metadata 不一致時先備份並調查 path allowlist。

## Product image backfill

使用時機：新主機、重建 product image volume、缺圖修復。必須使用專用 `image-cache-backfill` service；`crawler` 不掛載此 volume。

日常缺圖由 `image-cache-recovery-daemon` 限量輪替檢查並自動補回；失敗會記錄 HTTP 狀態或錯誤類型，並以來源 URL 共用 cooldown 與指數退避重試。價格 `crawler-daemon` 不等待圖片下載。此手動指令只用於首次部署、volume 重建或加速大量歷史缺檔修復。

Dry-run：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm image-cache-backfill \
  pnpm ops:image-cache:backfill -- --limit 20
```

確認後 live fetch：

圖片 HTTP request 使用獨立的 source-image-fetch lock；request 間 delay、轉檔與寫檔留在鎖外，不會阻塞價格分類抓取。大量手動補圖前應先停止 `image-cache-recovery-daemon`，避免兩個圖片工作互相等待。

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm image-cache-backfill \
  pnpm ops:image-cache:backfill -- --confirm-live-fetch --limit 20
```

成功標準：`failed=0`，cached／reused／skipped 計數合理，web 圖片 API 可讀新 WebP。

失敗處理：保留 delay、timeout、size 與 host/path allowlist；不要直接 hotlink 或在 web request 中下載來源圖片。

## Vendor metadata backfill

使用時機：品牌分類規則調整後重算既有商品。

Preview：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm ops:product-vendors:backfill -- --limit 100
```

確認後寫入：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm ops:product-vendors:backfill -- --confirm-write --limit 100
```

成功標準：Preview 與 write 的 selected／changed範圍一致；無法分類的商品維持明確 null，不自行猜測品牌。

## Product filter tag backfill

使用時機：首次導入 `filter_tags` 或調整 facet extraction規則後，重算既有商品。Production 必須在 migration完成且 product writers仍停止的 maintenance window執行。

先執行 dry-run：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm ops:product-filter-tags:backfill -- --dry-run
```

審查 JSON summary 的 `selected`、`changed`、`unchanged` 與各 category 的 `withoutTags`／`facetHits`；抽查明確否定「不含電源／未含電源」的機殼沒有 `included_psu:yes`。不得把 disposable fixture 的 changed count 當成 production預期值。

確認統計合理後才寫入：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  pnpm ops:product-filter-tags:backfill -- --confirm-write
```

完成後再次執行相同 dry-run。成功標準：第二次 summary 的 `changed=0`；若失敗或統計異常，停止 rollout且不要恢復 writers。

## Discord bot

使用時機：設定 token／application ID後註冊 commands並啟動 daemon。

註冊 commands：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  pnpm ops:discord-bot -- --register-commands
```

啟動：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot up -d
docker compose -f compose.yml -f compose.ops.yml logs --tail=100 discord-bot
```

成功標準：Commands bulk overwrite 成功、Gateway連線、`/bot help`可用；需要的 DM／channel權限另行實測。

失敗處理：確認 token/application ID、Discord API狀態與最小權限。不要記錄 raw token、provider response body或使用者私訊內容。

## Backup 與 restore 責任

使用時機：每次 production migration 前，以及固定營運週期。

備份工具、排程、儲存位置、加密、保留期限與離機副本由部署端依實際環境負責；repository 不提供或指定通用備份腳本。最低備份範圍包含 PostgreSQL 與 `product_images` storage；`snapshots` 依排障與稽核需求決定是否納入。

需要 DB 與 volumes 接近同一恢復點時，備份前應先暫停 crawler、image recovery、snapshot cleanup 與其他相關 writers。部署端必須在與 production 分離且 PostgreSQL major version 相容的環境完成還原驗證，確認備份完整性、DB 可還原、Prisma migration history 是 repository migration 的有效前綴、沒有 unresolved migration，且核心資料與納入備份的 storage 可讀取。

還原驗證不得覆寫 production DB 或 storage；驗證失敗或無法清理隔離資源時，部署判定為 NO-GO。

## Cloudflare Tunnel

使用時機：Private smoke通過且 edge設定已準備完成。

```bash
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel up -d cloudflared
docker compose -f compose.yml -f compose.tunnel.yml logs --tail=100 cloudflared
```

成功標準：使用已 pinned image與有效 token，public HTTPS路由指向 web，public-only smoke通過。

失敗處理：停止 cloudflared並維持 loopback web；不要把 web port直接綁定 public interface作為臨時繞過。

## Incident 與 rollback

1. 停止 public ingress與 external writers；需要時保留 web read-only供診斷。
2. 保存 service狀態、sanitized logs、migration history與必要 snapshot。
3. 若資料仍一致，修正或回退向後相容的 app image。
4. 若 DB受影響，先在隔離環境驗證部署前備份，再執行受控還原。
5. 重新啟動時依 web → private smoke → crawler／smoke／Discord → public ingress順序。

禁止使用 `git reset --hard`、刪除 volume、`prisma migrate reset` 或手動修改 `_prisma_migrations` 當作 production recovery。
