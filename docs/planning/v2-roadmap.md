# 第二版 Roadmap

本文件記錄第二版網站規劃。第二版不是帳號系統、通知系統或完整菜單推薦工具，而是把第一版查詢網站升級成更能理解價格變化、整理配單、維持正常瀏覽體驗與維運公開服務的版本。

## 目標

- 讓使用者能看懂商品價格變化，而不只看到目前價格。
- 讓使用者能快速找到近期價格異動商品。
- 讓正常快速瀏覽、切分類、翻頁與載入商品圖片時不容易誤觸 `429`。
- 在不建立帳號的前提下，提供一次性配單與 Excel 匯出。
- 提升來源連結、圖片與商品資料的可信度。
- 擴充第一版以外的原價屋分類，讓網站可查詢更多公開商品資料。
- 讓公開服務有足夠的 crawler、資料流與網站監控能力；第二版先維持 log 型監控。

## 非目標

第二版不做：

- 使用者帳號、登入、註冊或 OAuth。
- 伺服器端保存個人菜單、收藏清單、追蹤清單或 watchlist。
- 個人化價格追蹤、商品訂閱、到價通知或個人價格提醒。
- 使用者通知中心。
- 使用者導向 Discord bot、私訊通知或價格通知。
- 使用者上傳資料、留言、評價或個人化推薦。
- 跨網站比價或多資料來源整合。
- 購物車、下單、自動購買或代購流程。
- 自動推薦配單。
- 零組件相容性檢查。
- 完整規格資料庫或從外部網站補抓規格。
- 只從商品標題萃取的規格副標。
- 第三版 Roadmap 已接手的維運通知、服務狀態頁與外部監控能力。

第二版非目標的後續處理以 [第三版 Roadmap](v3-roadmap.md) 或另行產品 / 資安設計為準，不從第二版自然延伸。

## 進入條件

- 第一版網站已能穩定公開運行。
- CoolPC crawler 能持續取得主要分類資料，且疑似攔截、parse error 與 stale 狀態能被辨識。
- 商品圖片快取、備份與搬遷流程已完成第一版公開前最低要求。
- Production smoke、source status 與基本安全 headers 已可驗證。
- 文件、部署設定與實作狀態沒有明顯脫節。

## 完成與公開驗收狀態

第二版已於 2026-06-03 完成部署端 closeout。驗收 commit：

```text
bd0b5646c4595c77d4cdbbb8c2f7a2187d54e735
fix(web): remove unstable coolpc import tool
```

部署驗收結果：

- `web` / `postgres` healthy。
- `storage-init` / `migrate` / `seed` exit 0。
- `crawler-daemon` / `maintenance-daemon` / `smoke-daemon` / `raw-snapshot-cleanup-daemon` 持續執行。
- `/build-list` local / public 都回 `HTTP 200`。
- 已移除的不穩定 CoolPC import tool routes 都回 `HTTP 404`：`/tools/coolpc-import` 與 `/tools/coolpc-import.user.js`。
- `/api/source-status` public 回 `HTTP 200`。
- `/api/products?pageSize=1` public 回 `HTTP 200`。
- `smoke-daemon` 最近檢查沒有未解釋的 `FAIL`。

目前剩餘 `WARN`：

- `link health: broken=0 temporary=111`。這是來源連結健康檢查的暫時狀態觀察，broken 為 0，不阻擋第二版完成。
- `missing product images: 8/3000` 仍在 smoke `OK` 範圍內，由 maintenance / image backfill 流程持續觀察。

結論：第二版功能已完成並通過部署驗收；剩餘事項是來源站資料健康度觀察，不是第二版 web UI、配單、分類擴充、rate limit 或 smoke 部署阻塞。

### 1. 價格歷史

目標：讓商品詳細頁可以呈現價格走勢。

範圍：

- 商品價格歷史 API。
- 商品詳細頁價格走勢圖。
- 近 7 / 30 / 90 天與全部時間的最低價、最高價、均價與價格變化。
- 期間變動卡、區間摘要卡、tooltip、變價紀錄分頁與價格未變時的目前價格確認點。

目前狀態：

- 已完成第二版需要的第一輪：價格歷史 API、商品詳細頁價格走勢圖、7 / 30 / 90 / 全部時間範圍、期間變動卡、區間摘要卡、tooltip、變價紀錄分頁、價格未變時的目前價格確認點。
- 已整理價格走勢 UI / CSS 結構，避免單一 `price-history.css` 過度膨脹。

