# 資料流設計

本文件定義 PartsRadarTW 第一版資料如何從原價屋公開頁面進入系統，並支撐網站查詢。實際資料表、API contract 與 crawler 實作細節會在後續文件或實作階段再細化。

尚未定案的資料流決策統一記錄於 `decision-log.md`，本文件不另外維護待決清單。

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

商品分類第一版先保留原價屋分類。若後續發現原價屋分類不利搜尋、篩選或呈現，再新增 PartsRadarTW 自己的顯示分類。

## 整體流程

```text
原價屋 `eachview.php?IGrp={分類編號}` 分類頁
  -> fetch raw page（抓取原始頁面）
  -> raw snapshot（原始資料快照）
  -> validate response content（驗證回應內容）
  -> parse product candidates（解析候選商品）
  -> validate parsed items（驗證解析結果）
  -> upsert products（新增或更新商品主檔）
  -> insert price snapshots（寫入價格快照）
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
- 原始 HTML 壓縮檔路徑或可重放的原始內容位置。

Raw snapshot 保存方式：

- 重要 metadata、內容判定狀態與錯誤資訊存入資料庫。
- 原始 HTML 在解析使用後壓縮保存成檔案。
- 一般 snapshot 最長保留 30 天。
- 異常 snapshot 最長保留 90 天。
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

每次成功抓到價格時，應寫入一筆價格紀錄。

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

### Current Price

網站第一版主要讀取目前有效價格。

Current price 使用獨立 `current_prices` 表，讓網站商品列表、搜尋與基本詳細頁可以穩定讀取最新有效價格。

`current_prices` 不取代價格歷史。價格歷史由 price snapshots 或 price history 保存；`current_prices` 只保存目前顯示與查詢用的最新有效狀態。

更新規則：

- 成功解析商品價格時，寫入 price snapshot，並更新 `current_prices`。
- 價格未變時，可只更新 `current_prices.last_seen_at`，避免每 5 分鐘產生大量重複歷史紀錄。
- 抓取失敗、疑似攔截或解析異常時，不更新 `current_prices`。

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
8. 寫入 price snapshot。
9. 更新目前價格讀取口徑。
10. 網站可查詢到更新後資料。

## 失敗處理

### 抓取失敗

若頁面無法抓取，應記錄：

- 抓取 URL。
- 發生時間。
- HTTP 狀態或錯誤訊息。
- crawl run 狀態。

抓取失敗不應刪除既有商品資料。

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

疑似被攔截時應立即停止當次 crawl cycle，等待下一次 5 分鐘循環再嘗試。若連續失敗多次，下一輪應延後 1 小時。

異常狀況應保留紀錄，包含命中的內容特徵、失敗分類、失敗時間與 crawl run 狀態。這些紀錄未來可作為 Discord bot 通知管理者的資料來源。

### 解析失敗

若 raw snapshot 存在但 parser 無法解析，應保留 raw snapshot 與錯誤資訊，方便後續修正 parser 後重跑。

解析失敗不應直接覆蓋既有商品資料。

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

最新一次抓取失敗時，網站是否顯示資料過期提示，以 `decision-log.md` 的待決事項追蹤。