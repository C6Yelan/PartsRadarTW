# Naming Conventions

本文件定義 PartsRadarTW 目前程式碼與文件應使用的命名語彙。若新功能需要新增同義詞，先確認是否已有下列既有概念；不要讓同一件事在 crawler、API、web UI 或文件中使用不同說法。

## Product Source And Links

- `source`：來源站或來源資料語境，第一版與第二版固定為 CoolPC / 原價屋。API 中 `source: "coolpc"` 是公開 attribution，不是 DB 多來源抽象。
- `sourceCategory`：來源站分類，例如 CoolPC 的 `IGrp` 分類。DB / Prisma / crawler 使用 `sourceCategory`，不要改稱 `group`、`section` 或 `categorySource`。
- `category` / `category slug`：網站 URL 與商品列表 API 使用的產品語意分類，例如 `cpu`、`gpu`。只在 web/API boundary 對應 internal `igrp`，不新增 DB slug 欄位。
- `igrp`：CoolPC 來源分類代碼，保留在 DB、Prisma、crawler 與內部 domain model。Public products query 只把它當作暫時的 legacy read-only alias，新 URL 與 client query 不得產生它。
- `sourceCategoryUrl`：crawler / parser 內部傳遞的來源分類頁 URL。它代表資料被抓取的 `eachview.php?IGrp=...` 頁面，不代表使用者查看 / 購買連結。
- `sourceUrl`：DB / Prisma 相容欄位，對應 `products.source_url`，內容仍是來源分類頁 URL。新增內部變數時優先使用 `sourceCategoryUrl`，只有在組 Prisma data shape 或 mapper 時保留 `sourceUrl`。
- `purchaseUrl` 或 `coolpcPurchaseUrl`：由 `ibuyToken` 產生的 `evaluate.php?iBuy=...` 使用者查看 / 購買連結。新增內部變數時應使用這個語彙。
- `source.url`：目前 public API / web model 的相容欄位，內容是查看 / 購買連結。不要在新內部變數中把它叫成 `sourceUrl`；若未來要改 public shape，需另做 API migration。

## Products, Vendors, And Build List

- `product`：商品資料本體，包含來源分類、價格、圖片、狀態與連結。
- `vendor`：商品品牌 / 廠商分類，例如 GPU / RAM / power supply 的品牌篩選。不要用 `vendor` 表示來源站。
- `buildList`：使用者端一次性配單。不要使用 `cart`、`basket`、`order`、`quote` 或 `estimate` 命名，避免暗示本站可下單或代購。
- `BuildListIntent`：localStorage v2 保存的使用者意圖，只含 product ID、數量、排序與加入／更新時間。
- `BuildListProductSnapshot`：配單頁當次 batch refresh 的記憶體商品資料，不持久化為 last-known truth。
- `BuildListItem`：依 intent 順序組合 `BuildListIntent`、nullable `BuildListProductSnapshot` 與 availability 的頁面列。
- `useBuildList` 對外操作需包含 `BuildList` 語彙，例如 `addBuildListProduct`、`setBuildListItemQuantity`、`removeBuildListItem`、`restoreBuildListItem`、`clearBuildListItems`。

## Time Fields

- 週期、backoff、lock stale、TTL 與 retry delay 若以秒為部署契約，程式名稱使用 `Seconds`、env 使用 `_SECONDS`；HTTP timeout、來源 request delay 與 timer/sleep 邊界使用 `Ms`、`_MS`。
- 分鐘、小時與天數門檻保留 `Minutes`、`Hours`、`Days`；時間數值不得只叫 `interval`、`timeout`、`delay` 或 `retryAfter`。Timer handle 使用 `timeoutId` / `timer`，不假裝是 duration。
- 秒轉毫秒只在 `sleep`、`setTimeout`、排程 Date 計算等 timer 邊界；已是毫秒的 provider/API 值不可重複轉換。
- DB、public API、machine state JSON 與 structured machine log 使用 UTC `Date` / ISO timestamp。Web 與 Discord 使用者可見時間使用 `Asia/Taipei`；maintainer CLI 與 admin webhook 以台北時間為主要顯示，附 UTC 時必須明確標示。
- Formatter owner 維持 app-local：web 使用 `apps/web/app/_shared/time.ts`，Discord bot 使用 `apps/crawler/src/scripts/ops/discord-bot/message-text.ts`，crawler 維運摘要使用 `apps/crawler/src/scripts/ops/shared/time.ts`；不要建立跨 monorepo time framework。
- `fetchedAt`：crawler 抓到來源頁或 raw snapshot 的時間。
- `capturedAt`：price snapshot / image record 被收錄的時間。
- `observedAt`：public price-history point 對使用者呈現的觀測時間。
- `observationType`：public price-history point 的觀測類型，例如 `price_snapshot` 或 `current_price_confirmation`。
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

## File Path Comments

Repo-relative path comments are optional. They may be useful in larger generated files, but they are not required for small files and are not enforced by `pnpm test`.

Prefer clear folder boundaries, file names, exports, and editor / git path context over mandatory source comments. Moving a file should not require unrelated test updates just to refresh a comment.
