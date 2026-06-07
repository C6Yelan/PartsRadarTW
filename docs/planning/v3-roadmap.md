# 第三版 Roadmap

本文件是第三版規劃的主要來源。第三版目前收斂成兩條產品主線與一條維運主線：商品頁分享 / Open Graph preview、Discord 通知能力，以及受保護的內網 ops status page / 管理者告警。Discord 通知分工為 webhook 做公開價格變動廣播與管理者告警，Discord bot 做個人化目標價提醒與個人價格變動摘要。分享配單、公開服務狀態推播與公開服務狀態頁暫不作為近期主線；若未來需求明確，再另開較小設計 slice。

## 目標

- 讓商品詳細頁更容易分享，並讓外部平台透過 Open Graph 取得乾淨商品預覽。
- 讓 Discord public webhook 提供有參考價值的公開價格變動清單，而不是低價值服務狀態噪音。
- 讓使用者可透過 Discord bot 設定個人目標價提醒，並在達標時收到 DM。
- 讓使用者可透過 Discord bot 開啟固定時間個人價格變動摘要，列出特定時間段內實際變價的商品，降低一直開網站追蹤的需求。
- 保留網站 accountless；Discord 個人化通知只使用 Discord user id，不建立網站帳號或跨平台帳號綁定。
- 讓維運者可以在服務異常時更快收到通知，而不是只能人工查看 container log。
- 讓維運者能更有效檢視資料品質、缺圖、連結健康與 crawler 狀態；第一輪採內網 ops status page / admin webhook，不做公開狀態頁。
- 補齊公開流量成長前需要的安全、監控、備份與驗證基礎。

## 非目標

第三版不做網站帳號、登入、網站端 watchlist、帳號保存菜單、Discord 帳號綁網站帳號、公開頻道個人通知、Discord 內保存配單、庫存 / 到貨通知、配單分類缺漏提示、規格資料、相容性檢查、自動推薦配單、購物 / 下單 / 自動購買、跨網站比價或多資料來源整合。Discord bot 第一輪只做個人目標價提醒與個人價格變動摘要，不做完整商品搜尋 bot、購買建議或複雜條件訂閱。

## 價格追蹤判斷

價格資料對使用者有意義，但第三版要區分「網站上的價格變化理解」與「Discord bot 個人化通知」。

- 有價值且已適合保留：商品價格歷史、近期漲跌、區間最低 / 最高 / 均價、配單或分享頁上的分享當下價格與目前價格差異提示。
- 第三版納入：Discord bot 個人目標價提醒、Discord bot 個人價格變動摘要。
- 仍暫不適合第三版：網站帳號、email 通知、跨平台帳號綁定、網站端 watchlist、複雜條件例如跌幅百分比 / 區間低點 / 分類批量訂閱。
- 原因：Discord bot 可以用 Discord user id 與 DM 建立低成本個人化通知，不必先建立網站帳號；但仍需要退訂、通知頻率、防濫用、去重與資料新鮮度邊界。

因此第三版的個人化通知只放在 Discord bot，不擴成網站帳號系統。分享配單若未來重啟，才再討論分享當下價格與目前價格差異提示。

## 使用者向 Discord 判斷

第三版使用者向 Discord 功能分成 webhook 與 bot：

- Public webhook：`crawler-daemon` 在有商品價格變動時，用公開 webhook 列出本輪變價商品、舊價、新價與差額；這是公開廣播，不是個人化訂閱。
- Admin webhook：`smoke-daemon` 對管理者 Discord 頻道送出 `WARN` / `FAIL` / `RECOVERED`，不推給一般使用者。
- Discord bot：處理個人化 slash commands、DM 目標價提醒與 DM 價格變動摘要。
- 分享入口：使用者貼上商品連結時，透過商品頁 Open Graph / canonical URL 提供安全摘要；目前不做分享配單 link preview。

Discord bot 第一輪指令：

