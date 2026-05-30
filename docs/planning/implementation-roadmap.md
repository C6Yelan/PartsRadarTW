# 實作 Roadmap

本文件定義 PartsRadarTW 第一版的實作順序與階段完成條件。Roadmap 不是時程表，不預估日期；用途是控制開發節奏，讓每個階段都有明確邊界與驗收點。

## 原則

- 先完成網站，不先做 Discord bot。
- 先建立可驗證的資料流，再擴充功能。
- 每個階段完成後先停下來檢查，不連續堆疊太多未驗證變更。
- live fetch 原價屋只能手動執行，不放進常規自動測試。
- crawler、API、web UI 保持責任分離。
- 第一版不做帳號、提醒、收藏、購買流程、價格歷史圖與商品比較。
- 第一版商品列表與商品詳細頁需要主要商品圖片；缺圖是資料完整性風險，不是正常 UI 版本。

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

資安限制：

- API 只讀取 DB 中已處理的有效資料，不直接抓取原價屋頁面。
- `GET` endpoint 不得修改資料。
- `q`、`igrp`、`minPrice`、`maxPrice`、`page`、`pageSize` 需做型別、範圍與長度驗證。
- `sort`、`status` 等列舉型 query 需使用 allowlist。
- `pageSize` 與搜尋字串長度需有明確上限，避免昂貴查詢被濫用。
- 商品名稱、分類名稱與來源資料視為不可信輸入；API 不回傳 raw HTML，Web UI 不用 `dangerouslySetInnerHTML` 顯示來源內容。
- `source.url` 不得包含 `PHPSESSID` 或其他 session token。
- 錯誤 response 使用泛用訊息，不回傳 Prisma / DB / crawler stack trace。
- API response 不暴露 computed `source_item_key`、`iBuyToken` 獨立欄位、raw snapshot、parse error、crawler error stack、DB 連線資訊或環境變數；商品詳細頁 `source.url` 可使用原價屋 `iBuy` query 作為外部購買導流。

不包含：

- 使用者帳號 API。
- 價格提醒 API。
- crawler 手動觸發 API。
- raw snapshot 或 parse error 查詢 API。
- 任何會建立、修改或刪除資料的公開 API。

完成條件：

- API contract 與 `api-design.md` 一致。
- 不合法 query 回傳 `400` 與泛用錯誤。
- 商品不存在回傳 `404`。
- 全域來源狀態與分類來源狀態符合 API 文件。
- API 不暴露 computed `source_item_key`、`iBuyToken` 獨立欄位、raw snapshot 或內部錯誤堆疊。
- 超出上限或不在 allowlist 的 query 會被拒絕或依 API 文件安全處理。
- API route 不會觸發 crawler、不會直接發出來源站請求，也不會修改資料。
- API response 與錯誤訊息不包含內部 stack trace、DB 連線資訊或環境變數。
- API 測試通過。

後續待辦：

- API rate limiting / abuse protection：待 API route 實作完成後，於 middleware、反向代理或部署層評估加入，避免大量查詢與濫用。本項不屬於目前 Phase 4 API helper 基礎切片的必須完成項目。
- DB query pressure / performance review：待 API route 與第一版 Web UI 查詢流程跑通，且有接近真實的資料量與查詢模式後，再檢查慢查詢、index、query plan、cache 或其他查詢壓力改善。本項不作為目前 Phase 4 繼續實作的阻擋條件。

## Phase 4.5：商品圖片資料契約

目標：在進入 Phase 5 前，補齊第一版主要商品圖片的資料契約、驗證與前端圖片呈現策略。

範圍：

- 驗證 CoolPC 分類頁是否能穩定取得主要商品圖片 URL。
- parser 擷取主要商品圖片 URL。
- 圖片 URL 驗證、正規化與來源 allowlist。
- 資料模型文件與 migration 設計補齊主要商品圖片欄位。
- crawler 寫入流程保存主要商品圖片資料。
- 商品列表與商品詳細 API 回傳主要商品圖片資料。
- 缺圖、空 URL、不合法 URL、非預期來源網域的處理規則與測試。
- Phase 5 前的圖片呈現方式決策與實作，不讓 Phase 5 UI 以直接 hotlink 來源圖片作為完成狀態。

不包含：

- 大尺寸原圖保存。
- CDN。
- 完整 production 圖片資產平台。
- 多張商品圖。
- 使用者上傳圖片。

完成條件：

