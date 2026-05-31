# 測試策略

本文件定義 PartsRadarTW 第一版的測試方向。第一版以 Vitest、TypeScript type check、Biome、Next.js build 與手動驗收為主，先避免導入過多測試工具。

## 測試目標

第一版測試需確認：

- crawler 能穩定解析原價屋分類頁。
- HTTP 200 但內容異常時，不會更新正式商品與價格。
- 商品識別與價格更新規則正確。
- 資料未變時，不會新增重複 price snapshot。
- API 查詢參數、分頁、排序與狀態處理符合 contract。
- 網站能正確顯示 active、inactive、stale 與 unavailable 狀態。
- 正式開發每個階段都有明確驗收點，避免一次累積太多未驗證變更。

## 第一版測試工具

第一版使用：

| 工具 | 用途 |
| --- | --- |
| Vitest | parser、資料處理、API 邏輯與 shared utils 測試 |
| TypeScript type check | 檢查型別錯誤 |
| Biome | 檢查 lint 與執行 format |
| Next.js build | 確認 Next.js production build 可正常編譯 |
| 手動驗收 checklist | 檢查網站操作流程與部署後狀態 |

第一版不先導入：

- 瀏覽器 E2E 測試工具。
- 大型視覺回歸測試。
- 壓力測試工具。
- 每次測試都實際連線原價屋的自動化測試。

若後續 UI 流程變多、回歸成本變高，再評估 Playwright 或其他 E2E 工具。

## 測試資料與 Fixtures

Crawler 與 parser 測試應優先使用 fixture。

Fixture 原則：

- 使用保存下來的原價屋 HTML 片段或完整頁面。
- fixture 不應包含 `PHPSESSID`。
- fixture 應避免放入不必要的大量原始內容。
- fixture 需標明來源頁類型與取得日期。
- parser 測試不可每次都實際打原價屋網站。
- 若 fixture 來自異常頁或疑似攔截頁，應明確命名與分類。

建議 fixture 類型：

- 正常 CPU 分類頁。
- 商品缺少 `div.w`。
- 商品缺少 `div.t`。
- 商品缺少可解析價格。
- HTTP 200 但內容不是商品頁。
- 商品清單與價格完全相同。
- 商品價格變動。
- 商品從來源消失。

## Crawler Parser 測試

Crawler parser 測試使用 Vitest。

至少測試：

- 能從正常 fixture 解析出 `div.w`、`div.t`、`div.x`。
- 能取得 `iBuyToken`。
- 能取得商品原始名稱。
- 能從 `含稅：NT4880` 解析出整數價格 `4880`。
- 能解析 `NT4,880`、`$4880`、`$4,880`。
- 能產生 computed `source_item_key`：`coolpc:igrp:{IGrp}:ibuy:{iBuyToken}`。
- 缺少 `iBuyToken` 時不匯入正式商品。
- 缺少商品名稱時不匯入正式商品。
- 缺少可解析價格時不匯入正式商品。
- 同一分類同一 snapshot 內出現相同 `iBuyToken`、商品名稱與價格時，可去重後只保留一筆。
- 同一分類同一 snapshot 內相同 `iBuyToken` 對應不同商品名稱或價格時，標記為解析異常。

## Response Validation 測試

HTTP status 不足以判斷成功，需測試內容驗證。

至少測試：

- 正常分類頁可通過 validation。
- 缺少 `div.w` 時標記為 `suspected_block` 或 `invalid`。
- 缺少 `div.t` 時標記為 `suspected_block` 或 `invalid`。
- 缺少 `div.x` 時標記為 `suspected_block` 或 `invalid`。
- HTTP 200 但內容不是商品頁時，不進入 product upsert。
- validation 失敗時不寫入 price snapshot。
- validation 失敗時不更新 current price。

攔截頁特徵需以實際保存的異常 snapshot 補充，不憑空寫死文字。

## Data Flow 測試

資料流測試確認 crawler 寫入規則。

至少測試：

