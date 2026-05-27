# 實作 Roadmap

本文件定義 PartsRadarTW 第一版的實作順序與階段完成條件。Roadmap 不是時程表，不預估日期；用途是控制開發節奏，讓每個階段都有明確邊界與驗收點。

## 原則

- 先完成網站，不先做 Discord bot。
- 先建立可驗證的資料流，再擴充功能。
- 每個階段完成後先停下來檢查，不連續堆疊太多未驗證變更。
- live fetch 原價屋只能手動執行，不放進常規自動測試。
- crawler、API、web UI 保持責任分離。
- 第一版不做帳號、提醒、收藏、購買流程、價格歷史圖與商品比較。

## Phase 0：專案初始化

目標：建立可以開始開發的 TypeScript workspace。

範圍：

- 建立 pnpm workspace。
- 建立 root `pnpm-workspace.yaml`，包含 `apps/*` 與 `packages/*`。
- 建立 Next.js web app。
- 建立 crawler app 基本入口。
- 建立 shared / db package 初始結構。
- 建立 Vitest、Biome、TypeScript type check 與 Next.js build validation 基本設定。
- 建立 `.env.example`。
- 建立本機 PostgreSQL 開發用 Docker Compose。

不包含：

- crawler 正式抓取。
- Prisma 完整資料模型。
- 網站完整 UI。
- 正式部署。

完成條件：

- `pnpm install` 可成功。
- `pnpm lint` 可執行。
- `pnpm typecheck` 可執行。
- `pnpm build` 可執行。
- `pnpm check` 可執行。
- `pnpm test` 可執行。
- web dev server 可啟動。
- PostgreSQL 可在本機啟動。

## Phase 1：資料模型與 Migration

目標：建立第一版資料庫 schema 與 Prisma migration。

範圍：

- 建立 Prisma schema。
- 建立 `source_categories`。
- 建立 `products`。
- 建立 `price_snapshots`。
- 建立 `current_prices`。
- 建立 `crawl_runs`。
- 建立 `crawl_run_category_results`，記錄每輪 crawl 的分類層級結果。
- 建立 `raw_snapshots`。
- 建立 `parse_errors`。
- 建立 `source_categories.source_name` / `display_name`。
- `products` 使用 `source_category_id + ibuy_token` 唯一，不保存 `source_item_key`。
- `current_prices` 只保存目前 `price_snapshot` 指標，不重複保存價格值。
- `products`、`raw_snapshots`、`parse_errors` 不重複保存 `igrp`，分類資訊由 `source_category_id` 關聯取得。
- 設定 `price_snapshots.raw_snapshot_id` 可為空，避免 raw snapshot 清理影響價格歷史。
- 建立必要 enum 與索引。
- 建立基本 seed 或分類初始化資料。

不包含：

- crawler 寫入正式資料。
- API 查詢。
- 網站 UI。

完成條件：

- Prisma client 可產生。
- migration 可在本機 PostgreSQL 執行。
- 第一版分類資料可初始化。
- schema 與 `data-model.md` 沒有明顯衝突。

## Phase 2：Crawler Parser 與 Fixture

目標：先用 fixture 驗證 parser，不急著排程抓取。

範圍：

- 建立 parser 單元。
- 建立正常分類頁 fixture。
- 建立異常或缺欄位 fixture。
- 解析 `div.w`、`div.t`、`div.x`。
- 解析價格文字。
- 產生 computed `source_item_key`，但不寫入 DB。
- 驗證第一版目標分類是否能穩定取得 `iBuyToken`。
- 建立 response content validation。
- 建立 parser / validation Vitest 測試。

不包含：

- 定時 crawler。
- 寫入 PostgreSQL 正式資料流。
- 大量 live fetch。

完成條件：

- 正常 fixture 可解析商品。
- 第一版目標分類的 fixture 驗證 `iBuyToken` 與必要結構；未通過的分類不進入正式商品匯入。
- 缺少必要結構時不產生正式商品資料。
- HTTP 200 但內容異常時可標記為 invalid 或 suspected block。
- parser 測試通過。
- 測試不依賴 live 原價屋請求。

## Phase 3：Crawler 資料寫入流程

目標：把 parser 結果安全寫入資料庫。

實作切片與驗收順序見 [Phase 3 Crawler 資料寫入實作計畫](phase-03-crawler-write-plan.md)。

範圍：

- 建立 crawl run 流程。
- 建立 crawl run category result 寫入流程。
- 建立 raw snapshot metadata 寫入。
- 建立 raw HTML 壓縮檔保存與 hash 去重。
- 建立以 `source_category_id + ibuy_token` 為唯一鍵的 product upsert。
- 建立 new product / price changed 的 price snapshot 寫入。
- 建立 current price 更新。
- 建立 unchanged 流程。
- 建立成功檢查時更新 `last_success_at` 的規則，包含 `success_unchanged`。
- 建立商品消失 / inactive 記錄邏輯。
- 建立 fetch failed、suspected block、parse failed 的停止與保護規則。

