# API 設計

本文件定義 PartsRadarTW 第一版網站需要的 API contract。第一版 API 先服務自家 Next.js 網站，不承諾作為公開第三方 API。

## 設計原則

- API 只提供網站查詢需要的讀取功能。
- API 可讀取 SQL view / projection，例如 `product_list_view`，但 projection 不是資料真相來源。
- API 不應要求 crawler 為查詢方便把反正規化欄位寫回核心資料表。
- API 不負責執行 crawler。
- API 不直接抓取原價屋頁面。
- API 不暴露 raw snapshot、parse error 或 crawler 內部除錯資料。
- 商品價格以整數金額保存與回傳，第一版幣別固定為 `TWD`。
- 商品列表與商品詳細 response 需回傳主要商品圖片；圖片是第一版網站顯示所需資料，不是前端裝飾。
- 時間欄位使用 ISO 8601 字串；前端顯示時再轉成使用者介面需要的格式。
- 商品列表預設只顯示 active 商品。
- inactive 商品不從列表主動露出，但既有商品詳情連結仍可開啟並顯示商品狀態。
- crawler 失敗或疑似被攔截時，API 繼續回傳最後一次成功處理的有效資料。
- 第一版只支援原價屋 CoolPC；response 中若出現 `source: "coolpc"` 或 `source.name: "coolpc"`，是 API 固定值，不是核心 DB 欄位。

## Endpoint Overview

