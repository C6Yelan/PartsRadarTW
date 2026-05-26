# 資料流設計

本文件定義 PartsRadarTW 第一版資料如何從原價屋公開頁面進入系統，並支撐網站查詢。實際資料表、API contract 與 crawler 實作細節會在後續文件或實作階段再細化。

尚未定案的資料流決策統一記錄於 [decision-log.md](decision-log.md)，本文件不另外維護待決清單。

## 目標

第一版資料流要先做到：

- 能重複抓取原價屋商品資料。
- 能判斷同一個原價屋商品是否已存在。
- 能更新商品目前價格。
- 能保留價格更新紀錄。
- 能讓網站查詢到目前有效的商品資料。
- 抓取或解析失敗時能留下可追查資訊。
- 能辨識 HTTP 200 但內容實際為攔截頁或非商品資料頁的情況。

## 第一版資料範圍

第一版先處理組一台電腦會用到的主要硬體分類，後續再逐步補齊原價屋其他類別與產品。

優先分類包含：

- CPU。
- 主機板。
- 記憶體。
- 顯示卡。
- SSD / HDD。
- 電源供應器。
- 機殼。
- 散熱器。

商品分類第一版先保留原價屋分類脈絡。資料庫應同時保存原價屋分類名稱與 PartsRadarTW 顯示名稱，讓 crawler 可追溯來源分類，網站也能使用較簡潔的分類標籤。

## 整體流程

```text
原價屋 `eachview.php?IGrp={分類編號}` 分類頁
  -> fetch raw page（抓取原始頁面）
  -> raw snapshot（原始資料快照）
  -> validate response content（驗證回應內容）
  -> parse product candidates（解析候選商品）
  -> validate parsed items（驗證解析結果）
  -> upsert products（新增或更新商品主檔）
  -> insert price snapshots when needed（必要時寫入價格快照）
  -> update current prices（更新目前價格）
  -> read API（讀取 API）
  -> web UI（網站介面）
```

## 資料階段

### Raw Snapshot

每次抓取原價屋頁面後，應先保留原始資料快照，再進行解析。

用途：

- 方便重跑 parser。
- 方便追查原價屋頁面變動。
- 方便比對抓取失敗或解析失敗原因。

Raw snapshot 至少應記錄：

- 來源：固定為原價屋。
- 抓取 URL：第一版主要為 `eachview.php?IGrp={分類編號}`。
- 抓取時間。
- HTTP 狀態或錯誤資訊。
- 內容判定狀態，例如 valid、suspected_block、invalid。
- 內容 hash。
- 原始 HTML 壓縮檔路徑或可重放的原始內容位置。
- 若內容與既有 snapshot 完全相同，記錄重複來源 snapshot。

Raw snapshot 保存方式：

- 重要 metadata、內容判定狀態與錯誤資訊存入資料庫。
- 原始 HTML 在解析使用後壓縮保存成檔案。
- 原始 HTML 需以內容 hash 去重；內容完全相同時，不重複保存相同壓縮檔。
- 重複內容的 snapshot metadata 應指向既有 raw snapshot 或記錄 `duplicate_of_snapshot_id`。
- 一般 snapshot 最長保留 30 天。
- 異常 snapshot 最長保留 90 天。
- raw snapshot 清理不得影響長期價格歷史；若 price snapshot 參照 raw snapshot，該關聯需允許清空或以不破壞外鍵的方式處理。
- 保存期限未來可依實際儲存空間、除錯需求與資料量調整。

HTTP 狀態碼不可作為唯一成功依據。過去經驗顯示，原價屋在短時間內請求頻率過快時，可能回傳 HTTP 200，但頁面內容已變成攔截或提示頁，而不是原本的商品資料頁。

### Response Content Validation

Raw snapshot 進入 parser 前，應先做內容層驗證。

驗證目標：

- 判斷回應內容是否仍是預期的原價屋商品或分類頁。
- 偵測 HTTP 200 但內容為攔截頁、提示頁或非預期頁面的情況。
- 避免把攔截頁解析成空商品、錯誤商品或覆蓋既有有效資料。

第一版可先用保守規則：

- 內容必須包含商品列表可辨識的穩定結構或關鍵欄位。
- 若內容符合已知攔截頁特徵，該 snapshot 標記為 `suspected_block`。
- 若內容缺少商品頁必要結構，不直接進入正式商品更新流程。
- 疑似被攔截時應記錄 crawl run 狀態，並交由後續重試或人工檢查。

### Parsed Item

Parser 應把 raw snapshot 轉成網站可用的標準商品資料。

