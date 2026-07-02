# 決策紀錄

本文件記錄 PartsRadarTW 已確認、延後處理與待決定的產品決策。只記錄會影響後續設計或開發方向的決策；顯然不屬於本專案方向的事項不列入。

## 已確認

| 決策 | 說明 |
| --- | --- |
| 原價屋是唯一資料來源 | 專案只整理原價屋公開商品資料，不做其他網站或通路整合。 |
| 核心資料表不保留多來源抽象欄位 | 第一版 DB 不保存固定值 `source = coolpc`，也不保存可由 `IGrp` 推得的 `source_category_key`；API 若需要來源名稱，可固定回傳 `coolpc`。 |
| 第一版以查詢網站為主 | 第一版先完成商品搜尋、分類瀏覽、價格排序與基本篩選。 |
| 第一版不做個人化功能 | 使用者帳號、收藏清單、個人價格提醒會影響資料模型與權限設計，第一版先不納入。 |
| 第二版仍不做帳號與個人化功能 | 第二版不建立帳號、登入、收藏清單、追蹤清單、個人價格提醒或使用者導向 Discord bot；若未來真的需要，需另開產品與資安設計。 |
| 第二版以價格洞察、配單與維運穩定性為主 | 第二版範圍聚焦價格歷史、近 30 天價格變動、商品連結健康檢查、正常瀏覽限流調整、配單與 Excel 匯出；營運監控先維持 `smoke-daemon` log 型監控。 |
| 價格歷史有使用者價值，但不等於網站帳號化價格追蹤 | 價格歷史、近期漲跌與分享配單中的價格變動提示可作為決策輔助；第三版可用 Discord bot 做低成本個人目標價提醒與個人價格變動報告，但網站仍維持 accountless，不建立登入、email 通知或跨平台帳號綁定。 |
| Discord 通知分工已定案 | Discord bot 負責 public 價格變動報告、使用者 slash command 與個人化通知；webhook 僅保留給 admin smoke / ops 告警。Bot 第一輪做公開頻道價格報告、`/price-report settings/now`、統合新增 / 查看 / 編輯 / 移除的 `/watch` 管理介面與必要的通知發送，不做網站帳號、公開暴露個人追蹤清單、Discord 內保存配單、庫存通知或購買建議。 |
| Discord 價格變動報告分成 public 與 personal | Public 價格報告由 `/public-report` 在 Discord 伺服器內設定發送頻道，`discord-bot` 掃描 scheduled crawl 後尚未送出的本輪價格變動並送到已啟用頻道；管理者可在 `/public-report manage` 調整分類、商品名稱關鍵字、降價 / 漲價與顯示上限，測試報告與自動報告共用同一組設定。Discord bot 的 `/price-report now` 在指令所在頻道或私訊 context 以 embed 回覆中文報告，只為有資料的「價格變動」或「新增商品」產生 embed，摘要與價格變動方向標題使用 Markdown emphasis，商品列以單行呈現關鍵價格與站內商品連結，且小分類已顯示品牌時不再重複商品名稱開頭品牌；`/price-report settings` 的按鈕與 modal 開放每日 DM 報告，依使用者設定的 window / max_items / 台北時間發送時間、分類、商品名稱關鍵字與內容類型列出特定時間段內實際變價商品。 |
| 分享配單與公開服務狀態暫緩 | 分享配單可先由 Excel 匯出或截圖滿足，server-side share token / retention / snapshot / abuse guard 的成本高於近期價值；公開服務狀態推播與狀態頁對一般使用者價值有限，維運訊號先留給 admin webhook、smoke、內網 ops status page、runbook 與後續外部監控。 |
| 第二版重新盤點原價屋分類擴充 | 第一版只啟用 8 個組電腦核心分類；第二版可擴充第一版以外的原價屋公開分類，但必須先做 IGrp 盤點、manual live validation、raw snapshot replay、parser / image / link health 驗證，再分批啟用。不能未驗證就一次全開所有分類。 |
| 第二版第一批分類擴充啟用 `IGrp=8/11/16` | 第一批先啟用外接儲存 `IGrp=8`、水冷 `IGrp=11`、風扇 / 配件 `IGrp=16`。這三類已可由 parser 取得 token、名稱、價格、來源連結與圖片欄位，並通過 manual live validation / raw snapshot replay；其他分類仍需另行盤點驗證。 |
| 第二版配單採 accountless client-side state | 配單只作為一次性整理購買清單，不建立帳號、不保存伺服器端個人菜單、不做購物車、下單、自動購買、相容性檢查或自動推薦配單。配單可使用 localStorage 保存，匯出 Excel 時每件商品需附原價屋查看 / 購買網址。 |
| 正常瀏覽不應被 API limiter 誤傷 | 公開 API 仍保留 app-level abuse guard，但正常使用者快速切分類、翻頁、排序與載入商品圖片時不應輕易觸發 `429`。第二版需確認 production rate limit env、client identity header、list / read / image 額度與前端多餘 request。 |
| 第三版範圍與順序已收斂 | 第三版近期主線收斂為商品頁分享 / Open Graph preview、public Discord 價格變動清單、Discord 管理者告警、Discord bot 個人目標價提醒、Discord bot 個人價格變動報告、外部監控、受保護的內網 ops status page、資料品質檢視與公開流量硬化；分享配單、公開服務狀態推播與公開狀態頁暫緩，詳細範圍以 [第三版 Roadmap](v3-roadmap.md) 為準。 |
| 第一版需要保留原始來源脈絡 | 商品資料應顯示原價屋資料來源、更新時間，並能讓使用者回到原始頁面確認最新資訊。 |
| 第一版商品圖片是必要資料 | 商品列表與商品詳細頁都需要主要商品圖片；圖片 URL 需由 crawler 從原價屋公開頁面解析、驗證與正規化後寫入資料庫，再由 API 回傳給 Web UI。缺圖只能作為容錯或資料完整性風險，不是第一版 happy path。 |
| CoolPC 商品圖片 selector 與 allowlist | 2026-05-28 以 saved raw HTML 與 manual live validation 驗證，第一版目標分類的商品列附近可由 `<img src="/eval/{IGrp}/{filename}">` 取得主要圖片。實作只接受可正規化為 `https://www.coolpc.com.tw/eval/{IGrp}/{filename}.{jpg|jpeg|png|gif|webp}` 的 URL；`/eval/{IGrp}/`、缺副檔名或外部網域需記錄為 `invalid_image_url` 類 validation issue，不進入正式商品資料。`parse_errors.raw_image_url` 只保留原始圖片 URL 供內部 debug 與 validation，不暴露到公開 API/UI。 |
| 正式 UI 不依賴來源圖片 hotlink | CoolPC / 原價屋來源圖片 URL 僅作為 crawler 解析、驗證與縮圖建立來源；正式 UI 不能以直接 hotlink 來源圖片作為完成狀態。此決策不代表已取得圖片授權，也不代表一定符合合理使用；若來源圖片取得不穩，需標為資料完整性風險。 |
| 商品圖片呈現策略採自家小尺寸縮圖快取 | 第一版正式 UI 顯示站內商品圖片 API URL 與自家小尺寸縮圖快取，不讓每位訪客直接消耗來源站圖片流量，也不依賴部署時圖片資料夾與 Web app 原始碼位在固定相對位置。placeholder / 分類圖示只作為缺圖或下載失敗後的 fallback。自家縮圖初始實作採手動 backfill，不在訪客請求期間抓取來源圖片；來源圖片請求需使用低頻率與浮動間隔。 |
| 第一版 production 圖片儲存採 persistent volume | 第一版不先導入 object storage 或 CDN。production 商品縮圖快取使用 mounted persistent volume，`web` 只讀取 `PRODUCT_IMAGE_STORAGE_DIR` 並透過站內 API 回傳圖片，`crawler` 或 backfill 流程負責建立與更新縮圖。圖片 cache 需納入備份 / 搬遷計畫，不能視為可任意丟棄的暫存。 |
| 第一版定位為非官方、非商業查詢工具 | PartsRadarTW 第一版是非官方、非商業的商品搜尋與價格整理工具，不處理購買、付款、訂單或售後服務。商品查看與購買應導回原價屋來源頁，實際資訊以來源頁為準。 |
| 先導入基本 CSP，嚴格 CSP 留作公開前 gate | Web app 先使用基本 Content Security Policy 降低外部 script、object、frame 與非預期資源載入風險。嚴格 CSP 需等正式部署網域、圖片呈現方式與 report-only 觀察策略確認後，再於公開宣傳或開放較大流量前收斂。 |
| 第一版先處理組電腦必要硬體 | 第一版優先處理組一台電腦會用到的主要硬體，後續再逐步補齊原價屋其他類別與產品。 |
| 商品分類第一版先保留原價屋分類脈絡 | 先保存原價屋分類名稱與 `IGrp`，同時提供 PartsRadarTW 顯示名稱；若後續發現不利搜尋或篩選，再補一層更完整的分類規則。 |
| 第一版 crawler 以 `eachview.php?IGrp={分類編號}` 為抓取入口 | 舊專案已使用分類總覽頁抓資料，且初步觀察顯示該頁面較適合按分類解析商品；第一版不使用 `evaluate.php` 抓商品資料。 |
| 商品識別採內部 ID 與原價屋鍵分離 | 資料庫使用內部 UUID 作為商品主鍵，並以 `source_category_id + ibuy_token` 作為商品唯一鍵；`source_category_id` 對應唯一 `IGrp`，crawler 需要字串識別時使用 computed `source_item_key`。 |
| `source_item_key` 使用 `iBuy` token | 第一版 computed `source_item_key` 使用 `coolpc:igrp:{IGrp}:ibuy:{iBuyToken}`，但不存入 DB；沒有 `iBuyToken` 的單品不匯入正式商品但保留解析紀錄。此決策需在 Phase 2 以第一版目標分類 fixture 驗證，若某分類無法穩定取得 token，該分類先不匯入正式商品或另開決策。 |
| raw snapshot 採資料庫 metadata 加壓縮檔案 | 重要資料與狀態存資料庫，原始 HTML 使用後壓縮保存成檔案；一般 snapshot 最長保留 30 天，異常 snapshot 最長保留 90 天，未來依實際狀況調整。raw snapshot 清理不得刪除價格歷史；長期價格資料若參照 raw snapshot，關聯需允許清空或以不破壞外鍵的方式處理。 |
| crawler 每 30 分鐘檢查是否啟動下一輪 | 公開後避免價格 crawler 與 link checker 疊加造成來源站壓力，第二版起預設每 30 分鐘檢查一次；若上一輪尚未完成，不重疊啟動新的 crawl cycle。 |
| 疑似攔截時立即停止當次 crawl | 遇到疑似攔截頁時立即停止當次 crawl，不更新正式商品與價格資料；下一次依 30 分鐘循環再嘗試，若連續失敗多次則延後 1 小時並保存異常狀況。 |
| 網站目前價格讀取 `current_prices` | 價格歷史由 price snapshots 保存；`current_prices` 只保存目前 `price_snapshot` 指標與狀態時間，價格、幣別與 `captured_at` 由對應 price snapshot 取得。 |
| HTTP 200 不代表抓取成功 | 原價屋在短時間內請求頻率過高時，可能回傳 HTTP 200 但內容為攔截頁或非商品資料頁；crawler 需做內容層驗證。 |
| 抓取失敗時網站顯示最後有效資料 | API 不因單次 fetch 失敗、疑似攔截或解析失敗清空商品；網站透過來源狀態判斷資料是否可能過期。 |
| 來源狀態第一版以來源檢查健康度判斷 | 分類最近 60 分鐘內有成功檢查並處理有效資料視為 `ok`；來源內容即使沒有變動，只要成功檢查仍屬於 `ok`。超過 60 分鐘沒有成功檢查到有效來源資料，但仍有有效商品資料視為 `stale`；沒有任何有效商品資料視為 `unavailable`。全域狀態由 enabled 分類聚合，全部分類 `ok` 才是全域 `ok`，至少一個分類有有效資料但不是全部 `ok` 時為全域 `stale`，完全沒有有效資料時為全域 `unavailable`。60 分鐘是第一版健康度門檻，配合 30 分鐘 crawler 週期避免排程邊界造成誤判；不代表原價屋價格應在 60 分鐘內更新。 |
| 來源狀態不代表商品供應情形 | `ok`、`stale`、`unavailable` 只描述 CoolPC crawler、parser 與來源資料同步健康度，不描述單一商品是否可購買。UI 狀態欄應使用「來源狀態」或「資料狀態」，不得把來源狀態包裝成商品供應承諾。 |
| stale 狀態使用低干擾提示 | `stale` 不代表資料不可用，也不代表原價屋價格應更頻繁更新。第一版只在列表或詳細頁用低干擾文字提示最近未成功檢查來源，並繼續顯示最後一次有效價格。 |
| 同一 snapshot 完全重複商品可去重 | Phase 2 live validation 顯示機殼與電源頁會把相同 `iBuyToken`、商品名稱與價格的商品列出兩次；第一版 parser 可去重後保留一筆。若同一 `iBuyToken` 對應不同商品名稱或價格，仍視為解析異常，不進入正式商品資料。 |
| 明確非商品或附屬加購列不匯入正式商品 | 原價屋分類頁可能混入相容性提醒、查詢提示或附屬加購項目，例如以 `【提醒】` 或 `[加購價]` 開頭的列。這類列不是適合作為獨立比較的商品，會污染價格排序與商品總數，第一版 parser 應在進資料庫前排除；扣具、線材、散熱膏等可能實際單賣的項目仍不應只因品類名稱被移除。 |
| 解析失敗資料第一版使用 `parse_errors` 追蹤 | 缺少 `iBuyToken`、價格無法解析、來源商品識別衝突，例如同一分類同一 snapshot 內相同 `iBuyToken` / computed `source_item_key` 對應不同商品名稱或價格，或內容驗證失敗等，不進入正式商品資料，但寫入 parse error 與 raw snapshot 供後續檢查。 |
| 商品連續 6 次成功 crawl 都消失才改為 inactive | 單次成功 crawl 沒看到商品不視為下架；連續 6 次成功 crawl 都未看到同一商品時，才將商品標記為 inactive。 |
| 第一版商品詳細頁不拆規格欄位 | 電腦硬體命名不穩定，第一版商品詳細頁先完整顯示主要商品圖片、原始商品名稱、分類、價格、來源與資料狀態，不解析 CPU、GPU、SSD 等分類規格欄位。 |
| 第一版改用 Biome 作為 lint / format 工具 | 第一版不使用 ESLint + Next.js config，避免 ESLint 9 EOL 與 ESLint 10 plugin 相容性問題；TypeScript typecheck 與 Next.js build 仍保留作為正式檢查。 |

## 延後處理

| 項目 | 延後原因 |
| --- | --- |
| 第三版延後項目 | 網站帳號、登入、網站端 watchlist、帳號保存菜單、Discord 帳號綁網站帳號、公開頻道個人通知、Discord 內保存配單、庫存 / 到貨通知、完整商品搜尋 bot、購買建議、分類缺漏提示、規格資料、相容性檢查與自動推薦配單均不納入第三版第一輪；詳見 [第三版 Roadmap](v3-roadmap.md)。 |
| 原價屋商品分類與規格整理規則優化 | 需等資料擷取與第一批商品資料觀察後再細化。 |
| 解析失敗資料管理介面 | 第一版不做後台管理介面；parse error 先只作為 crawler 除錯與人工檢查資料。 |

## 待決定

目前沒有已知會阻塞第二版 closeout 的產品決策。第三版待決定事項以 [第三版 Roadmap](v3-roadmap.md) 的「待決定」章節為準。新增待決定事項前，應先確認是否已由 Roadmap、產品邊界或技術文件吸收。