不列入第二版：

- 接近歷史低點提示；90 天摘要圖與區間條已能表達目前價格位置。
- 額外的價格 / 漲跌幅模式。
- 個人化價格追蹤、商品訂閱、watchlist 或到價通知；第二版價格歷史只作為查詢與決策輔助。
- 觀測點來源切換。
- Y 軸縮放。
- 最低 / 最高 / 目前標記切換。
- 自訂日期區間、多商品疊圖、均線、技術指標或多圖表樣式切換。

完成條件：

- 價格未變時不產生誤導性重複點。
- raw snapshot cleanup 不影響價格歷史查詢。
- 歷史圖不暗示來源價格更新頻率保證。
- 價格走勢圖控制項保持輕量，不做股票軟體式分析介面。

### 2. 價格變動探索

目標：讓首頁不只依目前價格排序，也能找出近期價格變化。

範圍：

- 首頁商品列表顯示近 30 天價格變動欄位。
- 無變動以 `-` 顯示。
- 支援近 30 天降幅最大與近 30 天增幅最大排序。

目前狀態：

- 已完成第一輪：首頁商品列表顯示近 30 天價格變動欄位，支援近 30 天降幅最大與近 30 天增幅最大排序。
- 已完成部署驗收：公開商品列表 API 可回應近 30 天降幅 / 增幅排序。

不列入第二版：

- 接近歷史低點。
- 近 7 天變動欄位或排序。
- 價格變動篩選。
- 複雜價格分析入口。

完成條件：

- 變動計算有明確時間窗與資料不足處理。
- 首頁查詢仍維持 table-first 掃描體驗。
- API response 不暴露 crawler internal details。

### 3. 商品連結健康檢查

目標：避免網站長期顯示已失效或不適合導出的來源連結。

範圍：

- 低頻連結健康檢查。
- 原價屋查看 / 購買連結與產品介紹連結狀態欄位。
- 失效、暫時失敗與待重試狀態。
- UI 隱藏或低干擾標示失效連結。
- backoff 與 request rate 控制。

目前狀態：

- 已完成第一輪：`product_link_health` schema / migration、`ops:product-links:check` 低頻檢查命令、dry-run / live confirmation、可選批次上限、10-20 秒 request delay、48 小時 stale window、連續 404 / 410 失敗門檻、商品詳情 API / UI 低干擾健康提示。
- 已完成第二輪：`maintenance-daemon` 排程入口、link checker 與缺圖 backfill sequential maintenance、shared external fetch lock，避免與 scheduled crawler 並行抓來源。

完成條件：

- link checker 不在使用者 request lifecycle 執行。
- 單次失敗不立即移除連結。
- 來源站異常時不造成大量重試。
- 部署後 maintenance daemon 可穩定執行。

### 4. 正常瀏覽與 `429` 誤傷修正

目標：保留基本 API 防護，但避免正常使用者快速切分類、翻頁、排序或載入圖片時被誤判。

範圍：

- 檢查 production `.env` 是否套用 `API_LIST_RATE_LIMIT_MAX`、`API_IMAGE_RATE_LIMIT_MAX` 與 `API_RATE_LIMIT_WINDOW_SECONDS`。
- 分開調整 list / read / image 額度，尤其圖片請求不得因正常列表瀏覽大量觸發 `429`。
- 確認 Cloudflare / tunnel 會傳入可用的 `CF-Connecting-IP` 或 `X-Forwarded-For`，避免所有使用者被算成同一個 client。
- 檢查首頁快速翻頁、切分類與排序時是否產生多餘 request；必要時降低前端連點造成的 pending request。
- 保持 `429` response 與 UI 文案明確，不把正常限流誤顯示成一般資料載入失敗。

目前狀態：

- 已完成第一輪：公開 API limiter 分成 `api:read`、`api:list` 與 `api:image` scope，預設分別為每 client 每 60 秒 120 / 360 / 1200 次；`.env.example` 與 Compose web service 都帶入對應 env。
- 已完成第二輪：rate-limit 測試覆蓋 pageSize 50 快速切 20 頁與 1000 張列表圖片的正常瀏覽 burst，確認 list / image / read bucket 互不拖累；production smoke 會檢查 product list API 的 `X-RateLimit-*` 與 `X-RateLimit-Client-Source` headers。
- 部署後若 `SMOKE_PUBLIC_BASE_URL` 指向公開 HTTPS 網域但 `clientSource=unknown`，`smoke-daemon` 會輸出 `WARN`，提醒檢查 Cloudflare / tunnel 是否傳入 client identity header。