不包含：

- 網站 API。
- 正式長時間排程部署。
- Discord bot 通知。

完成條件：

- 新商品可建立 product、price snapshot、current price。
- 價格變動才新增 price snapshot。
- 價格未變不新增重複 price snapshot。
- `success_unchanged` 會更新分類 `last_success_at`。
- 疑似攔截不更新正式商品與價格。
- 商品消失不刪除 product 或價格歷史。
- data flow 測試通過。

## Phase 4：查詢 API

目標：提供第一版網站需要的讀取 API。

範圍：

- `GET /api/categories`。
- `GET /api/products`。
- `GET /api/products/{id}`。
- `GET /api/source-status`。
- 查詢參數驗證。
- 分頁、排序、分類篩選、價格篩選。
- active / inactive 商品狀態。
- stale / unavailable 來源狀態。
- `/api/source-status` 支援全域與分類層級狀態。

不包含：

- 使用者帳號 API。
- 價格提醒 API。
- crawler 手動觸發 API。
- raw snapshot 或 parse error 查詢 API。

完成條件：

- API contract 與 `api-design.md` 一致。
- 不合法 query 回傳 `400` 與泛用錯誤。
- 商品不存在回傳 `404`。
- 全域來源狀態與分類來源狀態符合 API 文件。
- API 不暴露 computed `source_item_key`、`iBuyToken`、raw snapshot 或內部錯誤堆疊。
- API 測試通過。

## Phase 5：Web UI 第一版

目標：完成第一版網站查詢體驗。

範圍：

- `/` 商品查詢頁。
- `/products/{id}` 商品詳細頁。
- 搜尋。
- 分類篩選。
- 價格篩選。
- 排序。
- 分頁。
- stale / unavailable 顯示。
- inactive 商品顯示。
- 桌面與手機版 RWD。

不包含：

- 登入。
- 收藏。
- 價格提醒。
- 價格歷史圖。
- 商品比較。
- 購物流程。

完成條件：

- 商品查詢頁可正常搜尋與篩選。
- 商品詳細頁可顯示價格、來源與狀態。
- 查無商品、商品不存在、API 錯誤都有對應畫面。
- `stale` 不會被誤顯示為查無商品。
- 手動 UI 驗收完成。

## Phase 6：Docker 與部署準備

目標：讓專案能以 Docker 方式接近正式環境運行。

範圍：

- 建立 web Docker build。
- 建立 crawler Docker build。
- 建立 PostgreSQL service。
- 建立 snapshot storage volume。
- 建立 production compose 初版。
- 建立 migration 部署流程。
- 建立最小 smoke test。

不包含：

- 完整 CI/CD。
- 完整監控。
- 自動備份系統。
- Discord 管理通知。

完成條件：

- Docker build 成功。
- compose 可啟動 web、crawler、postgres。
- migration 可在部署流程中執行。
- `/api/source-status` 可回應。
- snapshot storage 可寫入。
- smoke test 完成。

## Phase 7：資料流穩定期

目標：觀察實際抓取、解析與網站顯示是否穩定。

範圍：

- 手動或低頻啟動 crawler。
- 觀察成功率、攔截狀況與 parse error。
- 補足 fixture。
- 調整 parser。
- 檢查 raw snapshot 去重與保存期限。
- 檢查 inactive 商品判定是否合理。
- 檢查 stale 提示是否符合使用者理解。

不包含：

- 擴充大量新產品類別。
- Discord bot。
- 價格提醒。
- 價格歷史頁。

完成條件：

- 主要分類可穩定解析。
- 疑似攔截時能停止並保留異常紀錄。
- 網站可持續顯示最後有效資料。
- 常見 parse error 有 fixture 與測試覆蓋。

## Phase 8：後續功能評估

目標：在第一版資料流穩定後，重新決定下一步功能。

候選方向：

- 價格歷史圖與歷史頁面。
- 使用者價格提醒。
- Discord bot。
- 管理者 crawler 異常通知。
- 商品分類與規格整理。
- 擴充更多原價屋分類。

進入條件：

- 第一版網站已能穩定查詢。
- crawler 資料流已觀察一段時間。
- 原價屋攔截與異常處理有基本經驗。
- 目前文件與實作沒有明顯脫節。

## 開發節奏建議

每個 phase 結束時先做：

- 跑該階段對應測試。
- 更新相關文件。
- 檢查是否有新的待決事項。
- 視變更大小建立 commit。
- 再決定是否進入下一個 phase。

若某階段發現前一階段設計不合理，先回頭修正文件與基礎設計，不直接把問題繞過去。
