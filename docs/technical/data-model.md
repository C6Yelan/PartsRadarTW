# 資料模型

本文件定義 PartsRadarTW 第一版的概念資料模型。實作使用 PostgreSQL 與 Prisma；`packages/db/prisma/schema.prisma` 是實際 schema 來源。

## 設計原則

- 以內部 UUID 作為資料表關聯主鍵。
- Domain Truth tables 是 crawler 寫入與資料一致性的真相來源，必須盡量符合 3NF。
- Read Projection / View 可為 API / UI 查詢效能與 read shape 服務，可反正規化，但不可作為 crawler 寫入真相來源。
- Projection 必須可由核心資料表重建；刪除 projection 不應造成資料遺失。
- 第一版先使用普通 SQL view，不使用 materialized view 或 cache；若未來普通 view 效能不足，再評估 materialized view 或同步 cache。
- 第一版只支援原價屋 CoolPC，不在核心 DB 預留多來源抽象欄位；API 若需要來源名稱，可固定回傳 `coolpc`。
- 原價屋分類脈絡集中在 `source_categories`；`products`、`raw_snapshots`、`parse_errors` 透過 `source_category_id` 取得 `igrp` 與分類名稱，不重複保存。
- 商品唯一性使用 `source_category_id + ibuy_token`。`source_item_key` 是 crawler / shared helper 可計算的來源識別字串，不存入 DB。
- 價格歷史保存在 `price_snapshots`。
- `current_prices` 只保存目前 `price_snapshot` 指標與狀態時間，不重複保存價格、幣別或 captured time。
- 新商品或價格變動時才新增 price snapshot。
- 資料未變時記錄成功檢查，但不新增重複價格歷史。
- raw snapshot metadata 存資料庫，原始 HTML 壓縮檔存檔案。
- raw snapshot 以內容 hash 去重，避免浪費硬碟空間。
- 網站只讀取正式商品與目前價格；crawler / debug 資料不直接暴露給使用者。
- 商品主要圖片屬於 product presentation data，第一版需從可信來源解析結果保存，不由 projection 或使用者輸入產生。

## 關聯總覽

```text
source_categories
  -> products
       -> price_snapshots
       -> current_prices -> price_snapshots
  -> raw_snapshots
  -> parse_errors
  -> crawl_run_category_results

crawl_runs
  -> crawl_run_category_results
  -> raw_snapshots
  -> price_snapshots
  -> parse_errors

product_list_view
  <- products + source_categories + current_prices + price_snapshots
```

## Domain Truth Tables

核心真相資料表：

- `source_categories`
- `products`
- `price_snapshots`
- `current_prices`
- `crawl_runs`
- `crawl_run_category_results`
- `raw_snapshots`
- `parse_errors`

這些表不為 API 查詢方便加入可由關聯推出的欄位：

- `products` 不保存 `source`、`igrp` 或 `source_item_key`。
- `raw_snapshots` 不保存 `source` 或 `igrp`。
- `parse_errors` 不保存 `source` 或 `igrp`。
- `current_prices` 不保存 `price`、`currency` 或 `captured_at`。
- `crawl_runs` 不保存 `category_results` JSONB。
- `crawl_runs` 不保存可由 `crawl_run_category_results` 推得的分類計數或單一錯誤分類 key。

## Read Projections

Read projection 是 API / UI 查詢用投影，不是 crawler 寫入真相來源。

第一版 migration 建立普通 SQL view：

```text
product_list_view
```

用途：

- 給未來商品列表 API 使用較接近 UI 的 read shape。
- 將分類名稱、`igrp`、目前價格、幣別與價格時間投影在同一個查詢來源。
- 避免把這些查詢便利欄位塞回核心資料表。

來源表：

- `products`
- `source_categories`
- `current_prices`
- `price_snapshots`

投影欄位：

- `product_id`
- `product_name`
- `normalized_name`
- `category_display_name`
- `source_name`
- `igrp`
- `current_price`
- `currency`
- `price_captured_at`
- `last_seen_at`
- `is_active`
- `source_url`
- `primary_image_url`
- `primary_image_checked_at`