- 新商品第一次出現時建立 product、price snapshot 與 current price。
- product 使用 `source_category_id + ibuy_token` 作為唯一性，不保存 `source_item_key`、`source` 或 `igrp`。
- 價格變動時新增 price snapshot 並更新 current price。
- current price 只保存 `price_snapshot_id`、`last_seen_at`、`price_changed_at` 與 `updated_at`，價格值需從 price snapshot 取得。
- current price 指向的 price snapshot 必須屬於同一個 product。
- `crawl_runs` 不保存 `checked_category_count`、`changed_category_count` 或 `error_category_key`；相關摘要需由 `crawl_run_category_results` 推得。
- 價格未變時不新增重複 price snapshot。
- `success_unchanged` 仍會更新分類 `last_success_at`。
- 每個被嘗試處理的分類都會寫入 `crawl_run_category_results`，不寫入 `crawl_runs.category_results` JSON。
- parsed result hash 相同時走 `success_unchanged` 流程。
- raw content hash 相同時不重複保存 HTML 壓縮檔。
- raw snapshot metadata 或檔案清理不會刪除 price snapshots。
- 沒有 `iBuyToken` 的商品不寫入 products，但保留解析紀錄。
- raw snapshot 與 parse error 透過 `source_category_id` 取得 `IGrp` 與原價屋分類名稱，不重複保存 `source` 或 `igrp`。
- `invalid_image_url` parse error 需保存內部用 `raw_image_url`；非圖片錯誤維持 `raw_image_url = null`。
- 商品從來源消失時不刪除 product。
- 商品從來源消失時不刪除 price snapshots。
- 商品重新出現且 `source_category_id + ibuy_token` 相同時延續原商品歷史。
- fetch 失敗、疑似攔截或 parse 失敗時不覆蓋既有 current price。
- fetch 失敗、疑似攔截或 parse 失敗會更新 `last_checked_at`，但不更新 `last_success_at`。
- parse 失敗不累計商品 missing count。

## API 測試

API 測試可先以 route handler 內的查詢邏輯或資料存取函式為單位，不一定一開始就做完整 HTTP server 測試。

商品列表查詢可讀 `product_list_view` 或等價 join。若測試使用 view，需確認 view 欄位由核心資料表投影而來，crawler 不直接寫入 projection。

至少測試：

- `GET /api/categories` 只回傳 enabled 分類。
- `GET /api/categories` 回傳 `displayName` 與 `sourceName`。
- `GET /api/products` 預設只回傳 active 商品。
- `GET /api/products` 可依 `q` 查詢商品。
- `GET /api/products` 可依 `igrp` 篩選分類。
- `GET /api/products` 可依 `minPrice`、`maxPrice` 篩選目前價格。
- `GET /api/products` 回傳主要商品圖片 URL、alt text 與圖片確認時間。
- `GET /api/products` 若讀 `product_list_view`，價格、幣別與 captured time 仍以 price snapshot 為真相來源。
- `GET /api/products` 支援 `price_asc`、`price_desc`、`name_asc`。
- `GET /api/products` 支援分頁並限制 `pageSize` 上限。
- 不合法 query 回傳 `400` 與泛用 `invalid_query`。
- 商品不存在時 `GET /api/products/{id}` 回傳 `404`。
- 商品詳情回傳主要商品圖片 URL、alt text 與圖片確認時間。
- inactive 商品詳情仍可回傳 `200` 並標示 inactive。
- `GET /api/source-status` 能區分 `ok`、`stale`、`unavailable`。
- `GET /api/source-status` 能依 enabled 分類聚合全域狀態。
- `GET /api/source-status` 的 `categories[]` 含分類層級狀態。
- `GET /api/source-status` 的 top-level `lastCheckedAt` / `lastSuccessAt` 符合聚合規則。

API 測試不應暴露：

- computed `source_item_key`。
- `iBuyToken`。
- raw snapshot。
- parse error。
- 內部錯誤堆疊。

## Web UI 驗收

第一版 UI 先使用手動驗收 checklist，不先導入瀏覽器 E2E。

首頁至少驗收：

