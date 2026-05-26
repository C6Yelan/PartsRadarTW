# Crawler 設計

本文件定義 PartsRadarTW 第一版 crawler 的執行方式、解析規則與失敗處理。資料表欄位細節會在 data model 文件中定義；本文件只描述 crawler 行為與責任邊界。

## 設計依據

第一版 crawler 只抓取原價屋分類總覽頁：

```text
https://www.coolpc.com.tw/eachview.php?IGrp={分類編號}
```

本設計參考 2026-05-25 試抓 `eachview.php?IGrp=4` 的觀察結果：

- 頁面標題包含分類名稱，例如 CPU 頁為「原價屋處理器CPU總覽」。
- 頁面以 Big5 編碼回傳。
- 商品區塊包含隱藏的 `div.w`，其文字為 `iBuy` token。
- 商品名稱出現在同一商品區塊內的 `div.t`。
- 價格出現在同一商品區塊內的 `div.x`，格式可見 `含稅：NT4880`。
- 頁面中的 Buy 行為會用 `iBuy` token 組出 `evaluate.php?iBuy={token}`，但第一版 crawler 不使用 `evaluate.php` 作為抓取來源。

試抓中可見的商品區塊概念如下：

```html
<div class="w">iBuyToken</div>
<span>
  <div class="t">商品名稱</div>
  <div class="x">含稅：NT4880 ...</div>
</span>
```

實際 HTML 可能包含圖片、外部規格連結、Buy 按鈕或其他樣式內容；parser 不應依賴這些非必要元素。

## 第一版抓取分類

第一版先處理組電腦必要硬體。

| 分類 | IGrp | URL |
| --- | --- | --- |
| CPU | `4` | `https://www.coolpc.com.tw/eachview.php?IGrp=4` |
| 主機板 | `5` | `https://www.coolpc.com.tw/eachview.php?IGrp=5` |
| 記憶體 | `6` | `https://www.coolpc.com.tw/eachview.php?IGrp=6` |
| SSD | `7` | `https://www.coolpc.com.tw/eachview.php?IGrp=7` |
| HDD | `8` | `https://www.coolpc.com.tw/eachview.php?IGrp=8` |
| 散熱器 | `10` | `https://www.coolpc.com.tw/eachview.php?IGrp=10` |
| 顯示卡 | `12` | `https://www.coolpc.com.tw/eachview.php?IGrp=12` |
| 機殼 | `14` | `https://www.coolpc.com.tw/eachview.php?IGrp=14` |
| 電源供應器 | `15` | `https://www.coolpc.com.tw/eachview.php?IGrp=15` |

水冷分類 `IGrp=11` 與機殼風扇 / 配件 `IGrp=16` 暫不列入第一版主線。

## 執行方式

Crawler 是獨立 TypeScript process，以 Node.js 執行。

執行規則：

- 每 5 分鐘檢查是否可啟動下一輪 crawl cycle。
- 若上一輪尚未完成，不啟動新的 crawl cycle。
- 每輪依第一版分類清單逐一抓取。
- 疑似被攔截時，立即停止當次 crawl cycle。
- 單一分類 fetch failed 或 parse failed 時，記錄該分類結果後可繼續下一分類；疑似被攔截例外，需停止整輪。
- 連續失敗多次時，延後 1 小時再嘗試。
- 不在 Next.js request / API route 內執行 crawler。

## Fetch 規則

Crawler fetch 應符合：

- 只使用 `eachview.php?IGrp={分類編號}`。
- 不使用 `evaluate.php` 抓商品資料。
- 不保留或依賴 `PHPSESSID`。
- 設定合理 timeout，避免單一分類卡住整輪。
- 取得原始回應後，先保存 raw snapshot metadata，再進入內容驗證。
- 明確處理 Big5 到 UTF-8 的解碼。

Big5 解碼工具可在實作時依 Node.js runtime 支援度選擇；若內建 `TextDecoder` 在部署環境不穩定，應使用專門的編碼轉換套件。

## Raw Snapshot

每次 fetch 都應建立 raw snapshot metadata。

Raw snapshot metadata 至少包含：

