# 實作 Roadmap

本文件只保留第一版開發順序與 phase gate。已完成 phase 的細節證據不留在 current docs；需要考古時看 Git history。技術規則以 `docs/technical/` 為準。

## 原則

- 第一版先完成網站查詢體驗，不做 Discord bot、帳號、收藏、提醒、購物、比較或規格篩選。
- 先建立可驗證資料流，再擴充功能。
- 每個 phase 結束都要停下來驗證、更新文件與 commit，不連續堆疊未驗證變更。
- live fetch 原價屋只能手動或明確 profile 執行，不進常規自動測試。
- crawler、API、Web UI、部署維運保持責任分離。
- 商品圖片是第一版資料需求；正式 UI 使用站內商品圖片 API，不以 hotlink 來源圖片作為完成狀態。

## Phase 0：專案初始化

目標：建立可開發的 TypeScript monorepo。

範圍：

- pnpm workspace、Next.js web、crawler app、`packages/db`、`packages/shared`。
- Vitest、Biome、TypeScript typecheck、Next.js build、`.env.example`。
- 本機 PostgreSQL Compose baseline。

完成條件：

- `pnpm install`、`pnpm test`、`pnpm check` 可執行。
- web dev server 與本機 PostgreSQL 可啟動。

## Phase 1：資料模型與 Migration

目標：建立第一版 PostgreSQL / Prisma schema。

範圍：

- `source_categories`、`products`、`price_snapshots`、`current_prices`。
- `crawl_runs`、`crawl_run_category_results`、`raw_snapshots`、`parse_errors`。
- `product_list_view` read projection。
- 第一版 8 個 CoolPC 分類 seed。

完成條件：

- Prisma client 可產生，migration 可套用。
- schema 與 [資料模型](../technical/data-model.md) 一致。
- 核心表不保存可由分類關聯推出的固定來源欄位。

## Phase 2：Crawler Parser 與 Fixture

目標：用 fixture 驗證 parser，不急著寫 DB 或排程。

範圍：

- 解析 `div.w`、`div.t`、`div.x`、價格文字與主要圖片 URL。
- 建立 response content validation 與 parser fixtures。
- 驗證第一版分類可穩定取得 `iBuyToken`。

完成條件：

- 正常 fixture 可解析商品。
- 缺必要結構或 HTTP 200 異常內容時不產生正式商品。
- parser / validation 測試通過，且不依賴 live request。

## Phase 3：Crawler 資料寫入流程

目標：把 parser 結果安全寫入資料庫。

範圍：

- crawl run、分類結果、raw snapshot metadata / gzip、hash 去重。
- product upsert、price snapshot、current price、missing / inactive 流程。
- fetch failed、suspected block、parse failed 保護規則。

完成條件：

- 新商品、價格變動、價格未變、商品消失都符合 [資料流設計](data-flow.md)。
- 疑似攔截不更新正式商品與價格。
- `success_unchanged` 仍更新分類成功檢查時間。
- data-flow 測試通過。

## Phase 4：查詢 API

目標：提供第一版網站需要的 read-only API。

範圍：

- `GET /api/categories`
- `GET /api/products`
- `GET /api/products/{id}`
- `GET /api/product-images/{id}.webp`
- `GET /api/source-status`

完成條件：

- API contract 與 [API 設計](../technical/api-design.md) 一致。
- query validation、pagination、sort、status、vendor、price filter 都有測試。
- API 不觸發 crawler、不修改資料、不暴露 raw HTML、token、stack trace 或 secret。
- Public API 有 app-level in-memory rate limit 作為主機保底。

後續非阻塞項：

- Cloudflare WAF / rate limit 規則調校。
- 分散式 rate limiting。
- 有真實資料量後再做 query plan / cache 檢查。

## Phase 4.5：商品圖片資料契約

目標：在 Phase 5 前完成圖片資料策略。

範圍：

- parser 擷取、驗證與正規化 CoolPC 圖片 URL。
- DB / API / UI contract 補齊主要圖片。
- 站內小尺寸 WebP 縮圖快取與 fallback 策略。

完成條件：

- 圖片 URL allowlist 與 `invalid_image_url` 規則已測試。
- 商品列表與詳細 API 回傳站內圖片 API URL。
- 前端 fallback 不依賴 CoolPC hotlink。
- storage、備份與搬遷原則已寫入部署與資安文件。

## Phase 5：Web UI 第一版

目標：完成商品查詢與詳細頁。

範圍：

- `/` 商品查詢頁：搜尋、分類、廠商、價格、排序、分頁。
- `/products/{id}` 商品詳細頁。
- active / inactive / stale / unavailable 顯示。
- 桌面與手機 RWD。
- 非官方、非商業與來源聲明。

完成條件：

- 商品列表與詳細頁能顯示主要圖片、價格、來源與資料狀態。
- 查無商品、404、API 錯誤、stale、unavailable 都有可理解狀態。
- UI 驗收完成；影響可見行為的重構需用 Playwright 驗證。

## Phase 6：Docker 與部署準備

目標：讓專案能以 production-like Compose 運行。

範圍：

- web / crawler / migrate Docker targets。
- `compose.yml`、PostgreSQL、migration、seed、volumes。
- Cloudflare Tunnel profile。
- scheduled crawler 與 raw snapshot cleanup daemon profile。
- private validation smoke test。

完成條件：

- Docker build 成功，Compose 可啟動 app stack。
- migration / seed 可執行。
- `/api/source-status` 回 `HTTP 200`。
- `web`、PostgreSQL、crawler、tunnel、安全 headers 與 CSP gate 符合部署文件。

## Phase 7：資料流穩定期

目標：觀察實際 crawl、parse、網站顯示與來源狀態。

範圍：

- 低頻手動或明確排程 crawl。
- 補 fixture、修 parser、觀察 parse errors。
- 檢查 raw snapshot retention、inactive 判定與 stale 提示。
- 評估公開服務排程、限流與維運監控是否穩定。

完成條件：

- 主要分類可穩定解析。
- 疑似攔截會停止並保留證據。
- 網站能持續顯示最後有效資料。

## Phase 8：後續功能評估

第二版方向以 [第二版 Roadmap](v2-roadmap.md) 為準。已確認第二版不做帳號、登入、收藏、個人價格提醒或使用者導向通知。

候選方向：

- 價格歷史圖與歷史頁。
- 價格變動探索。
- 商品連結健康檢查。
- 正常瀏覽限流調整。
- 配單與 Excel 匯出。
- 營運監控 log 觀察。

進入條件：

- 第一版網站與資料流穩定。
- 文件與實作沒有明顯脫節。
- 新功能有獨立規劃與驗收邊界。