第一版 parsed item 至少應包含：

- 原價屋分類。
- 商品原始名稱。
- 商品價格。
- 幣別。
- 原始頁面或商品連結。
- 資料抓取時間。
- `source_item_key`。

可選欄位：

- 型號提示。
- 品牌提示。
- 初步規格資料。
- parser 補充資訊。

### Product

Product 是商品主檔，用來表示同一個原價屋商品。

商品主檔應使用內部 UUID 作為資料庫主鍵，並使用 `source_item_key` 判斷 crawler 抓到的是不是同一個原價屋商品。

概念欄位：

- `id`：內部 UUID。
- `source`：固定為原價屋。
- `source_item_key`：來源商品識別鍵。
- `category`：原價屋分類。
- `name`：商品原始名稱。
- `source_url`：原始來源連結。
- `created_at`。
- `updated_at`。

### Price Snapshot

首次看到商品價格或價格變動時，應寫入一筆價格紀錄。

用途：

- 支撐未來價格歷史與趨勢圖。
- 支撐未來價格提醒。
- 保留價格變化的可追溯紀錄。

概念欄位：

- `product_id`。
- `price`。
- `currency`。
- `captured_at`。
- `crawl_run_id`。
- `raw_snapshot_id`，可為空，用來追溯當時來源 snapshot。

Price snapshot 屬於長期價格資料，不套用 raw snapshot 的 30 / 90 天保存期限。若對應 raw snapshot metadata 或壓縮檔因保存期限被清理，price snapshot 仍必須保留；`raw_snapshot_id` 可被清空，但 `product_id`、價格、幣別、`captured_at` 與 `crawl_run_id` 不可因此遺失。若未來資料量過大，再另行規劃價格歷史彙總或封存策略。

### Current Price

網站第一版主要讀取目前有效價格。

Current price 使用獨立 `current_prices` 表，讓網站商品列表、搜尋與基本詳細頁可以穩定讀取最新有效價格。

`current_prices` 不取代價格歷史。價格歷史由 price snapshots 或 price history 保存；`current_prices` 只保存目前顯示與查詢用的最新有效狀態。

更新規則：

- 新商品或價格變動時，寫入 price snapshot，並更新 `current_prices`。
- 價格未變時，可只更新 `current_prices.last_seen_at`，避免每 5 分鐘產生大量重複歷史紀錄。
- 抓取失敗、疑似攔截或解析異常時，不更新 `current_prices`。

時間欄位應區分不同意義：

- `last_checked_at`：系統最後一次檢查來源頁面的時間。
- `last_success_at`：系統最後一次成功抓取、驗證並解析有效資料的時間。
- `last_seen_at`：商品最後一次仍在來源中被看見的時間。
- `captured_at`：價格快照實際被記錄的時間。
- `price_changed_at`：目前價格最後一次變動的時間。

## 商品識別

商品識別採兩層設計：

- 內部 UUID：給資料表關聯與 API 回傳使用。
- `source_item_key`：給 crawler 判斷同一個原價屋商品使用。

`source_item_key` 具體格式：

```text
coolpc:igrp:{IGrp}:ibuy:{iBuyToken}
```

規則：

1. `IGrp` 來自原價屋分類編號。
2. `iBuyToken` 來自 `eachview.php?IGrp={分類編號}` 的商品區塊。
3. 不使用每次新產生的 UUID 判斷商品是否相同。
4. 不單獨依賴商品名稱，避免名稱微調造成價格歷史斷裂。
5. 不使用價格作為商品識別依據。
6. 不使用 `PHPSESSID` 作為商品識別或穩定來源 URL 的一部分。

若商品沒有 `iBuyToken`，第一版不匯入正式商品資料，但應保留解析紀錄與 raw snapshot，方便後續檢查。

## 更新排程

第一版 crawler 以每 5 分鐘檢查一次是否可啟動下一輪 crawl cycle 為目標。

排程規則：

- 若上一輪 crawl 尚未完成，不啟動新的 crawl cycle。
- 每 5 分鐘是啟動檢查頻率，不保證每 5 分鐘完成一輪完整抓取。
- 實際完整抓取時間需配合分類數量、請求延遲與攔截風險調整。

## 成功流程

一次成功資料更新應符合下列流程：

1. 建立 crawl run。
2. 抓取原價屋公開頁面。
3. 保存 raw snapshot。
4. 驗證 response content 確實是可解析的商品資料頁。
5. 解析商品資料。
6. 驗證 parsed item 必要欄位。
7. 用 `source_item_key` upsert product。
8. 新商品或價格變動時寫入 price snapshot。
9. 更新目前價格讀取口徑。
10. 更新來源或分類層級的 `last_checked_at` 與 `last_success_at`。
11. 網站可查詢到更新後資料。

