# 資料模型

本文件定義 PartsRadarTW 第一版的概念資料模型。實作時會使用 PostgreSQL 與 Prisma；本文件先描述資料表責任、主要欄位、關聯與唯一性規則，不直接等同最終 Prisma schema。

## 設計原則

- 以內部 UUID 作為資料表關聯主鍵。
- 以 `source_item_key` 判斷同一個原價屋商品。
- 價格歷史與目前價格分開保存。
- 新商品或價格變動時才新增 price snapshot。
- price snapshot 屬於長期資料，不套用 raw snapshot 的 30 / 90 天保存期限。
- 資料未變時記錄成功檢查，但不新增重複價格歷史。
- raw snapshot metadata 存資料庫，原始 HTML 壓縮檔存檔案。
- raw snapshot 以內容 hash 去重，避免浪費硬碟空間。
- 網站只讀取正式商品與目前價格；crawler / debug 資料不直接暴露給使用者。

## 關聯總覽

```text
source_categories
  -> products
       -> current_prices
       -> price_snapshots
       -> current_prices.price_snapshot_id -> price_snapshots.id

crawl_runs
  -> raw_snapshots
  -> price_snapshots
  -> parse_errors
```

## source_categories

記錄第一版支援的原價屋分類。

用途：

- 管理 crawler 要抓取的 `IGrp`。
- 讓網站可以列出分類。
- 保存分類層級的最後檢查時間。

概念欄位：

- `id`：內部 UUID。
- `source`：固定為 `coolpc`。
- `source_category_key`：例如 `igrp:4`。
- `igrp`：原價屋分類編號。
- `name`：原價屋分類名稱。
- `enabled`。
- `last_checked_at`。
- `last_success_at`。
- `created_at`。
- `updated_at`。

唯一性：

- `source + source_category_key` 唯一。
- `source + igrp` 唯一。

## products

商品主檔，代表同一個原價屋商品。

用途：

- 保存商品基本資料。
- 作為價格、目前價格與網站查詢的主體。
- 用內部 UUID 提供穩定 API id。

概念欄位：

- `id`：內部 UUID。
- `source`：固定為 `coolpc`。
- `source_item_key`：例如 `coolpc:igrp:4:ibuy:{iBuyToken}`。
- `source_category_id`。
- `igrp`。
- `ibuy_token`。
- `name`：商品原始名稱。
- `normalized_name`。
- `source_url`：不包含 `PHPSESSID` 的來源分類頁 URL。
- `is_active`。
- `missing_since`。
- `missing_seen_count`。
- `first_seen_at`。
- `last_seen_at`。
- `created_at`。
- `updated_at`。

唯一性：

- `source + source_item_key` 唯一。

規則：

- 沒有 `iBuyToken` 的商品不寫入 `products`。
- 商品名稱可更新，但不應造成商品歷史斷裂。
- `source_item_key` 不應使用價格、商品名稱或 `PHPSESSID`。
- 商品從來源消失時，不刪除 product，也不刪除價格歷史。
- 商品消失應先記錄 `missing_since` 或累計 `missing_seen_count`，避免單次頁面異常造成誤判。
- 連續 6 次成功 crawl 都未看到同一商品時，才將 `is_active` 改為 false。
- 若商品未來以相同 `source_item_key` 重新出現，應恢復 `is_active = true` 並延續原價格歷史。

## price_snapshots

價格歷史紀錄。

用途：

- 保存價格第一次出現與每次價格變動。
- 支援未來價格歷史圖表與提醒功能。
- 保留價格變動可追溯性。

概念欄位：

- `id`：內部 UUID。
- `product_id`。
- `price`。
- `currency`：第一版固定 `TWD`。
- `captured_at`。
- `crawl_run_id`。
- `raw_snapshot_id`。
- `created_at`。

規則：

- 新商品第一次看到價格時寫入。
- 價格變動時寫入。
- 價格未變時不新增重複 price snapshot。
- price snapshot 第一版長期保留，不套用 raw snapshot 的 30 / 90 天保存期限。
- 若未來資料量過大，再另行規劃價格歷史彙總或封存策略。

建議索引：

- `product_id + captured_at`。
- `crawl_run_id`。

## current_prices

網站目前價格讀取口徑。

用途：

- 讓商品列表、搜尋與詳細頁可以快速取得最新有效價格。
- 與價格歷史分離，避免網站查詢每次都掃 price snapshots。