- `/digest enable <interval> <window> [scope]`：開啟固定時間價格變動摘要。
- `/digest disable`：關閉價格變動摘要。
- `/digest settings`：查看目前摘要設定。
- `/digest now`：立即產生一次摘要，用於驗證設定與手動查看。
- `/watch <商品連結或商品ID> <目標價格>`：追蹤單一商品目標價。
- `/watchlist`：顯示自己的追蹤商品、目前價格、目標價格、是否已觸發與站內連結。
- `/unwatch <watch_id>`：取消追蹤；`watch_id` 使用 bot 產生的短 ID，不暴露 DB UUID。

價格變動摘要第一版限制：

- `interval` 只支援 `daily`、`every_12h`、`every_6h`。
- `window` 只支援 `24h`、`12h`、`6h`。
- `scope` 支援 `all` 與 `watchlist`，預設 `all`。
- 時區固定 `Asia/Taipei`。
- 每次最多列 50 筆，超過上限時顯示另有幾筆未列出。
- 摘要內容包含商品名稱、舊價、新價、差額、站內商品連結與更新時間。

目標價提醒第一版限制：

- `/watch` 第一版支援 PartsRadarTW 商品 URL 或站內商品 ID，不以原價屋 iBuy URL 作為主流程。
- 價格小於等於目標價時 DM 使用者。
- 同一 watch 達標後預設只通知一次；使用者修改目標價或重新建立 watch 才重新啟用。
- 通知內容包含商品名稱、目前價格、目標價格、差額、站內商品連結與更新時間。

安全與隱私邊界：

- 個人通知只走 DM，不在公開頻道暴露個人追蹤。
- Bot 只保存 Discord user id 與必要偏好，不建立網站帳號。
- 訊息不包含 iBuy token、來源購買 URL、raw HTML、crawler error detail、DB/internal URL、raw IP 或 internal headers。
- Bot commands 需有簡單 cooldown / rate limit，避免查詢與通知設定被濫用。
- Bot token 只能放在 untracked `.env` 或部署 secret，不提交 Git。

## 進入條件

- 第二版部署 closeout 已完成，且沒有未解釋的 production smoke `FAIL`。
- `smoke-daemon`、`maintenance-daemon`、`crawler-daemon` 與 `raw-snapshot-cleanup-daemon` 已能穩定執行。
- `/build-list` 已可在 local / public route 回 `HTTP 200`。
- `link health` temporary count 與 missing product images 仍只是來源 / 資料健康度觀察，沒有造成主要使用者流程失效。
- 文件、部署設定與實作狀態沒有明顯脫節。

## 範圍

以下保留第三版討論時選定的原始編號。第 6 項與其餘未列項目不納入第三版，細節以本文件「非目標」為準。

### 1. 第三版規劃文件

目標：讓 `docs/planning/v3-roadmap.md` 成為第三版 scope 的主要文件，其他文件只保留摘要與指向，不重複完整規則。

完成條件：

- 第三版會做、暫不做與需另開產品 / 資安設計的項目已寫清楚。
- 後續第三版實作都能用本文件判斷是否超出範圍。

### 2. Discord 通知：webhook 與 bot

目標：讓公開 Discord 頻道能看到有參考價值的整體價格變動資訊，讓維運者收到管理者告警，並讓使用者透過 Discord bot 收到個人化價格通知。

範圍：

- Webhook 保留給 public 價格變動清單與 admin smoke 告警。
- Discord bot 負責個人目標價提醒與個人價格變動摘要。
- 從現有 `production-smoke` / `smoke-daemon` 結果產生管理者告警，告警對象是維運者；支援 `FAIL`、需要人工注意的 `WARN`、恢復正常通知與 cooldown / 去重。
- public webhook 內容只能包含安全摘要；管理者告警可包含檢查名稱、狀態、簡短原因、時間與 runbook 方向。
- Discord webhook URL 與 bot token 只放在 untracked `.env` 或部署 secret，不提交 Git。
- Discord bot 需要新增 daemon、slash command registration、watch / digest 設定資料表與 notification delivery log。

