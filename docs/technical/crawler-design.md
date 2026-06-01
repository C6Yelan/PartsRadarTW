# Crawler 設計

第一版 crawler 是獨立 Node.js / TypeScript process。資料表欄位見 [資料模型](data-model.md)，狀態轉換見 [資料流設計](../planning/data-flow.md)。

## 來源與分類

Crawler 只抓 CoolPC 分類總覽頁：

```text
https://www.coolpc.com.tw/eachview.php?IGrp={分類編號}
```

第一版分類：

| 類別 | IGrp |
| --- | ---: |
| CPU | 4 |
| 主機板 | 5 |
| 記憶體 | 6 |
| SSD / HDD | 7 |
| 散熱器 | 10 |
| 顯示卡 | 12 |
| 機殼 | 14 |
| 電源供應器 | 15 |

不抓 `evaluate.php` 作為商品資料來源；詳細頁導流只由 API / UI 使用。

## 執行規則

- 每 5 分鐘檢查是否可啟動下一輪。
- 上一輪尚未完成時不重疊啟動。
- 每輪依第一版分類逐一抓取。
- 單分類 fetch / parse failed 可記錄後繼續下一分類。
- 疑似被攔截時立即停止當輪。
- 連續失敗進入 1 小時 backoff。
- 不在 Next.js request / API route 執行。
- 只寫 domain truth tables，不寫 `product_list_view`。

## Fetch

規則：

- 只使用 `eachview.php?IGrp={igrp}`。
- 不保留或依賴 `PHPSESSID`。
- 設定 timeout，避免單分類卡住整輪。
- 取得回應後先建立 raw snapshot metadata，再做內容驗證。
- 明確處理 Big5 到 UTF-8 解碼。

## Raw Snapshot

每次 fetch 都建立 metadata：

- `source_category_id`
- URL
- fetched time
- HTTP status 或 fetch error
- content status
- raw content hash
- parsed result hash
- gzip path
- duplicate snapshot reference
- `crawl_run_id`

規則：

- 原始 HTML gzip 保存。
- content hash 相同不重複保存檔案。
- 一般 snapshot 30 天，異常 snapshot 90 天。
- cleanup 不得影響長期價格歷史。

## Response Validation

HTTP 200 不等於成功。parser 前需驗證：

- title 含預期分類名稱或關鍵字。
- 存在 `div.w` token。
- 存在 `div.t` 商品名稱。
- 存在 `div.x` 價格。
- 至少一筆商品具 token、名稱、價格。

不符合時標記 `suspected_block` 或 `invalid`，不更新 product / price / current price。

## Parser

解析策略：

1. 掃描 `div.w`。
2. 讀 `iBuyToken`。
3. 讀同商品區塊 `div.t` 名稱。
4. 讀同商品區塊 `div.x` 價格。
5. 擷取主要商品圖片 URL。
6. 擷取可公開候選的產品介紹 / discussion URL。
7. 解析整數 TWD 價格。
8. 產生 computed `source_item_key`。

Parsed item：

- `sourceCategoryId`
- `igrp`
- `iBuyToken`
- computed `source_item_key`
- 商品原始名稱
- 主要圖片 URL
- discussion URL
- price / `TWD`
- source page URL
- fetched time

computed key：

```text
coolpc:igrp:{IGrp}:ibuy:{iBuyToken}
```

DB 不保存此 key；正式 identity 是 `sourceCategoryId + iBuyToken`。

## 圖片與外部連結

圖片 URL：

- 處理相對路徑、絕對路徑、HTML entity、空值與非法 URL。
- 只接受可正規化成 `https://www.coolpc.com.tw/eval/{IGrp}/{filename}.{jpg|jpeg|png|gif|webp}`。
- 不接受任意外部圖片、`javascript:`、`data:` 或 session token。
- 缺圖或非法圖記為 `invalid_image_url`，候選商品不進正式資料。
- `parse_errors.raw_image_url` 只供內部 debug，不公開。

Discussion / 產品介紹 URL：

- 可保存來源列「開箱討論」或產品介紹類 URL。
- API 公開前需過濾蝦皮、PDF、driver/download 類低品質外部連結。
- 沒有可用連結時回 `null`。

## Price Parsing

第一版支援：

- `NT4880`
- `NT4,880`
- `$4880`
- `$4,880`

解析後保存整數金額與 `TWD`。缺少可解析價格時不匯入正式商品，但保留錯誤與 raw snapshot。

## Candidate Validation

每筆候選必須具備：

- 非空 `iBuyToken`。
- 非空商品名稱。
- 可驗證主要圖片 URL。
- 大於 0 的整數價格。
- 可產生 computed key。

同一分類同一 snapshot：

- 相同 token、名稱、價格的完全重複列可去重。
- 相同 token 對應不同名稱或價格，該分類本次標記解析異常，不更新正式資料。

明確非商品列，例如 `【提醒】` 或 `[加購價]` 開頭且不適合作為獨立比較商品的列，不匯入正式商品。

## Data Update

資料有變：

- upsert product。
- 新商品或價格變動時新增 price snapshot。
- 更新 current price、last seen、分類成功時間。
- 分類結果 `success_changed`。

資料未變：

- 分類結果 `success_unchanged`。
- 更新 checked / success time。
- 不新增 price snapshot。
- 可更新 current price seen time。

商品消失：

- 不刪 product 或 price snapshots。
- 記錄 missing 狀態。
- 連續 6 次成功 crawl 都未出現才改 inactive。
- 相同 identity 重新出現時恢復 active。

## Failure Handling

| 情境 | 行為 |
| --- | --- |
| Fetch failed | 記錄分類結果、錯誤與 checked time；不更新正式資料；可繼續下一分類。 |
| Suspected block | 保存異常 snapshot；停止當輪；不更新正式資料；進 backoff。 |
| Parse failed | 保存 parser error；不更新 success time 或 missing count；可繼續下一分類。 |

## Run Status

分類狀態：

- `success_changed`
- `success_unchanged`
- `fetch_failed`
- `parse_failed`
- `suspected_block`

整輪狀態：

- 全成功且有變：`success_changed`
- 全成功且未變：`success_unchanged`
- 成功與失敗混合：`success_with_errors`
- 疑似攔截：`suspected_block`
- 無成功分類：對應失敗狀態

## 測試

測試案例、fixture 原則與驗收指令集中維護在 [testing-strategy.md](testing-strategy.md)，避免 crawler 文件重複列完整測試清單。