規則：

- Crawler 不寫入 `product_list_view`。
- API 可讀取 `product_list_view`，也可直接 join 核心表。
- `product_list_view` 可投影主要商品圖片欄位，但圖片資料真相來源仍是核心 product 資料。
- `source_name` 在 view 中代表原價屋分類名稱，不是資料來源名稱。
- 若 API 需要資料來源名稱，第一版固定回傳 `coolpc`，不從 DB 欄位讀取。
- `product_list_view` 可刪除後由 migration 或 SQL 定義重建。
- 第一版不建立 materialized view；只有實際查詢效能不足時才評估 materialized view、refresh 策略或 cache。

## source_categories

記錄第一版支援的原價屋分類。

用途：

- 管理 crawler 要抓取的 `IGrp`。
- 作為其他資料表取得原價屋分類資訊的唯一分類主檔。
- 讓網站可以列出分類。
- 保存分類層級的最後檢查時間與最後成功時間。

概念欄位：

- `id`：內部 UUID。
- `igrp`：原價屋分類編號，唯一外部分類鍵。
- `source_name`：原價屋分類名稱，例如 `處理器 CPU`。
- `display_name`：PartsRadarTW 顯示名稱，例如 `CPU`。
- `enabled`。
- `last_checked_at`。
- `last_success_at`。
- `created_at`。
- `updated_at`。

唯一性：

- `igrp` 唯一。

注意：

- `source_name` 是原價屋分類名稱，不是資料來源 enum。
- DB 不保存 `source` 或 `source_category_key`；第一版所有資料都來自原價屋。

## products

商品主檔，代表同一個原價屋商品。

用途：

- 保存商品基本資料。
- 作為價格、目前價格與網站查詢的主體。
- 用內部 UUID 提供穩定 API id。

概念欄位：

- `id`：內部 UUID。
- `source_category_id`。
- `ibuy_token`。
- `name`：商品原始名稱。
- `normalized_name`。
- `primary_image_url`：主要商品圖片 URL，來自經驗證與正規化的原價屋公開頁面圖片。
- `primary_image_checked_at`：主要商品圖片最後一次被來源資料確認的時間。
- `source_url`：不包含 `PHPSESSID` 的來源分類頁 URL。
- `is_active`。
- `missing_since`。
- `missing_seen_count`。
- `first_seen_at`。
- `last_seen_at`。
- `created_at`。
- `updated_at`。

唯一性：

- `source_category_id + ibuy_token` 唯一。

規則：

- 沒有 `iBuyToken` 的商品不寫入 `products`。
- 商品名稱可更新，但不應造成商品歷史斷裂。
- `source_item_key` 不存 DB；需要時由 `sourceCategory.igrp + ibuy_token` 在程式層組成，例如 `coolpc:igrp:4:ibuy:{iBuyToken}`。
- 商品識別不應使用價格、商品名稱或 `PHPSESSID`。
- 商品主要圖片是第一版顯示所需資料；缺圖應被視為資料完整性問題或來源驗證風險，不是正常匯入 happy path。
- 圖片 URL 必須來自 crawler 對可信來源 HTML 的解析結果，不接受使用者任意輸入 URL。
- 若某次成功 crawl 沒有解析到有效圖片 URL，不應靜默清空既有主要圖片；應記錄 validation issue 並保留可追查資訊。
- 商品從來源消失時，不刪除 product，也不刪除價格歷史。
- 商品消失應先記錄 `missing_since` 或累計 `missing_seen_count`，避免單次頁面異常造成誤判。
- 連續 6 次成功 crawl 都未看到同一商品時，才將 `is_active` 改為 false。
- 若商品未來以相同 `source_category_id + ibuy_token` 重新出現，應恢復 `is_active = true` 並延續原價格歷史。

### 商品圖片設計方向

