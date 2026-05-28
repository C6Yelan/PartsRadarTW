# 系統架構

本文件描述 PartsRadarTW 第一版的技術架構與責任邊界。細部資料表、crawler 規則、API contract 與部署設定會在後續技術文件中細化。

## 架構目標

第一版架構先滿足：

- 以網站查詢體驗為主。
- crawler 可獨立執行，不影響網站請求。
- 商品與價格資料集中存放於 PostgreSQL。
- raw snapshot 可保存、去重與回放。
- 網站只讀取已成功處理的有效資料。
- 未來可接入 Discord bot，但不影響第一版網站開發。
- 未來以自架與 Docker 部署為主。

## 系統總覽

```text
User Browser
  -> Next.js Web
  -> Next.js Route Handlers
  -> Shared data access / Prisma
  -> PostgreSQL

Crawler Process
  -> 原價屋 eachview.php?IGrp={分類編號}
  -> raw snapshot storage
  -> parser / validation
  -> Shared data access / Prisma
  -> PostgreSQL

Future Discord Bot
  -> Shared data access / Prisma
  -> PostgreSQL
```

## Runtime Components

### Web App

Web app 使用 Next.js + React + TypeScript。

責任：

- 商品列表頁。
- 商品詳細頁。
- 關鍵字搜尋與分類瀏覽。
- 價格排序與基本篩選。
- 顯示資料更新時間與原價屋來源連結。

Web app 不負責直接抓取原價屋資料。

### API Layer

第一版 API 由 Next.js Route Handlers 提供。

責任：

- 提供商品列表查詢。
- 提供商品搜尋與分類篩選。
- 提供商品詳細資料。
- 只讀取已成功處理並可供網站顯示的資料。

API 不負責執行 crawler，也不在 request lifecycle 內做長時間抓取工作。

### Crawler Process

Crawler 是同一 repo 內的獨立 TypeScript process，以 Node.js 執行。

責任：

- 每 5 分鐘檢查是否可啟動下一輪 crawl cycle。
- 抓取原價屋 `eachview.php?IGrp={分類編號}` 分類頁。
- 保存與去重 raw snapshot。
- 驗證 HTTP 200 回應內容是否真的是商品頁。
- 解析商品資料與 `iBuyToken`。
- 寫入商品、價格、current price 與 crawl run 狀態。
- 疑似攔截時立即停止當次 crawl cycle。

Crawler 不放在 Next.js request / API route 內執行。

### Database

PostgreSQL 是第一版主要資料庫。

責任：

- 商品主檔。
- 價格紀錄。
- 目前價格。
- crawl run 狀態。
- raw snapshot metadata。
- parser 或資料處理異常紀錄。

資料庫 schema、migration 與 TypeScript database client 由 Prisma 管理。

### Raw Snapshot Storage

Raw snapshot 的 metadata 存入 PostgreSQL，原始 HTML 使用後壓縮保存成檔案。

責任：

- 保存可追查的原始來源內容。
- 支援 parser 修正後重跑。
- 以內容 hash 去重，避免重複保存相同 HTML。
- 一般 snapshot 最長保留 30 天。
- 異常 snapshot 最長保留 90 天。
- raw snapshot 清理不得影響長期價格歷史。

raw snapshot 的實際檔案位置與清理方式會在 crawler 或部署文件中細化。

## Repo Structure Direction

第一版採 single repository。實作時可朝下列方向組織：

```text
apps/
  web/
  crawler/
packages/
  db/
  shared/
docs/
```

說明：

- `apps/web`：Next.js 網站與查詢 API。
- `apps/crawler`：獨立 crawler process。
- `packages/db`：Prisma schema、migration 與資料庫 client。
- `packages/shared`：共用型別、常數、資料驗證與來源分類設定。
- `docs`：產品、規劃與技術文件。

實際目錄可在專案初始化時依工具限制微調，但責任邊界應維持一致。

## Data Flow

第一版資料流：

```text
原價屋分類頁
  -> crawler fetch
  -> raw snapshot metadata + compressed HTML
  -> response content validation
  -> parser
  -> product / price update
  -> current_prices
  -> API
  -> Web UI
```

資料流原則：

- HTTP 200 不代表抓取成功。
- 被判定為攔截或非預期內容時，不更新正式商品與價格資料。
- DB 商品唯一性使用 `source_category_id + ibuy_token`；需要來源識別字串時由 helper 產生 computed `source_item_key`，格式為 `coolpc:igrp:{IGrp}:ibuy:{iBuyToken}`。
- 資料完全沒變時，記錄成功檢查並更新檢查成功時間，但不新增重複價格歷史。
- 網站只讀取已成功處理的資料。

完整資料流規則以 [data-flow.md](../planning/data-flow.md) 為準。

## Web / API Boundary

Next.js 負責網站與查詢 API，但不負責背景工作。

Web / API 可以做：

- 讀取商品列表。
- 讀取商品詳細資料。
- 查詢 current price。
- 顯示資料更新時間與來源連結。

Web / API 不做：

- 直接抓取原價屋。
- 長時間排程。
- raw snapshot 清理。
- 疑似攔截重試流程。

## Crawler Boundary

Crawler process 負責所有來源資料更新。

Crawler 可以做：

- 抓取來源頁。
- 保存 raw snapshot。
- 解析商品。
- 新商品或價格變動時寫入 price snapshot。
- 更新 current price。
- 記錄抓取、解析與攔截異常。

Crawler 不做：

- 提供使用者查詢 API。
- 渲染網站畫面。
- 處理使用者帳號或個人化提醒。

## Shared Code Boundary

共用程式碼應只放真正跨元件使用的內容。

適合共用：

- 商品與價格型別。
- 原價屋分類設定。
- computed `source_item_key` 組成規則。
- Prisma client 與資料存取 helper。
- 基礎驗證工具。

不應過早共用：

- 僅單一頁面使用的 UI state。
- 僅單一 crawler step 使用的內部細節。
- 未穩定的實驗性邏輯。

## Self-Hosting Direction

未來部署以自架與 Docker 為主。第一個目標環境預計是 Ubuntu 虛擬機。

第一版自架方向可拆成：

- web service：執行 Next.js。
- crawler service：執行獨立 crawler process。
- postgres service：提供 PostgreSQL。
- snapshot storage：保存 raw snapshot 壓縮檔。

Docker Compose、反向代理、HTTPS、備份、監控與 CI/CD 等細節，後續在部署文件中再定。

## Future Discord Bot

Discord bot 不屬於第一版網站功能，但架構應保留接入空間。

未來 bot 可作為同一 repo 內另一個獨立 TypeScript process：

```text
apps/
  bot/
```

預期責任：

- 讀取使用者提醒規則。
- 查詢 current price。
- 發送價格高於或低於門檻的通知。
- 發送 crawler 異常或連續失敗通知給管理者。

Discord bot 不應直接抓取原價屋資料，價格資料來源仍以 crawler 寫入的資料庫內容為準。