- 第一版目標分類已用 fixture 或 saved raw HTML 驗證圖片 URL 可解析。
- 缺圖或不合法圖片 URL 會被記錄為資料完整性問題或 validation issue。
- API contract 已把主要商品圖片列為商品列表與商品詳細 response 的必要欄位。
- 資安文件已定義圖片 URL allowlist 與未來 proxy / optimizer 限制。
- Phase 5 前已完成圖片呈現方式更換：採自家小尺寸縮圖快取；直接使用 CoolPC / 原價屋圖片 URL 只保留為本機資料流驗證與小範圍測試手段。
- 自家小尺寸縮圖需先定義最小 storage、更新、失效與移除規則；placeholder / 分類圖示只作為缺圖、下載失敗或移除圖片後的 fallback。

## Phase 5：Web UI 第一版

目標：完成第一版網站查詢體驗。

範圍：

- `/` 商品查詢頁。
- `/products/{id}` 商品詳細頁。
- 主要商品圖片顯示。
- 搜尋。
- 分類篩選。
- 價格篩選。
- 排序。
- 分頁。
- stale / unavailable 顯示。
- inactive 商品顯示。
- table-first 深色查詢工具版面。
- 桌面與手機版 RWD。

不包含：

- 登入。
- 通知鈴。
- 收藏。
- 追蹤清單。
- 價格提醒。
- 價格歷史圖。
- 商品比較。
- 商品推薦。
- PC 組裝。
- 相容性檢查。
- 跨站比價。
- 購物流程。
- 規格篩選。
- 商品圖片呈現策略重決策；此 gate 必須在 Phase 5 前完成。

完成條件：

- 商品查詢頁可正常搜尋與篩選。
- 商品列表與商品詳細頁依 Phase 4.5 決定的圖片呈現方式顯示主要圖片、縮圖或 placeholder；Phase 5 不以直接 hotlink 來源圖片作為完成狀態，前端應使用站內商品圖片 API URL。
- 圖片載入失敗時不破版；無圖片時可顯示 placeholder 或分類圖示。
- 前端 fallback 不依賴圖片 URL 一定來自 CoolPC domain。
- 圖片實體儲存位置需由後端部署環境設定；前端與公開 API response 不應依賴固定資料夾相對路徑。
- 商品詳細頁可顯示價格、來源與資料狀態。
- 商品詳細頁或來源區塊需明確提供「前往原價屋查看／購買」。
- 查無商品、商品不存在、API 錯誤都有對應畫面。
- `stale` 不會被誤顯示為查無商品。
- 來源狀態只代表 crawler / parser / source data health，不使用商品供應語意。
- 手動 UI 驗收完成。

Phase 5 entry gate：

- 目前階段可暫時使用 CoolPC / 原價屋來源圖片 URL，僅限本機開發、資料流驗證與小範圍測試。
- 進入 Phase 5 前，需完成圖片呈現方式更換，並在自家小尺寸縮圖快取或 placeholder / 分類圖示之間做明確決策與實作。
- 已加上基本網站 footer 聲明：本專案非官方、非商業；資料來源為原價屋公開頁面；實際商品資訊、價格與購買以來源頁為準。公開前仍需確認是否補完整關於頁。
- 公開前需規劃權利人或來源方要求移除資料 / 圖片時的處理方式；收到合理請求後應能移除。
- 公開前需避免複製完整商品文案、完整頁面 HTML、原站排版或任何不必要的創作性內容。

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
- 檢查 production security headers，包含將基本 CSP 收斂為公開前可接受的 stricter CSP。

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
- 公開前 CSP 決策已完成：確認正式網域、圖片來源策略、是否使用 report-only 觀察期，以及是否可移除 inline script / inline style 例外。

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
- 觀察原始商品名稱是否足以產生穩定、低干擾的規格副標。

不包含：

- 擴充大量新產品類別。
- Discord bot。
- 價格提醒。
- 價格歷史頁。
- 正式規格解析或規格篩選。

完成條件：

- 主要分類可穩定解析。
- 疑似攔截時能停止並保留異常紀錄。
- 網站可持續顯示最後有效資料。
- 常見 parse error 有 fixture 與測試覆蓋。
- 對規格副標是否適合本專案有初步結論；若不可行，保留完整商品名稱為主，不阻擋第一版穩定。

## Phase 8：後續功能評估

目標：在第一版資料流穩定後，重新決定下一步功能。

候選方向：

- 價格歷史圖與歷史頁面。
- 使用者價格提醒。
- Discord bot。
- 管理者 crawler 異常通知。
- 規格副標顯示。
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
