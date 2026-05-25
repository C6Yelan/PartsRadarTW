# API 設計

本文件定義 PartsRadarTW 第一版網站需要的 API contract。第一版 API 先服務自家 Next.js 網站，不承諾作為公開第三方 API。

## 設計原則

- API 只提供網站查詢需要的讀取功能。
- API 不負責執行 crawler。
- API 不直接抓取原價屋頁面。
- API 不暴露 raw snapshot、parse error 或 crawler 內部除錯資料。
- 商品價格以整數金額保存與回傳，第一版幣別固定為 `TWD`。
- 時間欄位使用 ISO 8601 字串；前端顯示時再轉成使用者介面需要的格式。
- 商品列表預設只顯示 active 商品。
- inactive 商品不從列表主動露出，但既有商品詳情連結仍可開啟並顯示商品狀態。
- crawler 失敗或疑似被攔截時，API 繼續回傳最後一次成功處理的有效資料。

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
      "sourceCategoryKey": "igrp:4",
      "igrp": 4,
      "name": "CPU",
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
- `lastCheckedAt` 代表最近一次檢查時間，不等於資料一定成功更新。
- `lastSuccessAt` 代表最近一次成功處理有效資料的時間。

## GET /api/products

提供商品列表、搜尋、分類篩選、價格篩選與排序。

資料來源：

- `products`
- `current_prices`
- `source_categories`

### Query Parameters

| 參數 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `q` | string | 無 | 商品關鍵字搜尋 |
| `igrp` | number | 無 | 原價屋分類編號，例如 `4` |
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
- `updated_desc`：最近看到時間新到舊。

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
        "sourceCategoryKey": "igrp:4",
        "igrp": 4,
        "name": "CPU"
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
    "lastSuccessAt": "2026-05-25T12:00:00.000Z"
  }
}
```

規則：

- 預設只查詢 `is_active = true` 的商品。
- `status=inactive` 只查詢 inactive 商品。
- `status=all` 同時查詢 active 與 inactive 商品。
- 無目前價格的商品第一版不出現在商品列表。
- `q` 應查詢 `name` 與 `normalized_name`。
- `minPrice` 與 `maxPrice` 只針對目前價格過濾。
- `source.url` 不包含 `PHPSESSID`。
- 第一版 `source.url` 指向原價屋分類頁，不保證能直接定位到單一商品。
- API 不回傳 `source_item_key` 與 `iBuyToken`，避免把內部識別細節暴露給網站畫面。

## GET /api/products/{id}

取得單一商品詳細資料。

資料來源：

- `products`
- `current_prices`
- `source_categories`

### Response

```json
{
  "id": "product-uuid",
  "name": "Intel Core Ultra 5 225F",
  "category": {
    "id": "category-uuid",
    "sourceCategoryKey": "igrp:4",
    "igrp": 4,
    "name": "CPU"
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
    "url": "https://www.coolpc.com.tw/eachview.php?IGrp=4"
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

- 商品存在但 `isActive = false` 時仍回傳 `200`，並由 `status.isActive` 告知網站顯示下架或暫時消失狀態。
- 商品不存在時回傳 `404`。
- 第一版 `source.url` 指向原價屋分類頁，不保證能直接定位到單一商品。
- 第一版不回傳價格歷史清單。
- 第一版不回傳拆解後的商品規格欄位，只回傳原始商品名稱。
- 第一版不回傳 raw snapshot 或 parse error 細節。

## GET /api/source-status

提供網站判斷資料是否可能過期。此 endpoint 只回傳可安全顯示給使用者的來源狀態，不回傳 crawler 內部錯誤內容。

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
      "name": "CPU",
      "lastCheckedAt": "2026-05-25T12:05:00.000Z",
      "lastSuccessAt": "2026-05-25T12:00:00.000Z"
    }
  ]
}
```

`status` 第一版概念：

- `ok`：最近有成功處理有效資料。
- `stale`：一段時間內沒有成功處理有效資料，但仍可顯示最後一次有效價格。
- `unavailable`：尚未有任何可用資料。

第一版規則：

- 最近 30 分鐘內有成功處理資料，狀態為 `ok`。
- 超過 30 分鐘沒有成功處理資料，但資料庫仍有有效商品資料，狀態為 `stale`。
- 沒有任何有效商品資料，狀態為 `unavailable`。

網站顯示規則：

- `ok`：正常顯示。
- `stale`：商品仍可查詢，但網站應顯示資料可能未更新。
- `unavailable`：網站應顯示目前沒有可用資料。

## Security And Limits

第一版 API 雖然不處理個人資料，但仍應保留基本限制：

- 查詢參數需做型別與範圍驗證。
- `pageSize` 需有上限。
- 字串搜尋需限制最大長度。
- 不把原始 HTML、crawler 錯誤堆疊或內部 token 回傳給前端。
- 不提供能觸發 crawler 或改變資料的公開 endpoint。
