# Naming Conventions

本文件定義 PartsRadarTW 目前程式碼與文件應使用的命名語彙。若新功能需要新增同義詞，先確認是否已有下列既有概念；不要讓同一件事在 crawler、API、web UI 或文件中使用不同說法。

## Product Source And Links

- `source`：來源站或來源資料語境，第一版與第二版固定為 CoolPC / 原價屋。API 中 `source: "coolpc"` 是公開 attribution，不是 DB 多來源抽象。
- `sourceCategory`：來源站分類，例如 CoolPC 的 `IGrp` 分類。DB / Prisma / crawler 使用 `sourceCategory`，不要改稱 `group`、`section` 或 `categorySource`。
- `sourceCategoryUrl`：crawler / parser 內部傳遞的來源分類頁 URL。它代表資料被抓取的 `eachview.php?IGrp=...` 頁面，不代表使用者查看 / 購買連結。
- `sourceUrl`：DB / Prisma 相容欄位，對應 `products.source_url`，內容仍是來源分類頁 URL。新增內部變數時優先使用 `sourceCategoryUrl`，只有在組 Prisma data shape 或 mapper 時保留 `sourceUrl`。
- `purchaseUrl` 或 `coolpcPurchaseUrl`：由 `ibuyToken` 產生的 `evaluate.php?iBuy=...` 使用者查看 / 購買連結。新增內部變數時應使用這個語彙。
- `source.url`：目前 public API / web model 的相容欄位，內容是查看 / 購買連結。不要在新內部變數中把它叫成 `sourceUrl`；若未來要改 public shape，需另做 API migration。

## Products, Vendors, And Build List

- `product`：商品資料本體，包含來源分類、價格、圖片、狀態與連結。
- `vendor`：商品品牌 / 廠商分類，例如 GPU / RAM / power supply 的品牌篩選。不要用 `vendor` 表示來源站。
- `buildList`：使用者端一次性配單。不要使用 `cart`、`basket`、`order`、`quote` 或 `estimate` 命名，避免暗示本站可下單或代購。
- `BuildListProduct`：可加入配單的商品資料快照。
- `BuildListItem`：已在配單中的品項，等於 `BuildListProduct` 加上 `quantity`、`addedAt` 與 `updatedAt`。
- `useBuildList` 對外操作需包含 `BuildList` 語彙，例如 `addBuildListProduct`、`setBuildListItemQuantity`、`removeBuildListItem`、`restoreBuildListItem`、`clearBuildListItems`。

## Time Fields

- `fetchedAt`：crawler 抓到來源頁或 raw snapshot 的時間。
- `capturedAt`：price snapshot / image record 被收錄的時間。
- `observedAt`：public price-history point 對使用者呈現的觀測時間。
- `lastSeenAt`：crawler 最近一次確認商品或目前價格仍存在的時間。
- `lastCheckedAt`：來源分類或 smoke 類檢查的最近檢查時間。
- `lastSuccessAt`：來源分類最近一次成功處理有效資料的時間。
- `checkedAt`：單次 smoke check 的檢查時間。
- `createdAt` / `updatedAt`：DB row lifecycle，不要用來表示來源站資料新鮮度。

## Status And State

- `status`：資料模型、public API 或 persisted result 的狀態值，例如 product active status、source status、crawl run status。
- `state`：React component / hook 的本機 UI 狀態，例如 `productState`、`categoryState`、`historyState`。
- `loadState`：只用於 UI loading lifecycle。不要用 `status` 表示 loading / ready / error 這種 component lifecycle。

## Existing Compatibility Names

下列名稱已是 public API 或 DB contract，短期內保留，但新增程式碼應避免擴大歧義：

- `source.url`：public 商品 response 的查看 / 購買連結。內部新變數應叫 `purchaseUrl`。
- price-history point 的 `observationType`：表示價格觀測點來源，例如 `price_snapshot` 或 `current_price_confirmation`。`source` 仍是相同值的 public API 相容 alias；內部新程式碼應使用 `observationType`。

## File Path Comments

Repo-relative path comments are optional. They may be useful in larger generated files, but they are not required for small files and are not enforced by `pnpm test`.

Prefer clear folder boundaries, file names, exports, and editor / git path context over mandatory source comments. Moving a file should not require unrelated test updates just to refresh a comment.
