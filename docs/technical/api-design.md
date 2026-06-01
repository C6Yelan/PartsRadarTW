# API 設計

第一版 API 只服務自家 Next.js 網站，不承諾第三方公開 API。所有 endpoint 都是 read-only；API 不觸發 crawler、不抓 CoolPC、不修改資料。

## 原則

- API 讀核心表、`product_list_view` 或等價 join；projection 不是資料真相來源。
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
| GET | `/api/product-images/{id}.webp` | 站內商品縮圖 |
| GET | `/api/source-status` | 來源資料狀態 |

第一版不提供帳號、提醒、Discord bot、購物、crawler trigger、raw snapshot 或 parse error API。

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
- `500` 未預期錯誤，訊息需泛用。

## `GET /api/categories`

資料來源：`source_categories`。

回傳：

- `id`
- `source: "coolpc"`
- `igrp`
- `displayName`
- `sourceName`
- `enabled`
- `lastCheckedAt`
- `lastSuccessAt`

規則：

- 只回傳 `enabled = true`。
- 排序依網站第一版分類順序。
- `lastCheckedAt` 是最近檢查，不等於成功更新。
- `lastSuccessAt` 是最近成功處理有效資料，尚未成功時可為 `null`。

## `GET /api/products`

Query：

| 參數 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `q` | string | 無 | 商品關鍵字 |
| `igrp` | number | 無 | CoolPC 分類 |
| `vendors` | string | 無 | 逗號分隔 vendor slug，需搭配 `igrp` |
| `minPrice` | number | 無 | 整數 TWD |
| `maxPrice` | number | 無 | 整數 TWD |
| `status` | string | `active` | `active`、`inactive`、`all` |
| `sort` | string | `price_asc` | `price_asc`、`price_desc`、`name_asc` |
| `page` | number | `1` | 從 1 開始 |
| `pageSize` | number | `24` | 上限 `100` |

Response shape：

- `data[]`
  - `id`
  - `name`
  - `category`
  - `image`
  - `price`
  - `source`
  - `status`
- `pagination`
- `meta.sourceStatus`
- `meta.lastSuccessAt`
- `meta.vendors`

規則：

- 預設只查 active 商品。
- 無目前價格的商品第一版不出現在列表。
- `q` 以空白切詞，每個詞都需命中名稱、normalized name 或 vendor 欄位。
- `vendors` 只接受目前分類可用的 `products.vendor_slug`。
- 價格篩選只看目前價格。
- `source.url` 不包含 `PHPSESSID`。
- 列表來源連結可指向分類頁；詳細頁購買導流需指向 `evaluate.php?iBuy=...`。
- `image.url` 使用 `/api/product-images/{productId}.webp`。
- 若指定 `igrp`，`meta.sourceStatus` 優先回傳該分類狀態。

## `GET /api/products/{id}`

資料來源：`products`、`current_prices`、`price_snapshots`、`source_categories`。

Response shape：

- `id`
- `name`
- `category`
- `image`
- `price`
- `source`
- `discussion`
- `status`
- `firstSeenAt`
- `lastSeenAt`

規則：

- 商品存在但 inactive 回 `200`，由 `status.isActive` 告知 UI。
- 商品不存在回 `404`。
- `source.url` 指向原價屋購買 / 查看導流，不含 session token。
- `discussion` 來自來源列產品介紹 / 開箱討論連結；蝦皮、PDF、driver/download 類低品質 URL 回 `null`。
- 第一版不回傳價格歷史、拆解規格、raw snapshot 或 parse error。

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

- 最近 30 分鐘內成功檢查且有有效商品資料：`ok`。
- 超過 30 分鐘但仍有有效商品資料：`stale`。
- 沒有效商品資料：`unavailable`。

全域聚合：

- 所有 enabled 分類 `ok` 才是全域 `ok`。
- 至少一個分類有有效資料但不是全部 `ok`：`stale`。
- 全部都沒有有效資料：`unavailable`。
- top-level `lastCheckedAt` 取 enabled 分類最新值。
- top-level `lastSuccessAt` 取 enabled 分類最舊非空值。

30 分鐘是 v1 健康度門檻，不代表原價屋價格應在 30 分鐘內更新。

## Security And Limits

- query 需做型別、範圍、長度與 allowlist 驗證。
- `pageSize` 必須有上限。
- 錯誤訊息泛用，不回傳 stack trace。
- API 不回傳未驗證圖片 URL。
- 不提供會觸發 crawler 或修改資料的公開 endpoint。
