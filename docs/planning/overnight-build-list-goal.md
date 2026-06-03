# 已完成 Goal：配單、匯出與維護整理

本文件保存第二版 `v2.3` 配單與匯出 goal 的原始範圍、限制、驗收方式與完成狀態。這不是新的產品方向擴張；此 goal 已完成，後續第二版整體狀態以 [第二版 Roadmap](v2-roadmap.md) 為準。

## 目標

1. 新增 accountless 配單功能，讓使用者除了查詢商品外，也能整理一次性配單。
2. 配單可匯出 Excel，並提供可列印 PDF 版面。
3. 針對專案進行 audit-first 維護整理，處理明顯重複、過大或過度耦合的文件與程式碼。
4. 程式檔案補上路徑註解，方便大型 repo 中定位檔案用途與位置。

## 完成狀態

第二版配單與匯出 goal 已於 2026-06-03 完成部署驗收。最終 closeout commit：

```text
bd0b5646c4595c77d4cdbbb8c2f7a2187d54e735
fix(web): remove unstable coolpc import tool
```

完成項目：

- 商品列表與商品詳情頁都可加入配單。
- 配單使用 client-side state / `localStorage`，不寫入伺服器端個人資料。
- 配單頁支援數量調整、單品移除、清空、品項小計、總價與 reload 保存。
- Excel 匯出包含分類、商品名稱、數量、目前價格、小計、價格更新時間、原價屋查看 / 購買網址、產品介紹網址、備註欄與總價。
- `/build-list/print` 提供瀏覽器列印 / PDF 版面。
- 電腦與手機流程已用 Playwright MCP 驗證，包含 Excel artifact 與 PDF artifact 檢查。
- `/build-list` 與 `/build-list/print` local / public 部署驗收皆為 `HTTP 200`。
- 不穩定的 CoolPC userscript 匯入工具已移除；`/tools/coolpc-import` 與 `/tools/coolpc-import.user.js` local / public 皆為 `HTTP 404`。

剩餘觀察項：

- `link health: broken=0 temporary=111` 屬於來源連結 temporary 狀態觀察，不阻擋第二版 closeout。
- `missing product images: 8/3000` 仍在 smoke `OK` 範圍內，由 maintenance / image backfill 持續觀察。

## 非目標

- 不建立帳號、登入、收藏、追蹤清單、watchlist 或個人價格提醒。
- 不做伺服器端個人配單保存。
- 不做購物車、下單、自動購買、代購或付款流程。
- 不做自動推薦配單。
- 不做零組件相容性檢查。
- 不新增使用者通知、Discord bot、Discord 管理者告警或公開服務狀態頁。
- 不修改 DB schema，除非實作途中發現現有 public API 無法提供配單必要資料，且先回報原因。
- 不跑 live crawler、image backfill 或 production deployment。

## 實作限制

- 不須趕時間。這個 goal 的優先順序是仔細閱讀、盤點與驗證，而不是快速產出大量修改。
- 實作前需先檢視相關檔案與現有模式；不確定檔案用途、資料流或 UI 行為時，先回報或保留，不硬猜。
- 維護整理階段需逐項判斷修改是否真的降低維護成本；沒有把握的整理不要做。
- 隔夜執行時不可把所有變更累積到最後才 commit。每完成一定份量且可驗收的 slice，就應先執行必要檢查並 commit，讓後續回溯與部署評估更容易。
- 建議 commit 邊界：文件/規格更新、配單 state 與 localStorage、配單 UI、Excel 匯出、可列印 PDF、Playwright / artifact 驗證、維護整理、路徑註解。若實際切片不同，仍需維持「小而完整、可描述、可驗證」。
- 每個中途 commit 只能包含該 slice 相關檔案，不把未驗證或未完成的其他變更一起塞進去。
- 不可為了拆而拆；若拆分反而增加維護成本，保持現狀。
- 不可過度抽象化，不建立泛用框架或與目前規模不相稱的架構。
- 優先沿用現有 Next.js、React、CSS、API 與測試模式。
- 功能完成必須包含完整測試與瀏覽器驗證，不接受只有程式碼實作。
- UI 保持目前深色、table-first、工具型產品風格，不改成 landing page 或行銷頁。

## 配單功能範圍

配單採 client-side state 與 `localStorage`，不寫入伺服器端個人資料。

必要功能：