概念欄位：

- `product_id`：同時作為主鍵與外鍵。
- `price`。
- `currency`：第一版固定 `TWD`。
- `captured_at`：目前價格對應的 price snapshot 時間。
- `price_snapshot_id`。
- `last_seen_at`。
- `price_changed_at`。
- `updated_at`。

規則：

- 新商品或價格變動時更新。
- 價格未變時可只更新 `last_seen_at`。
- 抓取失敗、疑似攔截或解析異常時不更新。

## crawl_runs

記錄每一輪 crawler 執行。

用途：

- 追蹤 crawler 是否成功。
- 記錄 unchanged、失敗、攔截與 backoff 狀態。
- 支援未來管理通知與除錯。

概念欄位：

- `id`：內部 UUID。
- `source`：固定為 `coolpc`。
- `status`。
- `started_at`。
- `finished_at`。
- `trigger_type`：例如 scheduled、manual。
- `checked_category_count`。
- `changed_category_count`。
- `error_category_key`。
- `error_message`。
- `backoff_until`。
- `created_at`。

第一版狀態概念：

- `running`。
- `success_changed`。
- `success_unchanged`。
- `fetch_failed`。
- `suspected_block`。
- `parse_failed`。
- `skipped_overlap`。
- `backoff`。

## raw_snapshots

記錄每次 fetch 的 raw snapshot metadata。

用途：

- 追查原價屋頁面內容。
- 支援 parser 修正後重跑。
- 保存疑似攔截或解析失敗的證據。
- 透過內容 hash 避免重複保存相同 HTML。

概念欄位：

- `id`：內部 UUID。
- `crawl_run_id`。
- `source`：固定為 `coolpc`。
- `source_category_id`。
- `igrp`。
- `url`。
- `fetched_at`。
- `http_status`。
- `fetch_error`。
- `content_status`：例如 valid、suspected_block、invalid。
- `content_hash`。
- `parsed_result_hash`。
- `compressed_html_path`。
- `duplicate_of_snapshot_id`。
- `created_at`。

規則：

- 每次 fetch 都要建立 metadata。
- `content_hash` 相同時，不重複保存原始 HTML 壓縮檔。
- 重複內容可透過 `duplicate_of_snapshot_id` 指向既有 snapshot。
- 一般 snapshot 最長保留 30 天。
- 異常 snapshot 最長保留 90 天。
- raw snapshot retention 只適用於原始 HTML 與 snapshot metadata 清理策略，不影響 `price_snapshots`。

建議索引：

- `source + igrp + fetched_at`。
- `content_hash`。
- `crawl_run_id`。

## parse_errors

記錄 parser、validation 或資料匯入前的異常。

用途：

- 保存未匯入正式商品的原因。
- 支援後續人工檢查。
- 支援 parser 修正後重跑。

概念欄位：

- `id`：內部 UUID。
- `crawl_run_id`。
- `raw_snapshot_id`。
- `source`。
- `igrp`。
- `error_type`。
- `message`。
- `raw_name`。
- `raw_price_text`。
- `raw_token`。
- `created_at`。

使用情境：

- 缺少 `iBuyToken`。
- 缺少商品名稱。
- 價格無法解析。
- 同一分類同一 snapshot 內出現重複 `source_item_key`。
- response content validation 失敗。

## Website Read Model

網站第一版主要讀取：

- `products`
- `current_prices`
- `source_categories`

網站不直接讀取：

- `raw_snapshots`
- `parse_errors`
- crawler 內部錯誤細節

商品列表至少需要：

- product id。
- 商品名稱。
- 原價屋分類。
- 目前價格。
- 幣別。
- 資料更新時間。
- 原價屋來源連結。

## Crawler Write Model

Crawler 主要寫入：

- `crawl_runs`
- `raw_snapshots`
- `products`
- `price_snapshots`
- `current_prices`
- `parse_errors`
- `source_categories.last_checked_at`

Crawler 不應直接刪除既有正式商品資料。

商品消失、停賣或下架時：

- 不刪除 product。
- 不刪除 price snapshots。
- 先記錄 missing 狀態。
- 連續 6 次成功 crawl 都未看到同一商品時，再改為 inactive。
- 商品重新出現且 `source_item_key` 相同時，恢復 active 並延續原歷史。