- 預設商品列表可載入。
- 搜尋字串會反映在 URL query。
- 分類篩選可運作。
- 價格篩選可運作。
- 排序可運作。
- 分頁可運作。
- 查無商品時顯示空狀態。
- `stale` 時顯示最近未成功檢查來源的低干擾提示，避免暗示原價屋價格必須更頻繁更新。
- `unavailable` 時不誤顯示為查無商品。
- 手機版 RWD 可正常搜尋與瀏覽。

商品詳細頁至少驗收：

- active 商品可開啟。
- inactive 商品可開啟並顯示狀態提示。
- 商品不存在時顯示找不到商品。
- 商品詳細頁完整顯示原始商品名稱，不要求拆解規格欄位。
- 來源連結可開啟原價屋分類頁。
- 來源連結不包含 `PHPSESSID`。

## Deployment Smoke Test

正式部署流程建立後，至少應有手動 smoke test。

Phase 6 private validation 階段的 smoke test 應先限制在 Docker / Compose / DB / web API，不公開流量也不做 live crawl。

private validation 檢查：

- `docker compose config` 可解析。
- Docker build 成功。
- `migrate` service 可執行並以 exit code 0 結束。
- `seed` service 可執行並以 exit code 0 結束。
- `postgres` healthy。
- `web` healthy。
- `/api/source-status` 回 `HTTP 200`。
- `/api/source-status` response 內含 8 個第一版 CoolPC 分類。
- `web` 只綁定 `127.0.0.1:3000`，不直接對外公開。
- `crawler` manual profile 可顯示 help / 參數說明，但不執行 live fetch。
- snapshot storage 與 product image cache volume 可由 crawler container 寫入。

公開前或正式網域階段再補的 smoke test：

- Cloudflare Tunnel `public-tunnel` profile 可啟動。
- 正式網域 HTTPS 可連線。
- production CSP / report-only 決策已驗證。
- 首頁可透過正式 URL 載入。
- 商品列表可透過正式 URL 查詢。
- 商品圖片 API 可透過正式 URL 回應。
- crawler 成功寫入一輪有效資料，或明確記錄失敗原因。

若 crawler 發現疑似攔截，部署驗收應停止 crawler 並保留異常內容供檢查，不應用重試硬打來源站。

## 開發階段驗收

正式開發時，每個階段結束前至少做對應檢查。

### 文件階段

- `git diff --check`
- 文件索引已更新。
- 待決事項沒有和已確認決策互相衝突。

### 專案初始化階段

- `pnpm install`
- `pnpm check`
- `pnpm test`

### 資料模型階段

- Prisma schema 可產生 client。
- migration 可在本機 PostgreSQL 執行。
- 基本 seed 或測試資料可建立。
- SQL view / projection 可由 migration 建立，且可由核心表重建。

### Crawler 階段

- parser fixture tests 通過。
- response validation tests 通過。
- data flow tests 通過。
- 不使用 live 原價屋請求作為常規測試。

### API 階段

- API query 邏輯 tests 通過。
- 錯誤狀態 tests 通過。
- 不暴露內部欄位。
- 圖片資料流可用 `pnpm smoke:coolpc-image-flow` 手動驗證 raw HTML -> crawler -> DB -> product API；此 smoke 使用 rollback transaction，不保留 DB 測試資料。

### Web UI 階段

- `pnpm check` 通過。
- 商品查詢頁手動驗收完成。
- 商品詳細頁手動驗收完成。
- 桌面與手機版 RWD 基本檢查完成。

### 部署階段

- Docker build 成功。
- migration 可執行。
- seed 可執行並建立第一版分類。
- services 可啟動。
- `/api/source-status` 回 `HTTP 200`。
- smoke test 完成。

## Live Fetch 測試規則

實際連線原價屋的測試只能手動執行，不放進常規自動化測試。

規則：

- 遵守 crawler 5 分鐘週期。
- 不重疊啟動 crawler。
- 疑似攔截時立即停止。
- 保存異常 snapshot。
- 不用快速重試硬打來源站。
- 測試結果應轉成 fixture 或 raw snapshot，供後續離線測試使用。
