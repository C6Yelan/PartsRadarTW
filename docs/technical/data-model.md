# 資料模型

`packages/db/prisma/schema.prisma` 是實際 schema 來源。本文件只保留第一版資料模型的設計口徑、核心關聯與表格責任。

## 設計口徑

- PostgreSQL + Prisma。
- 內部關聯主鍵使用 UUID。
- Domain truth tables 保持接近 3NF；API 查詢便利欄位放在 read projection 或 join。
- 第一版只支援 CoolPC / 原價屋，不在核心表保存固定來源欄位。
- 分類脈絡集中於 `source_categories`，其他表用 `source_category_id` 關聯取得 `igrp` 與分類名稱。
- 商品唯一性為 `source_category_id + ibuy_token`。
- `source_item_key` 只由程式層計算，不存 DB。
- `current_prices` 只保存目前 price snapshot 指標，不重複保存價格、幣別或 captured time。
- Raw snapshot metadata 存 DB，原始 HTML gzip 存檔案。
- 網站只讀正式商品與目前價格，不公開 crawler debug data。
- 主要商品圖片屬於 product presentation data，由 crawler 驗證後寫入 product 欄位。

## 關聯總覽

```text
source_categories
  -> products
       -> price_snapshots
       -> current_prices -> price_snapshots
       -> product_link_health
       -> discord_target_price_watches
       -> discord_notification_deliveries
  -> raw_snapshots
  -> parse_errors
  -> crawl_run_category_results

discord_price_report_settings
discord_target_price_watches
  -> discord_notification_deliveries

crawl_runs
  -> crawl_run_category_results
  -> raw_snapshots
  -> price_snapshots
  -> parse_errors

product_list_view
  <- products + source_categories + current_prices + price_snapshots
```

## Core Tables

| Table | 責任 | 重要規則 |
| --- | --- | --- |
| `source_categories` | 第一版 CoolPC 分類主檔 | `igrp` 唯一；保存 `source_name`、`display_name`、enabled、最後檢查與成功時間。 |
| `products` | 商品主檔 | `source_category_id + ibuy_token` 唯一；保存名稱、vendor、主要圖片、來源頁、active / missing 狀態與 seen timestamps。 |
| `price_snapshots` | 價格歷史 | 新商品或價格變動才新增；長期保留；`raw_snapshot_id` nullable，避免 raw snapshot 清理破壞價格歷史。 |
| `current_prices` | 網站目前價格指標 | `product_id` 為主鍵；指向同商品的 `price_snapshots`；價格值從 snapshot 取得。 |
| `product_link_health` | 商品外部連結健康狀態 | 每商品每 link kind 一筆；保存目前 URL、狀態、HTTP status、檢查時間、最後成功 / 失敗時間與連續失敗次數。 |
| `discord_price_report_settings` | Discord 個人價格變動報告設定 | 每個 Discord user id 一筆；保存 interval、window、scope、timezone、max items、enabled 與下次/上次發送時間。 |
| `discord_target_price_watches` | Discord 個人目標價追蹤 | 以 Discord user id + product 建立目標價追蹤；不建立網站帳號；達標通知狀態由 watch 與 delivery log 控制。 |
| `discord_notification_deliveries` | Discord 通知發送紀錄 | 記錄手動 price report interaction 回覆、定期 price report 或 target price 通知的 kind、status、item count、message count、錯誤摘要與 delivery time；供去重、維運檢視與後續排程使用。 |
| `crawl_runs` | 整輪 crawler 摘要 | 保存 status、start / finish、trigger、error、backoff；不保存分類結果 JSON 或可推得的 count cache。 |
| `crawl_run_category_results` | 單分類 crawl 結果 | `crawl_run_id + source_category_id` 唯一；保存狀態、raw snapshot、error。 |
| `raw_snapshots` | fetch metadata | 保存 URL、fetch time、HTTP / content status、hash、gzip path、duplicate reference。 |
| `parse_errors` | 未進正式商品的解析 / validation 問題 | 保存分類、raw snapshot、錯誤類型、raw name / price / token；圖片錯誤可保存內部用 `raw_image_url`。 |

## `products`

核心欄位：

- `id`
- `source_category_id`
- `ibuy_token`
- `name`
- `normalized_name`
- `vendor_slug`
- `vendor_name`
- `primary_image_url`
- `primary_image_checked_at`
- `source_url`
- `is_active`
- `missing_since`
- `missing_seen_count`
- `first_seen_at`
- `last_seen_at`
- timestamps

規則：

- 沒有 `iBuyToken` 的候選商品不寫入。
- 商品名稱可更新，但不切斷商品歷史。
- 廠商欄位是查詢輔助資料，不是商品 identity；規則修正時可 backfill。
- 有效主圖是第一版資料契約；缺圖需記錄 validation issue，不靜默當 happy path。
- 成功 crawl 沒解析到有效圖片時，不清空既有圖片。
- 商品消失不刪除 product 或價格歷史；連續 6 次成功 crawl 都缺席才改 inactive。
- 同 identity 重新出現時恢復 active 並延續歷史。

## `price_snapshots` 與 `current_prices`

`price_snapshots` 保存：

- `product_id`
- `price`
- `currency`，第一版固定 `TWD`
- `captured_at`
- `crawl_run_id`
- nullable `raw_snapshot_id`