第一版只需要每個 product 一張主要商品圖片，因此以 `products` 上的 primary image 欄位作為設計方向最符合目前需求：商品身份、名稱與主要展示圖片同屬 product presentation data，且第一版不處理多圖、圖片快取或圖片版本管理。

若未來需要多張圖片、圖片快取、server-side image proxy、圖片驗證歷史或不同來源圖片變更紀錄，應另行建立 `product_images` 或 `product_assets` 類型資料表。該擴充不應把圖片真相來源塞進 `product_list_view`；projection 只能讀取核心圖片資料，不應成為圖片資料的真相來源。

目前 repo 的 Prisma schema 尚未實作上述欄位。本文件先定義第一版資料需求；實作時需另行建立 migration 與測試。

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
- `raw_snapshot_id`，可為空。
- `created_at`。

規則：

- 新商品第一次看到價格時寫入。
- 價格變動時寫入。
- 價格未變時不新增重複 price snapshot。
- price snapshot 第一版長期保留，不套用 raw snapshot 的 30 / 90 天保存期限。
- `raw_snapshot_id` 使用 nullable reference，避免 raw snapshot metadata 清理時刪除價格歷史。
- `id + product_id` 有唯一約束，讓 `current_prices` 可用 composite foreign key 保證目前價格指標沒有跨商品。

建議索引：

- `product_id + captured_at`。
- `crawl_run_id`。
- `raw_snapshot_id`。

## current_prices

網站目前價格讀取口徑。

用途：

- 讓商品列表、搜尋與詳細頁可以快速取得最新有效價格。
- 與價格歷史分離，避免網站查詢每次都掃 price snapshots。

概念欄位：

- `product_id`：同時作為主鍵與外鍵。
- `price_snapshot_id`：目前價格對應的 price snapshot。
- `last_seen_at`。
- `price_changed_at`。
- `updated_at`。

規則：

- 價格、幣別與 `captured_at` 一律從 `price_snapshots` 透過 `price_snapshot_id` 取得。
- `price_snapshot_id` 唯一，避免同一筆 price snapshot 被多個 current price 共用。
- `current_prices(price_snapshot_id, product_id)` 外鍵指向 `price_snapshots(id, product_id)`，避免目前價格指標跨商品。
- 新商品或價格變動時更新。
- 價格未變時可只更新 `last_seen_at`。
- 抓取失敗、疑似攔截或解析異常時不更新。

## crawl_runs

記錄每一輪 crawler 執行。

用途：

- 追蹤 crawler 是否成功。
- 記錄 unchanged、失敗、攔截與 backoff 狀態。
- 支援未來管理通知與除錯。
- 作為整輪 crawl cycle 的摘要。

概念欄位：

- `id`：內部 UUID。
- `status`。
- `started_at`。
- `finished_at`。
- `trigger_type`：例如 scheduled、manual。
- `error_message`。
- `backoff_until`。
- `created_at`。

不保存的 summary / cache：

- `checked_category_count`：由 `crawl_run_category_results` count 推得。
- `changed_category_count`：由 `crawl_run_category_results.status = success_changed` count 推得。
- `error_category_key`：由失敗分類結果 join `source_categories.igrp` 或 `source_categories.source_name` 推得。

這些欄位不放在 `crawl_runs`，避免 crawler 需要同步維護 summary cache。若未來因查詢效能需要 summary cache，必須明確標示真相來源是 `crawl_run_category_results`，並補一致性測試。

第一版所有 crawl run 都是原價屋 CoolPC；DB 不保存 `source` 欄位。API 或 log 若需要來源名稱，可在程式層固定使用 `coolpc`。

第一版狀態概念：

- `running`。
- `success_changed`。
- `success_unchanged`。
- `success_with_errors`。
- `fetch_failed`。
- `suspected_block`。
- `parse_failed`。
- `skipped_overlap`。
- `backoff`。

## crawl_run_category_results

每筆代表某一輪 crawl 對某一個分類的結果。這張表取代原本規劃的 `crawl_runs.category_results` JSONB。

用途：