- 商品列表可加入配單。
- 商品詳情頁可加入配單。
- 配單可顯示商品名稱、分類、目前價格、數量、小計、價格更新時間、原價屋查看 / 購買網址與產品介紹網址。
- 可調整數量。
- 可移除單一品項。
- 可清空配單。
- 顯示總價。
- reload 後配單仍存在。
- 若商品已在配單中，加入入口需有明確狀態，不要讓使用者誤以為重複新增失敗。

配單不宣稱：

- 庫存保證。
- 即時價格保證。
- 價格鎖定。
- 零組件相容性。
- 購買建議。

## 匯出範圍

### Excel

Excel 需支援直接下載。

必要欄位：

- 分類。
- 商品名稱。
- 數量。
- 目前價格。
- 小計。
- 價格更新時間。
- 原價屋查看 / 購買網址。
- 產品介紹網址。
- 備註欄。
- 總價。

要求：

- 每件商品都必須包含原價屋查看 / 購買網址。
- 價格需標示資料更新時間，避免被誤解為即時報價保證。
- 檔名需可辨識用途與日期時間。
- Excel 內容不能只做成純文字下載；需可由一般試算表軟體開啟。

### PDF

第二版先採「可列印 PDF」方案，不做一鍵下載 PDF。

實作方式：

- 提供配單列印版頁面或列印模式。
- 使用瀏覽器列印功能輸出 PDF。
- 頁面需適合 A4 或常見列印尺寸。
- 中文、價格、數量、小計、總價與購買網址需可讀。

原因：

- 中文 PDF 直接下載需要處理字型嵌入、授權、換頁、表格斷行與檔案大小。
- Excel 已負責結構化資料與購買網址；PDF 主要作為列印留存。
- 列印版 PDF 風險較低，也較容易與現有 UI 維護一致。

## 維護整理範圍

整理必須先 audit，再決定是否修改。

可整理：

- 本次配單 / 匯出新增功能造成的 UI、state、export、test 模組。
- 已明顯膨脹且影響維護的檔案。
- 文件中重複或互相矛盾的第二版配單 / 匯出規格。
- 明顯重複的 helper 或測試 fixture。
- 高耦合但可用小切片降低依賴的部分。

不應整理：

- 只是大小偏大但職責清楚的穩定檔案。
- 拆完需要跨多層跳轉才看懂的小型元件。
- 沒有實際維護痛點的抽象化。
- 與配單 / 匯出無關、且目前穩定的 crawler 或 DB internals。

## 檔案路徑註解

目的：讓程式檔案開頭能快速看出所在路徑。

範圍：

- `apps/` 與 `packages/` 下的 `.ts`、`.tsx`、`.css`。

排除：

- `.next/`。
- build output。
- generated files。
- `node_modules/`。
- fixtures。
- migration SQL。
- `*.tsbuildinfo`。

規則：

- 註解內容使用 repo-relative path，例如 `// apps/web/app/page.tsx`。
- `.css` 使用 CSS 註解，例如 `/* apps/web/app/globals.css */`。
- 有 `"use client"` 或其他 directive 的檔案，directive 必須維持在最前面；路徑註解放在 directive 後面。
- 不因為補註解改變 runtime 行為、format 或 import 順序。

## Playwright 驗收要求

這個 goal 必須用 Playwright 做完整使用者流程測試。不能只驗證元件存在或 API 回應。

桌面寬度至少檢查：

- 首頁商品列表加入配單。
- 商品詳情頁加入配單。
- 配單入口與品項數量狀態正確。
- 配單頁或面板顯示品項、數量、小計、總價。
- 調整數量後，小計與總價同步更新。
- 移除單一品項。
- 清空配單。
- reload 後 localStorage 配單仍存在。
- Excel 下載成功。
- 列印版 PDF 頁面可產生 PDF artifact。

手機寬度至少檢查：

- 商品列表加入配單不造成水平溢出。
- 商品詳情頁加入配單不造成水平溢出。
- 配單頁或面板可調整數量、移除品項與清空。
- 匯出入口不可擠壓或溢出。
- 列印版頁面在手機寬度下仍可讀；若實際列印以 A4 為主，需另外檢查 print media 版面。

## 匯出檔案驗證要求

Excel / PDF 不可只測「下載按鈕被點擊」。必須實際產生 artifact 並檢查內容。

Excel：