- source：固定為 `coolpc`。
- `igrp`。
- URL。
- fetched_at。
- HTTP status 或 fetch error。
- content_status，例如 `valid`、`suspected_block`、`invalid`。
- raw content hash。
- parsed result hash。
- compressed HTML path。
- duplicate snapshot reference。
- crawl_run_id。

原始 HTML 保存規則：

- 原始 HTML 使用後壓縮保存成檔案。
- raw content hash 完全相同時，不重複保存相同壓縮檔。
- 重複內容的 snapshot metadata 應指向既有 snapshot，例如 `duplicate_of_snapshot_id`。
- 一般 snapshot 最長保留 30 天。
- 異常 snapshot 最長保留 90 天。
- raw snapshot 清理不得影響長期價格歷史；price snapshot 若參照 raw snapshot，關聯需允許清空。

raw content hash 用於原始檔去重；parsed result hash 用於判斷商品資料是否實際變化。

## Response Content Validation

HTTP 200 不代表抓取成功。進入 parser 前，必須驗證內容是否仍是預期的分類總覽頁。

`eachview.php?IGrp={分類編號}` 第一版有效條件：

- 頁面 title 包含預期分類名稱或可接受的分類關鍵字。
- 頁面存在商品 token 結構：`div.w`。
- 頁面存在商品名稱結構：`div.t`。
- 頁面存在價格結構：`div.x`。
- 至少解析到一筆具備 token、名稱與價格的商品。

若 HTTP 200 但缺少上述必要結構，標記為 `suspected_block` 或 `invalid`，不進入 product upsert、price snapshot 或 current price 更新流程。

已知攔截頁特徵應從實際 raw snapshot 補充，不憑空猜測固定文字。

## Parser 規則

Parser 使用 `cheerio` 解析 HTML。

第一版解析策略：

1. 逐一掃描 `div.w`。
2. 讀取並 trim `div.w` 文字作為 `iBuyToken`。
3. 取得緊鄰商品區塊中的 `div.t` 作為商品原始名稱。
4. 取得同一商品區塊中的 `div.x` 作為價格文字。
5. 從價格文字解析整數金額。
6. 產生 `source_item_key`。
7. 輸出 parsed item。

Parsed item 至少包含：

- source：`coolpc`。
- `igrp`。
- 原價屋分類名稱。
- `iBuyToken`。
- `source_item_key`。
- 商品原始名稱。
- 價格。
- 幣別：`TWD`。
- source page URL。
- fetched_at。

`source_item_key` 格式：

```text
coolpc:igrp:{IGrp}:ibuy:{iBuyToken}
```

`iBuyToken` 應保留原字串，不應為了商品識別而修改、截斷或重新產生。

## Price Parsing

試抓 CPU 頁可見價格文字格式：

```text
含稅：NT4880
```

第一版 parser 應支援：

- `NT4880`
- `NT4,880`
- `$4880`
- `$4,880`

解析後統一存成整數金額與 `TWD`。

若商品缺少可解析價格，不寫入正式商品資料，但保留解析紀錄與 raw snapshot。

## Parsed Item Validation

每個 parsed item 必須通過：

- `iBuyToken` 不可為空。
- 商品原始名稱不可為空。
- 價格必須是大於 0 的整數。
- `source_item_key` 可產生。

若商品缺少 `iBuyToken`：

- 不匯入正式商品資料。
- 保留原始商品名稱、分類、raw snapshot 與解析紀錄。

若同一分類同一 snapshot 內出現重複 `source_item_key`，該分類本次結果應標記為解析異常，不更新正式商品與價格資料。

## 資料更新規則

成功解析並驗證後，crawler 比對本次 parsed result hash 與上一個成功結果。

### 資料有變

若商品清單、商品名稱或價格有變：

- upsert product。
- 新商品或價格變動時，寫入 price snapshot。
- 更新 `current_prices`。
- 更新 `last_seen_at`。
- 更新分類層級的 `last_checked_at` 與 `last_success_at`。
- 記錄 crawl run 為成功且有變更。

### 資料未變

若商品清單與價格完全沒變：