完成條件：

- 一般使用者以 pageSize 50 快速切數頁時，不應輕易觸發 `429`。
- 商品圖片載入不應拖累商品列表 API 額度。
- app-level limiter 仍保留作為主機保底防護。
- 大量異常流量仍優先交由 Cloudflare / WAF 處理。

### 5. 原價屋分類擴充

目標：把第一版只支援組電腦核心硬體的 8 個分類，擴充到更多原價屋公開分類，讓網站能查詢更多商品。

範圍：

- 盤點原價屋 `eachview.php?IGrp={分類編號}` 可用分類。
- 先補第一版曾明確排除但可能有查詢價值的分類，例如外接儲存 `IGrp=8`、水冷 `IGrp=11`、風扇 / 配件 `IGrp=16`，再評估其他分類。
- 為每個候選分類建立 display name、source name 與必要的 title keyword validation。
- 對候選分類做 manual live validation 與 raw snapshot replay，不通過者不啟用。
- 分批更新 `COOLPC_TARGET_CATEGORIES` 與 DB seed，不一次全開。
- 驗證 parser 是否能穩定取得 `iBuyToken`、商品名稱、價格、來源連結、主要圖片與產品介紹連結。
- 針對新分類跑 image backfill、link health 與 API/UI smoke。

目前狀態：

- 第一輪：外接儲存 `IGrp=8`、水冷 `IGrp=11`、風扇 / 配件 `IGrp=16` 已通過 manual live validation 與 raw snapshot replay，並作為第二版第一批分類擴充。
- 已完成部署驗收：公開 API 可查詢第二版第一批分類。

完成條件：

- 新分類不會造成 suspected block、parse error 或 invalid image URL 異常激增。
- 新分類商品能正常出現在首頁分類篩選、列表、商品詳細頁、價格歷史、近 30 天價格變動與圖片 API。
- 無法穩定解析或內容不適合作為商品查詢的分類不啟用。
- 新分類加入後 scheduled crawler、maintenance daemon 與 smoke daemon 仍穩定。

### 6. 配單與 Excel 匯出

目標：讓使用者除了查詢商品外，也能整理一次性配單並匯出。

範圍：

- 在商品列表與商品詳情頁加入「加入配單」入口。
- 配單以 client-side state / localStorage 保存，不需要帳號、不寫入伺服器個人資料。
- 配單項目包含商品 ID、商品名稱、分類、目前價格、價格更新時間、原價屋查看 / 購買網址與產品介紹網址。
- 支援調整數量、移除品項、清空配單與顯示總價。
- 匯出 Excel，且每件商品都附原價屋購買網址。
- Excel 可包含分類、商品名稱、數量、目前價格、小計、價格更新時間、原價屋購買網址、產品介紹網址、備註欄與總價。

目前狀態：

- 已完成第一輪：商品列表與商品詳情頁加入配單入口，配單使用 client-side state / `localStorage`，支援品項數量、移除、清空、品項小計、總價、配單品項數量顯示與 reload 保存。
- 已完成 Excel 直接匯出，內容包含分類、商品名稱、數量、目前價格、小計、價格更新時間、原價屋查看 / 購買網址、產品介紹網址、備註欄與總價。
- 2026-06-03 本地 Playwright MCP 已驗證電腦與手機使用者流程：首頁加入配單、商品詳情頁加入配單、`localStorage` 保存、reload 後數量保留、數量調整、移除、清空、Excel artifact 內容與無水平溢出。
- 已新增 repo path comment policy test，讓 `apps/` 與 `packages/` 下 `.ts`、`.tsx`、`.css` 的 repo-relative path comment 規則可重跑驗證，並排除 generated / fixture / build output 檔案。
- 已完成部署驗收：`/build-list` local / public 都回 `HTTP 200`。
- 已移除不穩定的 CoolPC import tool；第二版不提供 userscript 帶入原價屋估價頁，不做購物車、下單、自動購買或代購流程。

完成條件：