第一版 API 先包含：

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/categories` | 取得網站分類清單 |
| GET | `/api/products` | 商品列表、搜尋、篩選與排序 |
| GET | `/api/products/{id}` | 商品詳細資料 |
| GET | `/api/source-status` | 取得來源資料更新狀態 |

第一版不提供：

- 使用者帳號 API。
- 價格提醒 API。
- Discord bot API。
- 購物車或購買 API。
- crawler 手動觸發 API。
- raw snapshot 下載 API。
- parse error 查詢 API。

## Response Format

成功 response 直接回傳該 endpoint 的資料物件，不額外包一層 `success: true`。

錯誤 response 使用：

```json
{
  "error": {
    "code": "invalid_query",
    "message": "Invalid query parameter."
  }
}
```

常見 HTTP status：

- `200`：成功。
- `400`：查詢參數不合法。
- `404`：找不到指定商品。
- `500`：未預期伺服器錯誤。

## GET /api/categories

取得第一版網站可瀏覽的分類清單。

資料來源：

- `source_categories`

回傳欄位：

```json
{
  "data": [
    {
      "id": "category-uuid",
      "source": "coolpc",
      "igrp": 4,
      "displayName": "CPU",
      "sourceName": "處理器 CPU",
      "enabled": true,
      "lastCheckedAt": "2026-05-25T12:00:00.000Z",
      "lastSuccessAt": "2026-05-25T12:00:00.000Z"
    }
  ]
}
```

規則：

- 只回傳 `enabled = true` 的分類。
- 排序順序以網站第一版分類順序為準。
- `source` 是 API 固定回傳的來源名稱，不來自 DB 欄位。
- `igrp` 是原價屋分類外部鍵。
- `displayName` 是網站顯示名稱。
- `sourceName` 是原價屋分類名稱，用於保留來源脈絡。
- `lastCheckedAt` 代表最近一次檢查時間，不等於資料一定成功更新。
- `lastSuccessAt` 代表最近一次成功處理有效資料的時間；尚未成功時可為 `null`。

## GET /api/products

提供商品列表、搜尋、分類篩選、價格篩選與排序。

資料來源：

- 優先可讀 `product_list_view`。
- 或直接 join `products`、`current_prices`、`price_snapshots`、`source_categories`。

`product_list_view` 是普通 SQL view，由核心資料表重建而來；若 view 被刪除，可由 migration 中的 SQL 定義重新建立。

### Query Parameters

| 參數 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `q` | string | 無 | 商品關鍵字搜尋 |
| `igrp` | number | 無 | 原價屋分類編號，例如 `4` |
| `vendors` | string | 無 | 逗號分隔的廠商篩選值；需搭配 `igrp` 使用 |
| `minPrice` | number | 無 | 最低價格，整數 TWD |
| `maxPrice` | number | 無 | 最高價格，整數 TWD |
| `status` | string | `active` | `active`、`inactive` 或 `all` |
| `sort` | string | `price_asc` | 排序方式 |
| `page` | number | `1` | 頁碼，從 1 開始 |
| `pageSize` | number | `24` | 每頁筆數 |

`sort` 第一版支援：

- `price_asc`：價格低到高。
- `price_desc`：價格高到低。
- `name_asc`：商品名稱 A 到 Z。

`pageSize` 第一版上限為 `100`，避免單次查詢回傳過多資料。

### Response

```json
{
  "data": [
    {
      "id": "product-uuid",
      "name": "Intel Core Ultra 5 225F",
      "category": {
        "id": "category-uuid",
        "igrp": 4,
        "displayName": "CPU",
        "sourceName": "處理器 CPU"
      },
      "image": {
        "url": "https://www.coolpc.com.tw/path/to/product-image.jpg",
        "alt": "Intel Core Ultra 5 225F",
        "capturedAt": "2026-05-25T12:00:00.000Z"
      },
      "price": {
        "amount": 4880,
        "currency": "TWD",
        "capturedAt": "2026-05-25T12:00:00.000Z",
        "lastSeenAt": "2026-05-25T12:05:00.000Z"
      },
      "source": {
        "name": "coolpc",
        "url": "https://www.coolpc.com.tw/eachview.php?IGrp=4"
      },
      "status": {
        "isActive": true,
        "missingSince": null
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 24,
    "totalItems": 120,
    "totalPages": 5
  },
  "meta": {
    "sourceStatus": "ok",
    "lastSuccessAt": "2026-05-25T12:00:00.000Z",
    "vendors": [
      {
        "slug": "intel",
        "name": "Intel"
      }
    ]
  }
}
```

規則：

- 預設只查詢 `is_active = true` 的商品。
- `status=inactive` 只查詢 inactive 商品。
- `status=all` 同時查詢 active 與 inactive 商品。
- 無目前價格的商品第一版不出現在商品列表。
- 無有效主要商品圖片的商品不應被視為 Phase 5 ready；若暫時回傳 fallback 所需資訊，需同時保留資料完整性問題，不可把缺圖當成正常 response contract。
- `q` 應查詢 `name` 與 `normalized_name`。
- `vendors` 只接受該 `igrp` 目前可用的 `products.vendor_slug` 值，並以 DB 欄位做精準篩選。
- `meta.vendors` 回傳目前分類可用的廠商選項；未指定 `igrp` 時可為空陣列。
- 廠商欄位由 crawler/parser 依分類與商品名稱解析後寫入 `products.vendor_slug`、`products.vendor_name`，不是使用者輸入或 API 即時計算的文字搜尋條件。
- `minPrice` 與 `maxPrice` 只針對目前價格過濾。
- 價格金額、幣別與 `capturedAt` 從 `current_prices.price_snapshot_id -> price_snapshots` 取得。
- 若使用 `product_list_view`，`current_price`、`currency`、`price_captured_at` 是 view 投影欄位，不是核心表上的重複欄位。
- `source.url` 不包含 `PHPSESSID`。
- `source.name` 是 API 固定值 `coolpc`，不來自 DB 欄位。
- 第一版 `source.url` 指向原價屋分類頁，不保證能直接定位到單一商品。
- 若 query 指定 `igrp`，`meta.sourceStatus` 優先回傳該分類狀態；未指定分類時回傳全域狀態。
- API 不以獨立欄位回傳 computed `source_item_key` 或 `iBuyToken`；商品詳細頁只可在 `source.url` 中使用 `iBuy` query 組出原價屋購買導流。
- `image.url` 只回傳經 crawler 驗證與正規化後的 CoolPC 預期來源圖片 URL，不回傳 raw HTML 內未驗證 URL。
- `image.alt` 可由商品名稱產生，不需要額外爬取文字。
- `image.capturedAt` 表示主要圖片最後一次由來源資料確認的時間；若實作階段決定不公開此時間，需同步調整 API contract 與 UI 文件。
- 若內部需要追蹤圖片來源或驗證細節，應保存在 crawler / DB 內部欄位，不作為公開 API 的 raw crawler 細節回傳。

## GET /api/products/{id}

取得單一商品詳細資料。

資料來源：

- `products`
- `current_prices`
- `price_snapshots`
- `source_categories`

### Response

```json
{
  "id": "product-uuid",
  "name": "Intel Core Ultra 5 225F",
  "category": {
    "id": "category-uuid",
    "igrp": 4,
    "displayName": "CPU",
    "sourceName": "處理器 CPU"
  },
  "image": {
    "url": "https://www.coolpc.com.tw/path/to/product-image.jpg",
    "alt": "Intel Core Ultra 5 225F",
    "capturedAt": "2026-05-25T12:00:00.000Z"
  },
  "price": {
    "amount": 4880,
    "currency": "TWD",
    "capturedAt": "2026-05-25T12:00:00.000Z",
    "lastSeenAt": "2026-05-25T12:05:00.000Z",
    "priceChangedAt": "2026-05-25T12:00:00.000Z"
  },
  "source": {
    "name": "coolpc",
    "url": "https://www.coolpc.com.tw/evaluate.php?iBuy=product-token"
  },
  "status": {
    "isActive": true,
    "missingSince": null
  },
  "firstSeenAt": "2026-05-25T10:00:00.000Z",
  "lastSeenAt": "2026-05-25T12:05:00.000Z"
}
```

規則：

- 商品存在但 `isActive = false` 時仍回傳 `200`，並由 `status.isActive` 告知網站顯示商品可能暫時未出現在來源頁或已下架；此欄位不描述商品是否可購買。
- 商品不存在時回傳 `404`。
- 商品詳細頁的 `source.url` 指向原價屋 `evaluate.php?iBuy=...`，供使用者前往原價屋查看或購買該商品；不應使用分類總覽頁作為詳細頁購買導流。
- 第一版不回傳價格歷史清單。
- 第一版不回傳拆解後的商品規格欄位，只回傳原始商品名稱。
- 第一版不回傳 raw snapshot 或 parse error 細節。
- 第一版需回傳主要商品圖片；缺圖屬於資料完整性問題或來源驗證風險，不應靜默退回無圖片詳細頁。

## GET /api/source-status

提供網站判斷來源檢查狀態與最後有效資料是否可用。此 endpoint 只回傳可安全顯示給使用者的來源狀態，不回傳 crawler 內部錯誤內容。

來源狀態只描述 CoolPC crawler、parser 與 source data sync 是否正常，不代表單一商品是否可購買。API consumer 與 UI 不應把 `ok`、`stale` 或 `unavailable` 顯示成商品供應承諾。

資料來源：

- `source_categories`
- 最近成功的 crawl 狀態摘要

### Response

```json
{
  "source": "coolpc",
  "status": "ok",
  "lastCheckedAt": "2026-05-25T12:05:00.000Z",
  "lastSuccessAt": "2026-05-25T12:00:00.000Z",
  "categories": [
    {
      "igrp": 4,
      "displayName": "CPU",
      "sourceName": "處理器 CPU",
      "status": "ok",
      "lastCheckedAt": "2026-05-25T12:05:00.000Z",
      "lastSuccessAt": "2026-05-25T12:00:00.000Z"
    }
  ]
}
```

`status` 第一版概念：

- `ok`：最近一次來源擷取、內容驗證與解析成功；來源內容即使沒有變動，仍視為成功檢查。
- `stale`：目前使用最後一次有效資料，但來源更新可能延遲或最近擷取 / 解析失敗。
- `unavailable`：目前沒有可用來源資料。

分類狀態規則：

- 有效商品資料第一版以該分類存在可供網站顯示的 product + current price 判斷。
- 最近 30 分鐘內有成功檢查並處理有效資料，狀態為 `ok`。
- 超過 30 分鐘沒有成功檢查到有效來源資料，但資料庫仍有有效商品資料，狀態為 `stale`。
- 沒有任何有效商品資料，狀態為 `unavailable`。
- 30 分鐘是第一版的來源檢查健康度門檻，不代表原價屋價格應在 30 分鐘內更新；若 crawler 實際執行頻率調整，需同步重新確認此門檻。

全域狀態聚合規則：

- 所有 enabled 分類都是 `ok`，全域狀態為 `ok`。
- 至少一個 enabled 分類有有效商品資料，但不是所有分類都是 `ok`，全域狀態為 `stale`。
- 所有 enabled 分類都沒有任何有效商品資料，全域狀態為 `unavailable`。
- top-level `lastCheckedAt` 取 enabled 分類中最新的 `lastCheckedAt`。
- top-level `lastSuccessAt` 取 enabled 分類中最舊的非空 `lastSuccessAt`；若沒有任何成功分類則為 `null`。

網站顯示規則：

- `ok`：正常顯示。
- `stale`：商品仍可查詢，但網站應顯示最近未成功檢查來源，並避免暗示原價屋價格必須更頻繁更新。
- `unavailable`：網站應顯示目前沒有可用資料。

## Security And Limits

第一版 API 雖然不處理個人資料，但仍應保留基本限制：

- 查詢參數需做型別與範圍驗證。
- `pageSize` 需有上限。
- 字串搜尋需限制最大長度。
- 不把原始 HTML、crawler 錯誤堆疊或內部 token 回傳給前端。
- 不回傳未驗證圖片 URL；圖片 URL 需符合來源 allowlist。
- 不提供能觸發 crawler 或改變資料的公開 endpoint。