- Playwright 需觸發下載並保存 `.xlsx`。
- 測試需開啟 workbook 檢查欄位名稱。
- 測試需檢查至少一筆商品資料、數量、小計、總價。
- 測試需檢查原價屋查看 / 購買網址存在。
- 測試需檢查價格更新時間存在。
- 若使用 hyperlink cell，需檢查 hyperlink target；若使用純文字 URL，需檢查 URL 文字。

PDF：

- Playwright 需從列印版頁面產生 PDF artifact。
- 測試需確認 PDF 檔案存在且大小合理。
- 測試需實際檢視內容，不可只看檔案存在。
- 優先用 PDF 文字抽取檢查商品名稱、總價、數量與購買網址。
- 若 PDF 文字抽取因中文字型或瀏覽器輸出限制不可行，需用 Playwright 截圖或 PDF 轉圖後做人工可讀性佐證，並在回報中明確說明限制。

## 一般驗證指令

完成後需執行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build:web
git diff --check
```

若新增依賴，需另外確認：

- 依賴用途必要且範圍合理。
- 沒有引入不必要的 server-side service。
- build output 沒有異常膨脹。

## 歷史 `/goal` Prompt

以下 prompt 是當時執行 goal 的歷史參考，不代表仍需再次執行。

```text
完整實作 PartsRadarTW 第二版 accountless 配單、Excel 匯出、可列印 PDF 版面，並做一次有邊界的維護整理。請依可驗收 slice 分批 commit；不要 push，除非使用者明確要求。

這個 goal 不須趕時間。請優先仔細閱讀、盤點、確認既有模式與完整驗證；不要為了快速完成而跳過檔案檢視、資料流確認或 artifact 檢查。
這次請在獨立分支上工作，且每完成一定份量的可驗收 slice 就 commit 一次。不要把整晚所有變更累積成單一巨大 commit。中途 commit 只能包含該 slice 相關檔案。

請先閱讀：
- docs/planning/overnight-build-list-goal.md
- docs/planning/v2-roadmap.md
- docs/technical/web-ui-design.md
- docs/technical/testing-strategy.md

範圍：
1. 新增 accountless 配單功能：商品列表與商品詳情頁可加入配單，localStorage 保存，支援數量、移除、清空、小計與總價。
2. 新增 Excel 直接下載，且每件商品包含原價屋查看 / 購買網址、價格更新時間、數量、小計與總價。
3. 新增可列印 PDF 版面，不做一鍵 PDF 下載。需可由 Playwright 產生 PDF artifact。
4. 針對本次新增功能與既有高重複、過大或耦合明顯的文件/程式碼做 audit-first refactor。不可為了拆而拆，不可過度抽象化。
5. 程式檔案補 repo-relative path 註解：限 apps/ 與 packages/ 下 .ts/.tsx/.css，排除 generated/build output、.next、fixtures、migration SQL。保留 "use client" directive 正確位置。

禁止：
- 不改 DB schema，除非先證明現有 API 無法提供配單必要資料並回報。
- 不新增帳號、登入、收藏、通知、追蹤、相容性檢查、自動推薦配單。
- 不做伺服器端個人配單保存。
- 不跑 live crawler / image backfill。
- 不部署。
- 不 push，除非使用者明確要求。中途應依可驗收 slice 分批 commit。

驗證：
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build:web
- git diff --check
- Playwright 桌面與手機完整流程：加入配單、調整數量、移除、清空、reload 保留、Excel 下載、可列印 PDF artifact、無水平溢出。
- Excel 下載後必須實際開 workbook 檢查欄位、商品資料、數量、小計、總價、原價屋購買網址與價格更新時間。
- PDF 必須由 Playwright 產生 artifact，並實際檢視內容；優先抽文字檢查商品名稱、總價、數量與購買網址。若文字抽取不可行，需用截圖或 PDF 轉圖證明可讀性並回報限制。
```

## 回報格式

隔夜 goal 完成後需回報：

1. 修改檔案。
2. 配單功能完成狀態。
3. Excel 匯出檔案檢查結果。
4. 可列印 PDF artifact 檢查結果。
5. 維護整理 audit 結論與實際整理項目。
6. 路徑註解處理範圍與排除項目。
7. 驗證指令結果。
8. Playwright 桌面 / 手機檢查結果。
9. 尚未處理或刻意不處理的項目與原因。
