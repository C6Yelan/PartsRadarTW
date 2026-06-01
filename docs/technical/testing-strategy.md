# 測試策略

第一版測試以 Vitest、TypeScript typecheck、Biome、Next.js build、Docker / API smoke 與必要的瀏覽器驗證為主。實際連線原價屋只能手動或明確 profile 執行，不進常規測試。

## 目標

- parser 能穩定處理 CoolPC 分類頁。
- HTTP 200 但內容異常時，不更新正式商品與價格。
- 商品 identity、價格歷史、current price 與 missing / inactive 規則正確。
- API query validation、排序、分頁、狀態與錯誤處理符合 contract。
- Web UI 能呈現 active、inactive、stale、unavailable 與錯誤狀態。
- 每個 phase / refactor slice 都有清楚驗收點。

## 工具

| 工具 | 用途 |
| --- | --- |
| Vitest | parser、資料流、API logic、shared utils |
| TypeScript typecheck | 型別正確性 |
| Biome | lint / format |
| Next.js build | production build 編譯 |
| Docker Compose smoke | 部署與 service wiring |
| Playwright | 影響可見 UI / route / CSS 的大型重構驗證 |

不在第一版常規導入大型視覺回歸、壓力測試或每次打 live CoolPC 的 E2E。

## Fixtures

Crawler / parser 測試優先使用 `apps/crawler/tests/coolpc/fixtures` 內的 fixture。

Fixture 原則：

- 可使用保存的 CoolPC HTML 片段或完整頁。
- 不包含 `PHPSESSID`。
- 不放不必要的大量原始內容。
- 命名需標明來源頁類型與日期。
- 疑似攔截頁需明確命名與分類。

建議類型：

- 正常分類頁。
- 缺 `div.w`、`div.t`、`div.x`。
- 價格不可解析。
- HTTP 200 但內容不是商品頁。
- 商品未變、價格變動、商品消失。

## Test File Layout

Automated tests live outside runtime folders so deployment code is easier to scan:

- `apps/web/tests/api/`: web API handler/query/response tests and fake read clients.
- `apps/crawler/tests/coolpc/`: CoolPC parser, crawl-run, snapshot, retention, and data-flow tests.
- `apps/crawler/tests/scripts/`: crawler CLI option and daemon tests.

Runtime folders such as `apps/web/app/api/` and `apps/crawler/src/coolpc/` should not contain
`.test.ts` files or fake clients. Put local fake clients under the nearest `tests/**/support/`
folder instead of adding new `test-support/` directories inside runtime source.

## Crawler Tests

Parser / validation 至少覆蓋：

- token、名稱、價格、圖片 URL、discussion URL。
- `NT4880`、`NT4,880`、`$4880`、`$4,880`。
- computed key：`coolpc:igrp:{IGrp}:ibuy:{iBuyToken}`。
- 缺 token / 名稱 / 價格 / 圖片時不匯入正式商品。
- 完全重複商品可去重。
- 同 token 對應不同名稱或價格時標記解析異常。
- validation 失敗時不進 product upsert、price snapshot 或 current price。

Data flow 至少覆蓋：

- 新商品建立 product、price snapshot、current price。
- 價格變動才新增 snapshot。
- 價格未變不新增 snapshot。
- `success_unchanged` 更新分類 `last_success_at`。
- `crawl_run_category_results` 是分類結果真相來源。
- raw snapshot 去重與 cleanup 不刪價格歷史。
- fetch failed / suspected block / parse failed 不覆蓋 current price。
- parse failed 不累計 missing count。
- 連續 missing 與重新出現規則。

Scheduled crawler 至少覆蓋：

- 沒有 `--confirm-live-fetch` 時拒絕啟動。
- interval、backoff、category delay 有下限。
- Compose 預設不啟動 `crawler-daemon`。
- `scheduled-crawler` profile 才包含 daemon，且不開 host ports。

## API Tests

至少覆蓋：

- `/api/categories` 只回 enabled 分類。
- `/api/products` 的 `q`、`igrp`、vendors、price、sort、status、pagination。
- `pageSize` 上限與非法 query `400`。
- 商品列表與詳細都回站內圖片 URL。
- 商品不存在 `404`。
- inactive 商品詳細仍可 `200`。
- `/api/source-status` 的 `ok`、`stale`、`unavailable` 與分類聚合。
- web runtime source 不含 `console.*`，避免 browser console 洩漏 internal state。

不可暴露：

- computed `source_item_key`
- 獨立 `iBuyToken`
- raw snapshot
- parse error
- internal stack trace / env / DB secret

## Web UI Validation

一般 UI phase 可用手動 checklist；大型整理或影響可見行為的變更需用 Playwright。

首頁：

- 預設列表可載入。
- 搜尋、分類、廠商、價格、排序、分頁可運作並反映 URL。
- 查無商品、stale、unavailable 顯示正確。
- 手機版可搜尋與瀏覽。

商品詳細頁：

- active / inactive 商品可開啟。
- 不存在商品顯示找不到。
- 原始商品名稱、圖片、價格、來源與狀態顯示完整。
- 來源連結不含 `PHPSESSID`。

Playwright 驗證需使用可設定 base URL 或相對導覽，避免硬寫單一 localhost port。

## Deployment Smoke

Private validation 先限 Docker / Compose / DB / web API，不公開流量、不 live crawl。

至少檢查：

- `docker compose config` 可解析。
- Docker build 成功。
- `migrate`、`seed` exit code 0。
- `postgres` healthy。
- `web` healthy 且只綁 `127.0.0.1`。
- `/api/source-status` 回 `HTTP 200` 且有 8 個第一版分類。
- manual crawler 顯示 help，不發 live request。
- snapshot 與 product image cache volume 可寫。
- runtime image 不包含 repo secrets、docs、tests、fixtures、local runtime data。

公開前再補：

- Cloudflare Tunnel profile。
- 正式 HTTPS URL。
- 商品列表、商品詳細、圖片 API。
- CSP / security headers。
- crawler 成功資料寫入或明確失敗證據。

## Phase Closeout

每個階段至少執行對應檢查：

| 階段 | 最小檢查 |
| --- | --- |
| 文件 | `git diff --check`，索引與待決事項同步 |
| 初始化 | `pnpm install`、`pnpm test`、`pnpm check` |
| DB | Prisma generate / migrate / seed / view validation |
| Crawler | parser、validation、data-flow tests |
| API | route / query tests，不暴露內部欄位 |
| Web UI | `pnpm check`，手動或 Playwright 驗收 |
| 部署 | Docker build、migration、seed、service smoke |

## Live Fetch 規則

- 只能手動或明確 profile 執行。
- 遵守 5 分鐘週期、不重疊、不快速重試。
- 疑似攔截立即停止並保存 snapshot。
- 測試結果應轉成 fixture 或 raw snapshot，供離線測試使用。