`current_prices` 保存：

- `product_id`
- `price_snapshot_id`
- `last_seen_at`
- `price_changed_at`
- `updated_at`

一致性規則：

- 價格、幣別與 captured time 永遠從 snapshot 取得。
- `current_prices(price_snapshot_id, product_id)` 應保證目前價格不會跨商品。
- 價格未變時不新增 snapshot，只更新必要的 seen time。
- fetch failed、suspected block、parse failed 不更新目前價格。

## `product_link_health`

`product_link_health` 保存：

- `product_id`
- `link_kind`：`source`
- `url`
- `status`：`ok`、`broken` 或 `temporary_error`
- nullable `http_status`
- `checked_at`
- nullable `last_ok_at`
- nullable `last_failure_at`
- `failure_count`
- nullable `error_message`

規則：

- link health 是 UI 提示與維運輔助，不是商品刪除或下架真相來源。
- link checker 不在使用者 request lifecycle 執行。
- 同一商品同一 link kind 只保留目前狀態；URL 改變時以新 URL 重算連續失敗次數。
- 單次失敗不應立即判定失效；404 / 410 需達到連續失敗門檻才標記 `broken`。
- `error_message` 只供內部維運，不公開到 API 或 UI。

## Discord Bot Notification Tables

Discord bot 只保存 Discord user id 與必要偏好，不建立網站帳號，也不把 Discord id 綁到網站使用者。手動 `/price-report now` 回覆在指令所在 Discord context；每日價格報告以 Discord user id 建立 DM 發送。

`discord_price_report_settings` 保存：

- `discord_user_id`
- `interval`：`daily`、`every_12h` 或 `every_6h`
- `window`：`24h`、`12h` 或 `6h`
- `scope`：`all` 或 `watchlist`
- `timezone`，第一輪固定 `Asia/Taipei`
- `max_items`
- `enabled`
- nullable `next_send_at` / `last_sent_at`

`discord_target_price_watches` 保存：

- `discord_user_id`
- `product_id`
- `target_price`
- `currency`
- `enabled`
- nullable `last_notified_at`
- `discord_user_id + product_id` 唯一，避免同一使用者對同一商品重複建立追蹤；再次 `/watch` 會更新目標價並重新啟用追蹤。

`discord_notification_deliveries` 保存：

- `discord_user_id`
- `kind`：`price_report_now`、`scheduled_price_report` 或 `target_price`
- `status`：`sent`、`skipped`、`failed` 或 `rate_limited`
- nullable `product_id`
- nullable `target_price_watch_id`
- nullable `dedupe_key`
- `item_count`
- `message_count`
- nullable `error_message`
- nullable `delivered_at`

規則：

- `/price-report now` 會寫入 delivery log，但不建立 price report setting。
- `/price-report settings` 的按鈕與 modal 讀寫 `discord_price_report_settings`；每日 DM 報告可在 modal 設定台北時間 `HH:mm`，下一次發送時間保存在 `next_send_at`。
- `/watch` 會讀寫 `discord_target_price_watches`，支援保存或更新單一商品目標價；`/watchlist` 讀取啟用中的追蹤；`/unwatch` 以選單與確認按鈕停用追蹤；目標價達標 DM worker 後續實作。
- `error_message` 只保存安全摘要，不保存 token、source URL、raw HTML、DB URL、internal headers 或 raw IP。

## Crawler State

`crawl_runs.status` 概念：

- `running`
- `success_changed`
- `success_unchanged`
- `success_with_errors`
- `fetch_failed`
- `suspected_block`
- `parse_failed`
- `skipped_overlap`
- `backoff`

`crawl_run_category_results.status` 概念：

- `success_changed`
- `success_unchanged`
- `fetch_failed`
- `suspected_block`
- `parse_failed`

分類結果是真相來源；整輪 summary 不反向覆寫分類資料。

## Raw Snapshot 與 Parse Errors

Raw snapshot：

- 每次 fetch 建立 metadata。
- gzip 以 content hash 去重。
- 一般保留 30 天，異常保留 90 天。
- 清理時只移除不再被保留 metadata 參照的檔案。

Parse error：

- 供內部 debug、來源驗證與 parser 修正。
- 不公開到 API 或 UI。
- `raw_image_url` 只用於 `invalid_image_url` 類問題。

## Read Projection

第一版提供普通 SQL view：

```text
product_list_view
```

用途：

- 給商品列表 API 使用接近 UI 的 read shape。
- 投影分類、`igrp`、目前價格、幣別、價格時間與主圖欄位。
- 可刪除後由 migration 重建。

規則：

- Crawler 不寫 view。
- `source_name` 在 view 中代表原價屋分類名稱，不是資料來源 enum。
- API 若需要資料來源名稱，第一版固定回傳 `coolpc`。
- 第一版不使用 materialized view；效能不足時再評估 refresh strategy 或 cache。

## Website Read Model

網站主要讀取：

- `product_list_view` 或等價 join。
- `source_categories`
- 站內商品圖片 API。

商品列表至少需要：

- product id、圖片 URL、商品名稱、分類、目前價格、幣別、價格確認時間、來源連結、active 狀態。

網站不直接讀：

- raw snapshots。
- parse errors。
- crawler internal error detail。