### 資料未變流程

若本次抓取、內容驗證與解析都成功，但商品清單與價格相較上一個成功結果完全沒有變化，應視為成功檢查，不視為失敗或異常。

處理規則：

- crawl run 記錄為成功，狀態標記為 `success_unchanged`。
- 更新來源或分類層級的 `last_checked_at`。
- 更新來源或分類層級的 `last_success_at`，因為 fetch、內容驗證與解析都已成功。
- 不新增 price snapshot，避免重複價格歷史。
- 不重複 upsert 所有商品，避免不必要的 DB 寫入。
- 可依實作需要更新 `current_prices.last_seen_at`，表示商品仍存在於來源頁。
- raw snapshot 以內容 hash 去重；若原始 HTML 與既有 snapshot 完全相同，不重複保存相同壓縮檔。

## 失敗處理

### 抓取失敗

若頁面無法抓取，應記錄：

- 抓取 URL。
- 發生時間。
- HTTP 狀態或錯誤訊息。
- crawl run 狀態。

抓取失敗不應刪除既有商品資料。

分類層級的 fetch failed 只代表該分類本次失敗。該分類可更新 `last_checked_at`，但不得更新 `last_success_at`。第一版可繼續處理下一個分類，並將整輪 crawl 記錄為 `success_with_errors` 或對應的部分成功狀態。只有疑似被攔截、進入 backoff、或整輪都無法取得有效資料時，才停止或標記整輪失敗。

### 商品從來源消失

若某次成功 crawl 沒有看到既有商品，不應立即刪除 product，也不應刪除 price snapshot。

處理規則：

- 先記錄商品 missing 狀態，例如 `missing_since` 或 `missing_seen_count`。
- 不立即將商品視為永久下架，避免原價屋短暫頁面異常造成誤判。
- 連續 6 次成功 crawl 都未看到同一商品時，才將商品改為 inactive。
- 若商品未來以相同 `source_item_key` 重新出現，應恢復 active 並延續原價格歷史。
- 網站是否顯示 inactive 商品，留待網站呈現規則決定。

### 疑似被攔截

若 HTTP 狀態碼為 200，但內容判定為攔截頁、提示頁或非預期商品頁，應視為資料抓取未成功。

應記錄：

- 抓取 URL。
- 發生時間。
- HTTP 狀態碼。
- 內容判定狀態。
- 命中的攔截頁或非預期內容特徵。
- crawl run 狀態。

疑似被攔截時不應進入 product upsert 或 price snapshot 寫入流程，也不應覆蓋既有目前價格。

疑似被攔截時可更新命中分類的 `last_checked_at`，但不得更新 `last_success_at`。接著應立即停止當次 crawl cycle，等待下一次 5 分鐘循環再嘗試。若連續失敗多次，下一輪應延後 1 小時。

異常狀況應保留紀錄，包含命中的內容特徵、失敗分類、失敗時間與 crawl run 狀態。這些紀錄未來可作為 Discord bot 通知管理者的資料來源。

### 解析失敗

若 raw snapshot 存在但 parser 無法解析，應保留 raw snapshot 與錯誤資訊，方便後續修正 parser 後重跑。

解析失敗不應直接覆蓋既有商品資料。

分類層級的 parse failed 可更新該分類的 `last_checked_at`，但不得更新 `last_success_at`，也不應累計該分類商品的 missing count，因為本次沒有得到可靠的成功商品清單。第一版可繼續處理下一個分類，並保存該分類的錯誤結果供後續修正 parser。

### 商品識別失敗

若商品缺少 `iBuyToken` 或無法產生可靠的 `source_item_key`，第一版不寫入正式商品主檔，但應保留解析紀錄與 raw snapshot，方便後續檢查。

## 網站讀取口徑

網站第一版應只讀取已成功處理的商品資料。

網站需要的基本資料：

- 商品名稱。
- 原價屋分類。
- 目前價格。
- 幣別。
- 資料更新時間。
- 原價屋來源連結。

第一版來源連結先指向不含 `PHPSESSID` 的原價屋分類頁，不保證能直接定位到單一商品。

最新一次抓取失敗、疑似攔截或解析失敗時，網站仍顯示最後一次成功處理的有效資料，並透過來源狀態呈現資料是否可能過期。來源狀態規則以 [decision-log.md](decision-log.md) 為準，API contract 與 UI 呈現分別由 API 與 Web UI 文件定義。
