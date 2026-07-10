# API 設計

API 只服務自家 Next.js 網站，不承諾第三方公開 API。所有 endpoint 都是 read-only；API 不觸發 crawler、不抓 CoolPC、不修改資料。

## 原則

- API 讀核心表並用 join 組出網站 read shape；若未來新增 projection，也不是資料真相來源。
- 商品價格以整數 TWD 回傳。
- 時間欄位使用 ISO 8601 字串。
- crawler 失敗時仍回傳最後一次成功處理的有效資料。
- `source: "coolpc"` 是 API 固定值，不是核心 DB 欄位。
- API 不暴露 raw snapshot、parse error、crawler stack、computed `source_item_key`、獨立 `iBuyToken`、DB 連線或 env。
- 商品圖片回傳站內圖片 API URL，不回傳未驗證來源圖作為前端顯示 URL。

## Endpoints

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/categories` | 分類清單 |
| GET | `/api/products` | 商品列表、搜尋、篩選、排序、分頁 |
| GET | `/api/products/{id}` | 商品詳細 |
| GET | `/api/products/{id}/price-history` | 商品價格歷史 |
| GET | `/api/product-images/{id}.webp` | 站內商品縮圖 |
| GET | `/api/source-status` | 來源資料狀態 |

公開網站 API 不提供帳號、個人提醒、購物、crawler trigger、raw snapshot 或 parse error API。第三版 Discord bot 個人通知應由 bot daemon / internal worker 直接使用受控的 DB 存取與專用資料表，不把網站商品查詢 API 擴成第三方 API 或個人化通知 API。

## Response Format

成功 response 直接回傳 endpoint 資料，不包 `success: true`。

錯誤 response：

```json
{
  "error": {
    "code": "invalid_query",
    "message": "Invalid query parameter."
  }
}
```

常見狀態碼：

- `200` 成功。
- `400` query 不合法。
- `404` 商品或圖片不存在。
- `429` 同一 client 在短時間內請求過多。
- `500` 未預期錯誤，訊息需泛用。

## `GET /api/categories`

資料來源：`source_categories`。

回傳：

- `id`
- `slug`：public category slug，例如 `cpu`、`gpu`
- `displayName`
- `sourceName`

規則：

- 只回傳 `enabled = true`。
- 排序依目前啟用分類順序。
- `slug` 由 web/API boundary 的單一 mapping 從 internal CoolPC `igrp` 產生，不寫入 DB。
- enabled 分類若缺少 slug mapping，回傳泛用 `500`，不靜默省略分類。

## `GET /api/products`

Query：

| 參數 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `q` | string | 無 | 商品關鍵字 |
| `category` | string | 無 | Public category slug；API boundary 轉成 internal CoolPC `igrp` |
| `igrp` | number | 無 | 暫時保留的 legacy read-only alias，不由網站產生 |
| `vendors` | string | 無 | 逗號分隔 vendor slug，需搭配分類 |
| `minPrice` | number | 無 | 整數 TWD |
| `maxPrice` | number | 無 | 整數 TWD |
| `status` | string | `active` | `active`、`inactive`、`all` |
| `sort` | string | `price_asc` | `price_asc`、`price_desc`、`price_drop_desc`、`price_rise_desc`、`name_asc` |
| `page` | number | `1` | 從 1 開始 |
| `pageSize` | number | `24` | 上限 `100` |

Response shape：

- `data[]`
  - `id`
  - `name`
  - `category`
  - `image`：缺少主要圖片資料時為 `null`，由前端顯示 fallback
  - `price`
  - `priceMovement`
  - `source`
  - `status`
- `pagination`
- `meta.sourceStatus`
- `meta.lastSuccessAt`
- `meta.vendors`

規則：

- 預設只查 active 商品。
- `category` 與 legacy `igrp` 同時存在時必須指向同一分類；不一致、未知 slug 或未 mapping 的 `igrp` 回 `400`，且不讀 DB。
- 無目前價格的商品第一版不出現在列表。
- `q` 以空白切詞，每個詞都需命中名稱、normalized name 或 vendor 欄位。
- `vendors` 只接受目前分類可用的 `products.vendor_slug`。
- 價格篩選只看目前價格。
- `priceMovement` 固定描述近 30 天價格變動；資料不足或沒有變動基準時 `deltaAmount` / `deltaPercent` 為 `null`。
- `price_drop_desc` 與 `price_rise_desc` 依近 30 天變動排序，仍只回 read-only API 處理後的公開欄位。
- `source.url` 指向原價屋查看 / 購買導流，使用 `evaluate.php?iBuy=...` 且不包含 `PHPSESSID`。
- 有圖片資料時 `image.url` 使用 `/api/product-images/{productId}.webp`；缺圖不影響商品列出。
- 若指定分類，`meta.sourceStatus` 優先回傳該分類狀態。

## `GET /api/products/{id}`

資料來源：`products`、`current_prices`、`price_snapshots`、`source_categories`。

Response shape：

- `id`
- `name`
- `category`
- `image`：缺少主要圖片資料時為 `null`，由前端顯示 fallback
- `price`
- `source`
- `status`
- `firstSeenAt`
- `lastSeenAt`

規則：

- 商品存在但 inactive 回 `200`，由 `status.isActive` 告知 UI。
- 商品不存在回 `404`。
- 缺少主要圖片資料不等於商品不存在；詳細頁仍回 `200`，`image` 為 `null`。
- `source.url` 指向原價屋購買 / 查看導流，不含 session token。
- 詳情頁以 `status.isActive` 與 `price.lastSeenAt` 顯示保守的商品可用性提示；API 不回傳連結檢查狀態。
- 商品詳細 endpoint 不內嵌價格歷史、拆解規格、raw snapshot 或 parse error；價格歷史由獨立 endpoint 讀取。

## `GET /api/products/{id}/price-history`

資料來源：`products`、`price_snapshots`、`current_prices`、`source_categories`。

Query：

| 參數 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `range` | string | `90d` | 接受 `7d`、`30d`、`90d`、`all`；`all` 代表該商品保留中的全部價格歷史 |
| `days` | number | `90` | 舊版相容參數；未提供 `range` 時生效，僅接受 `7`、`30`、`90` |

Response shape：

- `productId`
- `range`：`7d`、`30d`、`90d`、`all`
- `rangeDays`：`range=all` 時為 `null`；其餘為 `7`、`30`、`90`
- `points[]`
  - `amount`
  - `currency`
  - `observedAt`
  - `source`
- `summary`
  - `pointCount`
  - `startedAt`
  - `endedAt`
  - `lowest`
  - `highest`
  - `first`
  - `latest`
  - `deltaAmount`
  - `deltaPercent`

規則：

- 只回傳有目前價格且來源分類啟用商品的價格歷史；商品不存在、分類停用或無目前價格時回 `404`。缺少主要圖片資料不影響價格歷史查詢。
- `days` 以目前時間回推，且只接受固定 allowlist，避免任意大型歷史查詢。
- 價格歷史只讀 `price_snapshots` 與 `current_prices`，不觸發 crawler，也不依賴 raw snapshot 檔案。
- `points` 依 `observedAt` 由舊到新排序。
- `observationType = "price_snapshot"` 代表新商品或價格變動建立的 snapshot。
- 若目前價格在 snapshot 後又被 crawler 看到且未變價，加入 `observationType = "current_price_confirmation"` 確認點，讓 UI 能畫出水平線。
- `source` 保留為與 `observationType` 相同值的相容欄位，既有 client 可繼續讀取。
- 價格摘要只描述資料庫已記錄或確認的價格觀測點，不代表來源站更新頻率保證。

## `GET /api/product-images/{id}.webp`

用途：讀取後端設定的站內 WebP 縮圖。

規則：

- `{id}` 接受 product UUID，副檔名固定 `.webp`。
- 實體路徑由 `PRODUCT_IMAGE_STORAGE_DIR` 決定。
- 成功回 `Content-Type: image/webp` 與 `X-Content-Type-Options: nosniff`。
- 不存在或 id 不合法回 `404`，由前端 fallback。
- 此 endpoint 不在訪客請求期間抓來源站圖片。

## `GET /api/source-status`

用途：讓網站判斷資料健康度；不回傳 crawler 內部錯誤內容。

Response shape：

- `source: "coolpc"`
- `status`
- `lastCheckedAt`
- `lastSuccessAt`
- `categories[]`

狀態：

- `ok`：最近成功檢查並處理有效資料。
- `stale`：仍有有效資料，但最近來源檢查可能失敗或延遲。
- `unavailable`：沒有任何可用來源資料。

分類規則：

- 最近 60 分鐘內成功檢查且有有效商品資料：`ok`。
- 超過 60 分鐘但仍有有效商品資料：`stale`。
- 沒有效商品資料：`unavailable`。

全域聚合：

- 所有 enabled 分類 `ok` 才是全域 `ok`。
- 至少一個分類有有效資料但不是全部 `ok`：`stale`。
- 全部都沒有有效資料：`unavailable`。
- top-level `lastCheckedAt` 取 enabled 分類最新值。
- top-level `lastSuccessAt` 取 enabled 分類最舊非空值。

60 分鐘是 v1 健康度門檻，配合 30 分鐘 crawler 週期，避免排程邊界造成誤判；這不代表原價屋價格應在 60 分鐘內更新。

## Security And Limits

- query 需做型別、範圍、長度與 allowlist 驗證。
- `pageSize` 必須有上限。
- 錯誤訊息泛用，不回傳 stack trace。
- API 不回傳未驗證圖片 URL。
- 不提供會觸發 crawler 或修改資料的公開 endpoint。
- 公開 API 有 app-level in-memory rate limit 作為主機保底；大量流量仍應優先由 Cloudflare / WAF 擋在主機外。
- 預設 `api:read` 為每 client 每 60 秒 120 次，涵蓋 categories、source-status 與 product detail。
- 預設 `api:list` 為每 client 每 60 秒 360 次，涵蓋商品列表查詢，避免正常快速切分類、翻頁或排序時被一般 read 額度誤傷。
- 預設 `api:image` 為每 client 每 60 秒 1200 次，涵蓋商品縮圖 API；pageSize 50 的正常瀏覽會一次載入大量圖片，圖片額度需比 list 額度更寬。
- 正常快速切分類、翻頁、排序與載入列表圖片不應輕易觸發 `429`；production 需確認 list / image 額度與 client identity header 實際生效。
- 成功 response 回傳 `X-RateLimit-*` headers 方便 production smoke 判斷 bucket 狀態；超限回 `429` 與 `Retry-After` / `X-RateLimit-*` headers；response 不回傳 IP、env、DB 或 internal state。
