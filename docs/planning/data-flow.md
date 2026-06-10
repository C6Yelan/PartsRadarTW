# 資料流設計

本文件描述 CoolPC 資料從來源頁進入網站的狀態轉換。資料表欄位細節見 [資料模型](../technical/data-model.md)，crawler 行為細節見 [Crawler 設計](../technical/crawler-design.md)。

## 目標

- 網站只顯示已成功處理的有效資料。
- HTTP 200 但內容異常時，不更新正式商品與價格。
- 價格歷史可追溯，未變價格不重複寫入 snapshot。
- raw snapshot 可追查、去重、保留期限明確，且清理不影響價格歷史。
- 第一版只支援 CoolPC / 原價屋；DB 不保存固定值 `source = coolpc`。

## 資料範圍

目前啟用分類：

| 類別 | IGrp |
| --- | ---: |
| CPU | 4 |
| 主機板 | 5 |
| 記憶體 | 6 |
| SSD / HDD | 7 |
| 外接儲存 | 8 |
| 散熱器 | 10 |
| 水冷 | 11 |
| 顯示卡 | 12 |
| 機殼 | 14 |
| 電源供應器 | 15 |
| 風扇 / 配件 | 16 |

第一版只啟用組電腦核心分類；第二版第一輪新增外接儲存 `8`、水冷 `11`、風扇 / 配件 `16`。其他原價屋分類仍需重新盤點與驗證後才可啟用。

第二版可繼續重新盤點並擴充第一版以外的原價屋分類。新增分類必須先通過 manual live validation、raw snapshot replay、parser validation、圖片 URL 驗證與 link health 驗證，不應未驗證就一次全開所有 IGrp。

## 流程總覽

```text
source_categories
  -> crawler fetch eachview.php?IGrp={igrp}
  -> raw_snapshots metadata + compressed HTML
  -> response content validation
  -> parser
  -> parsed item validation
  -> products / price_snapshots / current_prices
  -> product_list_view or equivalent join
  -> API
  -> Web UI
```

## Truth Tables 與 Projection

Domain truth tables：

- `source_categories`
- `products`
- `price_snapshots`
- `current_prices`
- `crawl_runs`
- `crawl_run_category_results`
- `raw_snapshots`
- `parse_errors`

Read projection：

- `product_list_view`

Projection 只服務 API / UI 查詢，可由核心表重建；crawler 不寫 projection。

## Raw Snapshot

每次 fetch 都要建立 raw snapshot metadata，無論成功、fetch failed、suspected block 或 parse failed。

保存內容：

- `source_category_id`
- URL、fetch time、HTTP status 或 fetch error
- content status
- raw content hash、parsed result hash
- compressed HTML path
- duplicate snapshot reference
- `crawl_run_id`

規則：

- 原始 HTML 壓縮保存到檔案，metadata 存 DB。
- raw content hash 相同時不重複保存 gzip。
- 一般 snapshot 最長保留 30 天，異常 snapshot 最長保留 90 天。
- 清理 raw snapshot 不得刪除 `price_snapshots`；長期資料需使用 nullable reference 或等效策略。

## Response Content Validation

進 parser 前必須確認內容仍像 CoolPC 分類頁。

有效條件：

- title 包含預期分類名稱或可接受關鍵字。
- 存在 `div.w`、`div.t`、`div.x`。
- 至少解析到一筆具 token、名稱與價格的商品。

validation 失敗時：

- 標記 `suspected_block` 或 `invalid`。
- 不進 product upsert、price snapshot 或 current price 更新。
- 保留 raw snapshot 與錯誤資訊供人工檢查。

## Parsed Item

parser 對每筆候選商品輸出：

- `sourceCategoryId`
- `igrp`，只作輸入脈絡與 computed key，不寫入 product / raw snapshot / parse error。
- 原價屋分類名稱。
- `iBuyToken`
- computed `source_item_key`
- 原始商品名稱與 normalized name。
- 主要商品圖片 URL。
- 價格與 `TWD`。
- source page URL。
- fetched time。

computed key 格式：

```text
coolpc:igrp:{IGrp}:ibuy:{iBuyToken}
```

此 key 不存 DB；正式商品唯一性使用 `source_category_id + ibuy_token`。

## Parsed Item Validation

候選商品需滿足：

- `iBuyToken` 不空。
- 商品名稱不空。
- 價格是大於 0 的整數。
- 主要圖片 URL 可正規化並通過 CoolPC allowlist。
- 同一分類同一 snapshot 內沒有相同 token 對應不同商品名稱或價格。

不合格候選：

- 不寫入正式商品與價格。
- 寫入 `parse_errors`，必要時保存內部 debug 用 `raw_image_url`。
- 不把 raw HTML、raw image URL 或 validation detail 暴露給公開 API。

完全重複列若 token、名稱與價格都相同，可去重保留一筆。

## Product 與 Price 更新

商品 identity：

- `source_category_id + ibuy_token`

新商品：

- upsert `products`
- 建立第一筆 `price_snapshots`
- 建立 `current_prices`

價格變動：

- 新增 `price_snapshots`
- 更新 `current_prices.price_snapshot_id`
- 更新 `price_changed_at` 與 `last_seen_at`

價格未變：

- 不新增重複 `price_snapshots`
- 可更新 `current_prices.last_seen_at`
- 分類仍可記為成功檢查

商品從來源消失：

- 不刪 product，不刪 price snapshots。
- 先記錄 `missing_since` / `missing_seen_count`。
- 連續 6 次成功 crawl 都未看到同一商品才改為 inactive。
- 相同 identity 重新出現時恢復 active 並延續歷史。

## Crawl Run 狀態

分類層級結果寫入 `crawl_run_category_results`：

- `success_changed`
- `success_unchanged`
- `fetch_failed`
- `suspected_block`
- `parse_failed`

整輪 `crawl_runs` 摘要：

- 全部成功且有變更：`success_changed`
- 全部成功且未變：`success_unchanged`
- 成功與失敗混合：`success_with_errors`
- 疑似攔截：`suspected_block`
- 沒有任何分類成功：對應失敗狀態

`crawl_runs` 不保存可由分類結果推得的 summary cache，例如 checked count、changed count 或 error category key。

## 失敗處理

Fetch failed：

- 寫 raw snapshot metadata 或 fetch error。
- 更新分類 `last_checked_at`。
- 不更新 `last_success_at`、product、price 或 current price。
- 可繼續下一分類。

Suspected block：

- 標記 snapshot。
- 更新分類 `last_checked_at`。
- 停止當輪 crawl。
- 不更新正式商品與價格。
- 進入 backoff 規則。

Parse failed：

- 保存 raw snapshot 與 parse error。
- 更新分類 `last_checked_at`。
- 不更新 `last_success_at`。
- 不累計 missing count。
- 可繼續下一分類。

## API / Web 讀取口徑

網站讀取：

- `product_list_view` 或等價 join。
- `source_categories`。
- 站內商品圖片 API。

網站不直接讀取：

- raw snapshots。
- parse errors。
- crawler internal error detail。

使用者看到的來源狀態只描述 crawler / parser / source data sync，不代表商品是否可購買。