- 支援多分類 crawl 的部分成功狀態。
- 區分單一分類 fetch failed / parse failed 與整輪 suspected block。
- 作為更新 `source_categories.last_checked_at` / `last_success_at` 的依據。
- 支援後續依分類查詢歷史成功率、管理介面或告警統計。

概念欄位：

- `id`：內部 UUID。
- `crawl_run_id`。
- `source_category_id`。
- `status`。
- `raw_snapshot_id`，可為空。
- `error_message`，可為空。
- `created_at`。

狀態：

- `success_changed`。
- `success_unchanged`。
- `fetch_failed`。
- `suspected_block`。
- `parse_failed`。

唯一性與索引：

- `crawl_run_id + source_category_id` 唯一。
- 索引 `crawl_run_id`。
- 索引 `source_category_id`。
- 索引 `raw_snapshot_id`。

規則：

- 任一分類被實際嘗試處理時，都可更新該分類的 `last_checked_at`。
- 分類 fetch failed 或 parse failed 不更新該分類的 `last_success_at`。
- 分類成功但資料未變時仍需更新該分類的 `last_success_at`。
- parse failed 不應累計該分類商品的 missing count。

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
- `source_category_id`。
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
- `igrp` 不重複保存，透過 `source_category_id -> source_categories` 取得。
- `content_hash` 相同時，不重複保存原始 HTML 壓縮檔。
- 重複內容可透過 `duplicate_of_snapshot_id` 指向既有 snapshot。
- 一般 snapshot 最長保留 30 天。
- 異常 snapshot 最長保留 90 天。
- raw snapshot retention 只適用於原始 HTML 與 snapshot metadata 清理策略，不影響 `price_snapshots`。
- 清理 raw snapshot metadata 時，參照它的長期資料需使用 nullable reference 或等效策略，不可因外鍵刪除價格歷史。

建議索引：

- `source_category_id + fetched_at`。
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
- `raw_snapshot_id`，可為空。
- `source_category_id`。
- `error_type`。
- `message`。
- `raw_name`。
- `raw_price_text`。
- `raw_token`。
- `created_at`。

規則：

- `igrp` 不重複保存，透過 `source_category_id -> source_categories` 取得。
- `raw_snapshot_id` 可為空，但分類資訊必須由 `source_category_id` 保存。

使用情境：

- 缺少 `iBuyToken`。
- 缺少商品名稱。
- 價格無法解析。
- 來源商品識別衝突，例如同一分類同一 snapshot 內相同 `iBuyToken` / computed `source_item_key` 對應不同商品名稱或價格。相同商品名稱與價格的完全重複列可由 parser 去重，不需寫入 `parse_errors`。
- response content validation 失敗。

## Website Read Model

網站第一版主要讀取：

- `product_list_view`，或等價的 `products + current_prices + price_snapshots + source_categories` join。
- `source_categories`

網站不直接讀取：

- `raw_snapshots`
- `parse_errors`
- crawler 內部錯誤細節

商品列表至少需要：

- product id。
- 主要商品圖片 URL 與替代文字。
- 商品名稱。
- 原價屋分類。
- 目前價格。
- 幣別。
- 資料更新時間。
- 原價屋來源連結。

價格、幣別與 `captured_at` 需從 `current_prices.price_snapshot_id -> price_snapshots` 取得。
若使用 `product_list_view`，這些欄位是從核心表投影出來的 read shape，不是新的真相來源。

## Crawler Write Model

Crawler 主要寫入：

- `crawl_runs`
- `crawl_run_category_results`
- `raw_snapshots`
- `products`
- `price_snapshots`
- `current_prices`
- `parse_errors`
- `source_categories.last_checked_at`
- `source_categories.last_success_at`

Crawler 不應直接刪除既有正式商品資料。

商品未出現在來源頁或可能下架時：

- 不刪除 product。
- 不刪除 price snapshots。
- 先記錄 missing 狀態。
- 連續 6 次成功 crawl 都未看到同一商品時，再改為 inactive。
- 商品重新出現且 `source_category_id + ibuy_token` 相同時，恢復 active 並延續原歷史。