完成條件：

- public 價格變動清單不包含 secret、raw HTML、DB URL、internal headers、crawler stack trace、parse error raw content 或 raw IP。
- 公開價格變動清單只列出本輪變價商品名稱、站內商品連結、舊價、新價與差額，並受 `PRICE_CHANGE_DISCORD_MAX_ITEMS` 上限控制。
- Discord bot 可讓使用者開關個人價格變動摘要，並可用 `/digest now` 立即取得摘要。
- Discord bot 可讓使用者建立、查看與取消單品目標價提醒。
- 目標價達標 DM 有去重，不會每輪 crawler 重複通知同一個已達標 watch。
- 個人通知不需要網站登入，不做公開頻道個人通知，不暴露個人追蹤清單。
- 單次 smoke 與 daemon 模式都能在測試設定下送出告警。
- 重複 `WARN` / `FAIL` 不會造成通知洗版。
- log 與 Discord message 不包含 `.env`、DB URL、Cloudflare token、raw HTML、stack trace、raw IP 或 internal header dump。
- Bot 指令、DM 與 delivery log 不包含 iBuy token、來源購買 URL、raw HTML、crawler error detail 或 internal URL。

### 3. 服務狀態頁（暫緩）

目標：提供使用者可理解的公開服務狀態，不讓一般使用者只能從查詢頁猜測服務是否異常。

目前狀態：暫緩。第二版既有來源狀態、production smoke、admin webhook 與 runbook 已足以支援目前流量；公開服務狀態頁對一般使用者價值有限，且容易把維運訊號誤解成商品資料或來源承諾。若未來有穩定公開流量或外部監控需求，再以獨立 slice 重啟。

範圍：

- 建立公開或半公開的 service status 頁面。
- 狀態來源只能使用 sanitised source status、public-only smoke 與安全聚合後的服務訊號。
- 顯示網站、查詢 API、商品圖片 API、來源資料 freshness、配單頁與價格歷史 API 等高層級狀態。
- 提供低干擾的資料延遲或部分服務異常說明。

完成條件：

- 狀態頁不公開 crawler internal errors、parse error message、raw snapshot、DB state、container log 或 secret。
- 狀態文字不暗示原價屋價格更新頻率保證，也不把來源狀態誤說成商品庫存狀態。
- 狀態頁失效時不影響首頁、商品列表、商品詳情與配單主要流程。

### 4. 外部監控整合

目標：補足第二版內部 `smoke-daemon` 的外部視角與長期觀察能力。

範圍：

- 評估並擇一或分階段導入 Uptime Kuma、Cloudflare monitoring、Grafana / Prometheus 或等價外部監控。
- 監控公開首頁、主要 API、圖片 API、配單頁與 public-only smoke；不監控內網 `ops-web`。
- 保留內部 `smoke-daemon` 作為 DB-backed / deployment-internal 檢查來源。
- 建立監控設定、告警門檻與回復流程文件。

完成條件：

- 外部監控能辨識 public route / API 掛掉，而不是只依賴 container health。
- 外部監控不需要 DB access、不讀 `.env`，也不接觸 raw snapshot storage。
- 監控告警與 Discord 管理者告警不互相洗版。

### 5. 分享配單連結（暫緩）

目標：讓第二版 accountless 配單可以產生唯讀分享連結，但不引入帳號保存菜單。

目前狀態：暫緩。使用者可用 Excel 匯出或截圖分享配單，直接建立 server-side share token / retention / snapshot / abuse guard 的成本高於近期價值。第三版已改優先完成商品詳細頁分享按鈕與商品 Open Graph preview。

範圍：

- 提供建立分享配單的 API 與頁面。
- 分享內容保存必要的商品 ID、商品名稱、分類、數量、價格、更新時間、來源連結與產品介紹連結。
- 分享頁是唯讀，不提供購物車、下單、自動購買、相容性承諾或購買建議。
- 分享 token 需不可猜測，可設定過期或資料保留期限。
- 可選擇以 server-side snapshot 保存分享當下內容，避免未來商品變動導致分享內容失真；同時可顯示目前價格已變動的提示。