- 記錄 crawl run 成功，狀態可標記為 `unchanged`。
- 更新來源或分類層級的 `last_checked_at`。
- 更新來源或分類層級的 `last_success_at`。
- 不新增 price snapshot。
- 不重複 upsert 所有商品。
- 可依實作需要更新 `current_prices.last_seen_at`。
- raw snapshot 以 content hash 去重，不重複保存相同 HTML。

### 商品消失

若本次成功 crawl 未看到既有商品：

- 不刪除 product。
- 不刪除 price snapshot。
- 記錄 missing 狀態，例如 `missing_since` 或 `missing_seen_count`。
- 不因單次成功 crawl 缺少商品就立即改為 inactive。
- 連續 6 次成功 crawl 都未看到同一商品時，才改為 inactive。
- 若商品未來以相同 `source_item_key` 重新出現，恢復 active 並延續原歷史。

## 失敗處理

### Fetch 失敗

Fetch 失敗時：

- 記錄 crawl run 狀態。
- 記錄 URL、分類、錯誤訊息與發生時間。
- 不刪除既有商品資料。
- 不更新 current price。
- 更新該分類的 `last_checked_at`。
- 不更新該分類的 `last_success_at`。
- 第一版可繼續下一分類；整輪結束時若有成功分類與失敗分類，整輪狀態應標記為部分成功。

### 疑似被攔截

疑似被攔截時：

- 標記 snapshot 為 `suspected_block`。
- 更新命中分類的 `last_checked_at`。
- 立即停止當次 crawl cycle。
- 不進入 product upsert。
- 不寫入 price snapshot。
- 不覆蓋 current price。
- 保存異常內容特徵，供未來人工檢查與 Discord bot 管理通知使用。

### Parse 失敗

Parse 失敗時：

- 保存 raw snapshot。
- 保存 parser error 與命中的分類。
- 不更新正式商品與價格資料。
- 更新該分類的 `last_checked_at`。
- 不更新該分類的 `last_success_at`。
- 不累計該分類商品的 missing count。
- 第一版可繼續下一分類；整輪結束時若有成功分類與失敗分類，整輪狀態應標記為部分成功。
- 後續修正 parser 後可用 raw snapshot 重跑。

## 分類結果與整輪結果

crawler 應同時記錄分類層級結果與整輪 crawl run 摘要。

分類層級結果用來判斷該 `IGrp` 本次是否成功，並更新 `source_categories.last_checked_at` / `last_success_at`。整輪 crawl run 則用來觀察排程是否正常、是否進入 backoff，以及本輪是否全部成功或部分成功。

第一版分類層級結果先寫在 `crawl_runs.category_results` JSON，不強制建立獨立資料表。每筆結果先只記錄 `igrp`、`status`、`raw_snapshot_id` 與 `error_message`；若後續需要查詢每個分類的歷史成功率、管理介面或告警統計，再拆成正式關聯表。

狀態規則：

- `success_changed`：該分類成功，且商品清單、商品名稱或價格有變。
- `success_unchanged`：該分類成功，但 parsed result 與上一個成功結果相同。
- `fetch_failed`：該分類無法取得可驗證內容，可繼續下一分類。
- `parse_failed`：該分類內容取得成功但解析失敗，可繼續下一分類。
- `suspected_block`：疑似被攔截，立即停止整輪並進入既有 backoff 規則。

整輪結果：

- 全部分類成功且至少一個分類有變更，整輪為 `success_changed`。
- 全部分類成功且都未變，整輪為 `success_unchanged`。
- 同一輪內同時存在成功與失敗分類，整輪為 `success_with_errors`。
- 疑似被攔截時，整輪為 `suspected_block`。
- 沒有任何分類成功時，整輪使用對應的失敗狀態。

## Crawl Run 狀態

第一版可先使用下列概念狀態：

- `running`
- `success_changed`
- `success_unchanged`
- `success_with_errors`
- `fetch_failed`
- `suspected_block`
- `parse_failed`
- `skipped_overlap`
- `backoff`

實際 enum 名稱可在 data model 文件中定義。

## 測試重點

Crawler 測試範圍以 [testing-strategy.md](testing-strategy.md) 為準。本文件只定義 crawler 行為；測試案例、fixture 原則與階段驗收不在此重複維護。
