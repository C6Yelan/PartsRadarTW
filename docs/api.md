# Public API

PartsRadarTW 的公開 API 主要服務官方 web UI，response contract 可能隨網站更新而調整。

所有價格都是整數 TWD，時間為 ISO 8601。API 不需要登入。

## Endpoints

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/categories` | 目前啟用的公開分類。 |
| `GET` | `/api/products` | 商品搜尋、篩選、排序與分頁。 |
| `GET` | `/api/price-report` | 唯讀價格變動總覽。 |
| `GET` | `/api/products/{id}` | 單一商品與目前價格。 |
| `GET` | `/api/products/{id}/price-history` | 商品價格歷史觀測點。 |
| `GET` | `/api/product-images/{id}.webp` | 站內 WebP 商品圖片。 |
| `GET` | `/api/source-status` | Crawler／來源資料 freshness。 |
| `POST` | `/api/build-list/refresh` | Read-only 批次刷新瀏覽器配單商品。 |

## 商品列表 query

`GET /api/products`

| Parameter | 規則 |
| --- | --- |
| `q` | 最多 100 字；空白分隔 token 必須各自命中名稱或品牌欄位。 |
| `category` | 公開 category slug。 |
| `vendors` | 逗號分隔且不可重複；必須同時提供 category。 |
| `facet` | 可重複的 `key:value`；必須同時提供 `category`，最多 50 筆。單筆 trim 後須為 1–100 字、不可重複，且必須是該分類支援的值。 |
| `minPrice`, `maxPrice` | 非負整數，且 min 不得大於 max。 |
| `status` | `active`、`inactive` 或 `all`；預設 `active`。 |
| `sort` | `price_asc`、`price_desc`、`price_drop_desc`、`price_rise_desc`、`name_asc`。 |
| `page` | 從 1 開始；預設 1。 |
| `pageSize` | 預設 20，最大 100。 |

同一 facet key 的多個值使用 OR，不同 key 之間使用 AND。可用 key、label 與 value 由
`GET /api/categories` 回應的 `facets` 提供。

列表回應包含：

- `data`：商品 ID、名稱、分類、站內圖片、目前價格、原價屋連結、active 狀態與近 30 天價格變動。
- `pagination`：目前頁、page size、總筆數與總頁數。
- `meta`：來源狀態、最近成功時間與目前分類可用品牌選項。

API 不公開 standalone `ibuyToken`；原價屋連結在 response 組裝時重建。

## 公開分類

`GET /api/categories` 只回傳目前啟用的分類。每筆分類包含 `id`、`slug`、`displayName`、
`sourceName` 與 `facets`；沒有高效益進階條件的分類可回傳空的 `facets`。

每個 facet 定義包含穩定 key、顯示 label 與允許的 options，供商品列表組裝合法的 repeatable
`facet=key:value` query。Client 不應自行猜測未出現在分類回應中的 tag。

## 價格變動總覽

`GET /api/price-report` 只讀取既有價格快照，不會建立通知、訂閱或 delivery 紀錄。

| Parameter | 規則 |
| --- | --- |
| `window` | `24h`、`7d` 或 `30d`；預設 `24h`。 |
| `type` | 可重複且不可重複值；`drop`、`rise`、`new`。預設為 `drop` 與 `rise`。 |
| `category` | 可重複的公開 category slug；未提供代表全部分類。值必須唯一且為已支援的 semantic slug，duplicate 或 unknown value 會回傳 invalid query。 |
| `q` | 可選商品關鍵字，最多 100 字。 |
| `sort` | `changed_desc`、`drop_percent_desc`、`rise_percent_desc` 或 `delta_amount_desc`；預設 `changed_desc`。 |
| `page` | 從 1 開始；預設 1。 |
| `pageSize` | 預設 20，最大 100。 |

單一分類可使用 `GET /api/price-report?category=cpu`；多分類使用 repeated parameter，
例如 `GET /api/price-report?category=cpu&category=gpu`。分類值不使用逗號字串，也不在公開 URL 暴露 IGrp。

回應包含：

- `data`：`productId`、`productName`、`category`、`kind`、`previousPrice`、`currentPrice`、`currency`、`deltaAmount`、`deltaPercent` 與 `changedAt`。
- `summary`：篩選後、分頁前的漲價、降價與新增商品統計。
- `pagination`：目前頁、page size、總筆數與總頁數。
- `meta`：`window`、`since`、`until`、`sourceStatus` 與 `lastSuccessAt`。

## 商品詳細與價格歷史

商品 ID 必須是 UUID。不存在、來源分類停用或沒有目前價格時回傳 `404`。

`GET /api/products/{id}/price-history` 接受：

- `range=7d|30d|90d|all`，預設 `90d`。
- 相容 query `days=7|30|90`。

Response 包含 `range`、`rangeDays` 與 `points`。每個 point 提供 `amount`、UTC ISO 格式的 `observedAt`，以及 `price_snapshot` 或 `current_price_confirmation` observation type。`range=all` 仍受資料庫實際保留資料限制。

## 配單 refresh

`POST /api/build-list/refresh` 只讀取商品，不保存使用者配單。

Request：

```http
Content-Type: application/json

["11111111-1111-4111-8111-111111111111"]
```

限制：

- Body 最大 4096 bytes。
- 只接受 raw UUID array，不接受 query parameters。
- 最多 50 筆；重複 ID 會保留第一次出現的順序並去重。

Response：

```json
{
  "data": [],
  "missingProductIds": []
}
```

`missingProductIds` 表示目前無法取得的 ID；inactive 或暫時沒有價格的商品仍可能以 nullable 欄位回傳，讓瀏覽器保留使用者 intent。

## 商品圖片

`GET /api/product-images/{id}.webp` 只讀取本地 product image volume。路徑 ID 會正規化並驗證，response 使用 `image/webp`、`nosniff` 與一小時 public cache。

來源圖片 URL、storage path 與 raw bytes location 不會出現在 public contract。

## Source status

`GET /api/source-status` 彙整所有啟用分類的最近檢查與成功時間，狀態為 `ok`、`stale` 或 `unavailable`。

這是 crawler／parser／來源資料健康訊號，不是商品庫存、商家營業狀態或購買建議。

## Errors

```json
{
  "error": {
    "code": "invalid_query",
    "message": "Invalid query parameter."
  }
}
```

| HTTP | Code | 說明 |
| ---: | --- | --- |
| 400 | `invalid_query` | Query 不合法。 |
| 400 | `invalid_request` | Body、content type 或 request shape 不合法。 |
| 404 | `not_found` | 資源不存在或不可公開。 |
| 429 | `rate_limited` | 超過目前 process 的 rate limit。 |
| 500 | `internal_error` | 泛用錯誤，不公開內部原因。 |

成功與錯誤 response 都可能包含 `X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`；429 另包含 `Retry-After`。

API 永不公開 raw snapshot、parse error、stack trace、DB connection、env secret 或原始來源圖片 URL。