完成條件：

- 不需要登入，也不保存使用者身份。
- 分享 API 有 rate limit、payload 大小限制、項目數限制與輸入驗證。
- 分享頁不暴露內部 product identity、`iBuyToken`、raw snapshot 或 crawler metadata。
- 分享頁在桌面與手機都可閱讀，且不造成水平溢出。

### 7. 資料品質與維運檢視

目標：讓維運者可以更快看出資料健康度問題，而不是只靠零散 log。

範圍：

- 建立管理者用內部維運檢視，用於查看 source freshness、crawl result、parse error count、suspected block、缺圖、link health temporary / broken count、raw snapshot retention 與 active product count。
- 第一輪使用 `ops-web` 內網 service 與 `/ops/status` page，公開 `web` 服務預設回 `404`。
- `ops-web` 需維持 localhost / private tunnel 邊界，並要求 token；不得接到 public tunnel。
- 保持資料品質檢視與使用者公開狀態頁分離。

完成條件：

- 維運檢視能指出需要人工處理的資料類型與建議 runbook 方向。
- 不公開 raw HTML、parse error raw content、DB URL、token 或 secret-bearing error。
- web dashboard 必須完成 access control / auth / network boundary 設計，且 public `web` 不能看到頁面內容。

### 8. 公開流量成長硬化

目標：在公開流量變大前補齊安全、監控、備份與驗證基礎。

範圍：

- 更嚴格 CSP：先 report-only 觀察，再視結果收斂到 enforce。
- Cloudflare WAF / security rules / rate limiting 調校。
- 評估 distributed / Redis-backed rate limiting；若仍單一 web container，需明確記錄限制。
- 備份與還原演練：PostgreSQL、product image cache、必要 deployment config。
- Playwright CI：穩定網域或可設定 `E2E_BASE_URL` 的 desktop / mobile smoke。
- 自動弱點掃描或 dependency audit baseline。

完成條件：

- public route / API / image API / build-list 都有基本 smoke 或 E2E 驗證。
- 備份與還原流程有可執行 runbook，且不包含真實 secret。
- 硬化措施不破壞正常瀏覽、圖片載入、配單、商品分享與 public price-change webhook。

## 建議切片

### v3.0：商品分享與 webhook 基礎

- 第三版規劃文件。
- 商品頁 Open Graph / Discord link preview。
- 商品詳細頁分享按鈕與 canonical share URL。
- Discord 公開價格變動 webhook。
- Discord 管理者告警。

### v3.1：Discord Bot 個人化通知

- Discord bot daemon 與 slash command registration。
- 個人價格變動摘要：`/digest enable`、`/digest disable`、`/digest settings`、`/digest now`。
- 個人目標價提醒：`/watch`、`/watchlist`、`/unwatch`。
- Watch / digest 設定資料表、Discord user preference、notification delivery log。
- DM 通知去重、cooldown / rate limit、secret 與訊息安全邊界。

### v3.2：維運檢視、外部監控與公開流量硬化

- 受保護的內網 ops status page 與資料品質維運檢視。
- 外部監控整合第一輪。
- 告警 cooldown / 去重、回復通知與 runbook 文件。
- 更嚴格 CSP、Cloudflare / rate limit 調校、備份還原演練、Playwright CI、dependency / vulnerability baseline。

## 待決定

- 分享配單是否重啟；若重啟，需先確認使用者價值是否高於 Excel / 截圖分享。
- 公開服務狀態頁或公開狀態推播是否重啟；若重啟，需先確認一般使用者是否真的需要，而不是只服務維運者。
- 外部監控工具選型與部署位置。
- 內網 ops status page 是否已足夠，或是否還需要額外 CLI 報表。
- Discord digest 的預設每日發送時間。
- `/watch` 未來是否支援原價屋 URL 或 Discord 內搜尋商品。
