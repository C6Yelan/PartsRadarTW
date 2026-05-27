# Phase 3 Crawler 資料寫入實作計畫

本文件記錄 Phase 3 的實作切片與驗收順序。Phase 3 的目標是把已通過 Phase 2 驗證的 parser 結果安全寫入 PostgreSQL，並建立可測試、可追查、可回放的資料流。

Phase 3 不包含 API、Web UI、正式長時間排程或 Discord bot。live 原價屋請求仍只允許手動執行，不放進常規自動化測試。

## 進入狀態

- Phase 2 已完成第一版 8 個原價屋分類的 parser live validation 與 offline replay。
- Parser 已可輸出去重後的 parsed items。
- Prisma schema 已包含 Phase 3 需要的 truth tables、enum、索引與 `product_list_view`。
- Phase 3 開始前需先確認本機開發 DB migration 狀態與 repo migration 一致。

## 實作切片

### 1. 修正本機 DB drift

目標：讓本機 PostgreSQL 開發資料庫與 repo 內 migration/schema 一致，避免 Phase 3 DB 寫入測試被舊 enum 或舊 schema 擋住。

工作：

- 檢查 `pnpm db:migrate` 是否能在本機 PostgreSQL 執行。
- 若 Prisma 偵測 migration drift，先確認 drift 只存在於本機開發 DB，不改 repo schema 來配合舊 DB。
- 若本機 DB 沒有需要保留的正式資料，可重建開發 DB 後重跑 migration 與 seed。
- 完成後執行 `pnpm db:migrate`、`pnpm db:seed`、`pnpm db:validate`。

完成條件：

- `pnpm db:migrate` 不再回報 drift。
- `pnpm db:seed` 可重跑。
- `pnpm db:validate` 通過。
- 本切片不改變產品資料模型；若發現 schema 設計問題，先回到資料模型文件與 migration 設計確認。

### 2. 建立 crawl run 與分類結果寫入骨架

目標：先建立可測試的 crawler DB 寫入入口，但不急著做完整商品價格更新。

工作：

- 建立 Phase 3 crawler write service，例如 `runCoolpcCrawlOnce()` 或等價函式。
- 建立 `crawl_runs` 開始、完成與失敗狀態更新。
- 每個 enabled category 寫入 `crawl_run_category_results`。
- `fetch_failed`、`parse_failed`、`suspected_block` 先有明確狀態與保護規則。
- `suspected_block` 立即停止當輪，不更新正式商品與價格。

完成條件：

- 可以用 fixture 或 saved raw HTML 跑一輪本機資料流測試。
- 每個被嘗試的分類都有分類層級結果。
- 整輪結果可由分類結果推得，不在 `crawl_runs` 維護額外 summary cache。

### 3. 建立 raw snapshot metadata 與檔案保存

目標：每次 fetch 或 replay 都能保存可追查的 raw snapshot metadata，並用內容 hash 避免重複寫入相同 HTML 壓縮檔。

工作：

- 使用 `SNAPSHOT_STORAGE_DIR` 控制 raw HTML 壓縮檔保存位置。
- 對原始 HTML 計算 `content_hash`。
- 保存 gzip 壓縮檔。
- 相同 `content_hash` 不重複保存壓縮檔，新的 metadata 指向既有 snapshot。
- 寫入 `raw_snapshots` 的 URL、fetch time、HTTP status、content status、hash、compressed path 與 duplicate reference。

完成條件：

- valid、invalid、suspected block 都會建立 raw snapshot metadata。
- 重複 raw content 不重複建立壓縮檔。
- raw snapshot 清理或去重設計不影響長期 price snapshots。

### 4. 建立 product、price snapshot 與 current price 寫入

目標：把可匯入的 parsed items 寫入正式商品與價格資料。

工作：

- 使用 `source_category_id + ibuy_token` upsert product。
- 新商品第一次出現時建立 product、price snapshot、current price。
- 商品名稱變動時更新 product name / normalized name，但不切斷價格歷史。
- 價格變動時新增 price snapshot 並更新 current price。
- 價格未變時不新增 price snapshot，可更新 `last_seen_at`。
- current price 只保存 `price_snapshot_id` 與狀態時間，不重複保存價格值。

完成條件：

- 新商品可建立完整商品與價格資料。
- 價格變動才新增 price snapshot。
- 價格未變不新增重複 price snapshot。
- current price 指向的 price snapshot 必須屬於同一個 product。

### 5. 建立 unchanged、last_success_at 與 missing / inactive 規則

目標：讓成功但資料未變、商品消失與失敗保護規則符合資料流文件。

工作：

- 使用 parsed result hash 判斷 `success_changed` / `success_unchanged`。
- `success_unchanged` 更新分類 `last_checked_at` 與 `last_success_at`。
- fetch failed、suspected block、parse failed 只更新 `last_checked_at`，不得更新 `last_success_at`。
- 成功 crawl 後比較既有商品與本次 parsed items。
- 商品消失時不刪除 product 或 price snapshots。
- 連續 6 次成功 crawl 都未看到同一商品時才標記 inactive。
- 商品重新出現且來源身份相同時恢復 active 並延續歷史。

完成條件：

- `success_unchanged` 會更新 `last_success_at`。
- 失敗或攔截不覆蓋 current price。
- 商品消失不刪除正式資料。
- parse failed 不累計 missing count。

### 6. 補齊 Phase 3 data flow tests

目標：用測試鎖住 crawler DB 寫入規則，避免後續 API / UI 開發建立在不穩定資料流上。

工作：

- 新商品第一次出現。
- 價格變動。
- 價格未變。
- raw content hash 去重。
- `success_unchanged` 更新成功時間。
- suspected block 不更新商品與價格。
- parse failed 不更新商品與價格、不累計 missing。
- 商品 missing 與 inactive。
- 商品重新出現恢復 active。

完成條件：

- Phase 3 data flow tests 通過。
- `pnpm test` 通過。
- `pnpm check` 通過。
- 不使用 live 原價屋請求作為常規測試。

### 7. Phase 3 收尾驗收

目標：確認資料寫入流程可進入 Phase 4 API 開發。

工作：

- 用 fixture 或 saved raw HTML 跑本機 crawl 寫入流程。
- 檢查 truth tables 內容與 `product_list_view` 投影。
- 檢查 docs 是否與實作一致。
- 檢查是否有新的待決事項。

完成條件：

- Phase 3 roadmap 完成條件全部滿足。
- crawler 寫入資料流可重跑且結果穩定。
- 可以開始 Phase 4 查詢 API。