- 不需要登入、收藏或伺服器端使用者資料。
- 配單不宣稱相容性、庫存保證或購買建議。
- 匯出的價格需標示資料更新時間，避免被誤解成即時報價保證。
- 手機版配單入口與配單頁仍可操作，不造成水平內容失控。

### 7. 營運監控

目標：讓公開服務能被維護，而不是只靠人工偶爾查看。

範圍：

- production smoke test script。
- `smoke-daemon` 定期檢查首頁、API、crawler freshness、parse error、疑似攔截、缺圖、連結健康與 raw snapshot retention。
- product image backfill / cleanup 檢查，包含 `maintenance-daemon` 缺圖補齊狀態。
- API error 與 rate limit 觀察。

目前狀態：

- 已完成第一輪：production smoke command 與 `smoke-daemon`，目前以 container log 呈現 `OK` / `WARN` / `FAIL`。
- 已完成第二輪：production smoke 會直接抽查 product list 的 public product image API，避免 DB 已有 `primary_image_url` 但 mounted image cache 缺檔時只靠較寬鬆的缺圖總數門檻才被發現。
- 已完成第三輪：production smoke 會檢查第二版配單 routes、第二版第一批分類、近 30 天價格變動排序 API；`--public-only` 模式可在沒有部署主機 DB access 時驗證公開 HTTP routes / APIs 與 source freshness。
- 第二版先維持 log 型監控，不新增告警通道。
- 已完成部署驗收：`smoke-daemon` 最近檢查沒有未解釋的 `FAIL`；目前唯一 `WARN` 是來源連結 temporary 狀態觀察，不阻擋第二版 closeout。

不列入第二版：

- 第三版 Roadmap 已接手的維運通知、服務狀態頁、外部監控、dashboard 與多通道告警策略。

完成條件：

- 監控先以管理者 / 維運者為對象，不做使用者通知。
- `smoke-daemon` log 能指出狀態、失敗項目與 runbook 方向。
- log 不包含 `.env`、DB URL、token、raw HTML、stack trace 或其他內部敏感資訊。
- 不把監控資料公開成使用者可查詢的內部細節頁。

## 完成切片

### v2.0：資料可信度與價格歷史

- 已完成價格歷史 API 與詳細頁圖表。
- 已完成近 30 天價格變動欄位與排序。
- 已完成商品連結健康檢查。
- 已完成 maintenance daemon。
- 已完成 production smoke daemon。

### v2.1：正常瀏覽穩定性

- 已完成 list / read / image rate limit 分流與正常瀏覽 burst 測試。
- 已完成 production rate limit headers smoke 檢查。

### v2.2：原價屋分類擴充

- 已完成第一批候選 IGrp 盤點。
- 已完成 `IGrp=8`、`IGrp=11`、`IGrp=16` manual live validation 與 raw snapshot replay。
- 已完成 target categories / seed 更新。
- 已完成部署後 API / smoke 驗收；圖片與 link health 由 maintenance 持續觀察。

### v2.3：配單與 Excel 匯出

- 已完成商品列表與詳細頁加入配單入口。
- 已完成 client-side / localStorage 配單。
- 已完成配單總價、數量、移除與清空。
- 已完成 Excel 匯出，每件商品附原價屋購買網址。
- 已完成部署驗收，並移除不穩定的 userscript 匯入工具。

## 第三版方向

第三版已另立 [第三版 Roadmap](v3-roadmap.md)。已確認處理原討論清單中的 1、2、3、4、5、7、8，但實作順序調整為使用者可感知的分享配單、公開狀態、Discord 公開推播 / 配單預覽先做，管理者告警、外部監控與維運檢視後做；未列入項目與非目標不再於本文件重複，均以第三版 Roadmap 為準。

## GitHub Release 策略

網站型專案不需要每次部署都建立 GitHub Release。Release 應只標記可回溯的公開里程碑：

- 第一版公開穩定後建立 `v1.0.0`。
- 第二版已完成部署驗收；若要建立正式公開里程碑，可從 `bd0b5646c4595c77d4cdbbb8c2f7a2187d54e735` 建立 `v2.0.0`。
- 重大修補再使用 patch version，例如 `v2.0.1`。

Release notes 應包含主要功能、migration / deployment 注意事項、驗證過的 commit SHA、已知限制與 production 網址；不包含 `.env`、資料庫 dump、raw snapshot、商品圖片快取或任何私有資料。
