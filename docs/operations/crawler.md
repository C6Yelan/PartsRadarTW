# Crawler operations

本文件收錄 crawler、snapshot cleanup、圖片修復與 metadata backfill。手動 cleanup 與 backfill 都先 preview／dry-run，再使用明確 confirmation flag。

## Scheduled crawler

使用時機：核心 web 與 DB 驗證完成後啟動價格更新。

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d
docker compose -f compose.yml -f compose.crawler.yml logs --tail=100 crawler-daemon image-cache-recovery-daemon raw-snapshot-cleanup-daemon
```

成功標準：Crawler 完成分類週期，沒有疑似阻擋或無限 backoff；圖片修復不占用價格 crawler 的 external-fetch lock；cleanup daemon 能取得正確 snapshot path。

遇到 suspected block、來源錯誤、external fetch lock 衝突、`crawl_run_lifecycle_failure` 或 `crawl_run_interrupted_reconciled` 時，先停止 crawler-daemon，保存 snapshot 與 sanitized log，再用 offline raw replay 分析。不要提高並行或移除 request delay 硬試。

CoolPC filter sync 失敗會保留上一版可用狀態並透過 full smoke／Discord 管理告警回報，不會阻止一般價格 crawl；週期與 state path 以 [`.env.example`](../../.env.example) 及 Compose 設定為準。

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
  node --import tsx src/scripts/manual/crawl-coolpc-once.ts --confirm-live-fetch --storage-dir /var/lib/partsradar/snapshots
```

成功標準：每個啟用分類有明確結果，沒有 suspected block，商品／價格寫入摘要合理。

失敗處理：停止後續 scheduled crawler，以保存的 raw snapshot 做 replay；不要把 live fetch 加入 automated tests。

## Raw snapshot cleanup

使用時機：檢查 30 天正常／90 天異常 snapshot 保留規則。

Dry-run：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  node --import tsx src/scripts/ops/cleanup-raw-snapshots.ts --storage-dir /var/lib/partsradar/snapshots
```

確認摘要與備份後刪除：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  node --import tsx src/scripts/ops/cleanup-raw-snapshots.ts --confirm-delete --storage-dir /var/lib/partsradar/snapshots
```

成功標準：刪除數與 dry-run 一致，沒有 retained reference 被移除，mutation lock 正常釋放。

失敗處理：lock busy 時停止，不要刪 lock 檔繞過。檔案與 metadata 不一致時先備份並調查 path allowlist。

## Product image backfill

使用時機：新主機、重建 product image volume 或加速大量缺圖修復。日常缺圖由 `image-cache-recovery-daemon` 自動限量補回；價格 crawler 不等待圖片下載。

必須使用掛載 product image volume 的 `image-cache-backfill` service。大量手動補圖前先停止 `image-cache-recovery-daemon`，避免兩個圖片工作互相等待。

Dry-run：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm image-cache-backfill \
  node --import tsx src/scripts/ops/backfill-product-images.ts --limit 20
```

確認後 live fetch：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm image-cache-backfill \
  node --import tsx src/scripts/ops/backfill-product-images.ts --confirm-live-fetch --limit 20
```

成功標準：`failed=0`，cached／reused／skipped 計數合理，web 圖片 API 可讀新 WebP。

失敗處理：保留 delay、timeout、size 與 host/path allowlist；不要直接 hotlink 或在 web request 中下載來源圖片。

## Vendor metadata backfill

使用時機：品牌分類規則調整後重算既有商品。

Preview：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  node --import tsx src/scripts/ops/backfill-product-vendors.ts --limit 100
```

確認後寫入：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  node --import tsx src/scripts/ops/backfill-product-vendors.ts --confirm-write --limit 100
```

成功標準：Preview 與 write 的 selected／changed 範圍一致；無法分類的商品維持明確 null，不自行猜測品牌。

## Product filter tag backfill

使用時機：首次導入 `filter_tags` 或調整 facet extraction 規則後重算既有商品。Production 必須在 migration 完成且 product writers 仍停止的 maintenance window 執行。

Dry-run：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  node --import tsx src/scripts/ops/backfill-product-filter-tags.ts --dry-run
```

審查 JSON summary 的 `selected`、`changed`、`unchanged` 與各 category 的 `withoutTags`／`facetHits`；抽查明確否定「不含電源／未含電源」的機殼沒有 `included_psu:yes`。

確認後寫入：

```bash
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler run --rm crawler \
  node --import tsx src/scripts/ops/backfill-product-filter-tags.ts --confirm-write
```

完成後再次執行 dry-run。成功標準：第二次 summary 的 `changed=0`；失敗或統計異常時停止 rollout 且不要恢復 writers。
