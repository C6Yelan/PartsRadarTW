# 第三版 Roadmap

本文件是第三版規劃的主要來源。第三版把第二版完成的公開網站、配單與 log 型維運能力，升級成更容易維護、可被監控、可分享配單且更適合公開流量成長的版本。

## 目標

- 讓維運者可以在服務異常時更快收到通知，而不是只能人工查看 container log。
- 讓公開服務有使用者可理解的服務狀態頁，但不公開內部 crawler、DB、raw snapshot 或 parse error 細節。
- 讓第二版的 accountless 配單可以分享給其他人查看。
- 讓維運者能更有效檢視資料品質、缺圖、連結健康與 crawler 狀態。
- 補齊公開流量成長前需要的安全、監控、備份與驗證基礎。

## 非目標

第三版不做個人化帳號、個人價格提醒、使用者導向 Discord bot、收藏 / watchlist、帳號保存菜單、配單分類缺漏提示、規格資料、相容性檢查、自動推薦配單、購物 / 下單 / 自動購買、跨網站比價或多資料來源整合。這些項目若未來真的需要，必須另開產品與資安設計，不從第三版自然延伸。

## 進入條件

- 第二版部署 closeout 已完成，且沒有未解釋的 production smoke `FAIL`。
- `smoke-daemon`、`maintenance-daemon`、`crawler-daemon` 與 `raw-snapshot-cleanup-daemon` 已能穩定執行。
- `/build-list` 與 `/build-list/print` 已可在 local / public route 回 `HTTP 200`。
- `link health` temporary count 與 missing product images 仍只是來源 / 資料健康度觀察，沒有造成主要使用者流程失效。
- 文件、部署設定與實作狀態沒有明顯脫節。

## 範圍

以下保留第三版討論時選定的原始編號。第 6 項與其餘未列項目不納入第三版，細節以本文件「非目標」為準。

### 1. 第三版規劃文件

目標：讓 `docs/planning/v3-roadmap.md` 成為第三版 scope 的主要文件，其他文件只保留摘要與指向，不重複完整規則。

完成條件：

- 第三版會做、暫不做與需另開產品 / 資安設計的項目已寫清楚。
- 後續第三版實作都能用本文件判斷是否超出範圍。

### 2. Discord 管理者告警

目標：讓維運者在 production smoke 或資料流出現異常時收到低噪音 Discord 通知。

範圍：

- 從現有 `production-smoke` / `smoke-daemon` 結果產生管理者告警。
- 告警對象是維運者，不是一般使用者。
- 支援 `FAIL`、需要人工注意的 `WARN`、恢復正常通知與 cooldown / 去重。
- 告警內容包含檢查名稱、狀態、簡短原因、時間與 runbook 方向。
- Discord webhook / bot token 只放在 untracked `.env` 或部署 secret，不提交 Git。

完成條件：

- 單次 smoke 與 daemon 模式都能在測試設定下送出告警。
- 重複 `WARN` / `FAIL` 不會造成通知洗版。
- log 與 Discord message 不包含 `.env`、DB URL、Cloudflare token、raw HTML、stack trace、raw IP 或 internal header dump。
- 這不是使用者導向 Discord bot，也不提供使用者價格通知。

### 3. 服務狀態頁

目標：提供使用者可理解的公開服務狀態，不讓一般使用者只能從查詢頁猜測服務是否異常。

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
- 監控公開首頁、主要 API、圖片 API、狀態頁與 public-only smoke。
- 保留內部 `smoke-daemon` 作為 DB-backed / deployment-internal 檢查來源。
- 建立監控設定、告警門檻與回復流程文件。

完成條件：

- 外部監控能辨識 public route / API 掛掉，而不是只依賴 container health。
- 外部監控不需要 DB access、不讀 `.env`，也不接觸 raw snapshot storage。
- 監控告警與 Discord 管理者告警不互相洗版。

### 5. 分享配單連結

目標：讓第二版 accountless 配單可以產生唯讀分享連結，但不引入帳號保存菜單。

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

- 建立管理者用 CLI 報表或內部維運檢視，用於查看 source freshness、crawl result、parse error count、suspected block、缺圖、link health temporary / broken count、raw snapshot retention 與 active product count。
- 優先支援 CLI / private ops output；若要做 web dashboard，需先定義 auth 或只允許內部網路 / tunnel 保護後使用。
- 保持資料品質檢視與使用者公開狀態頁分離。

完成條件：

- 維運檢視能指出需要人工處理的資料類型與建議 runbook 方向。
- 不公開 raw HTML、parse error raw content、DB URL、token 或 secret-bearing error。
- 若做 web dashboard，必須先完成 access control / auth / network boundary 設計。

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

- public route / API / image API / build-list / status page 都有基本 smoke 或 E2E 驗證。
- 備份與還原流程有可執行 runbook，且不包含真實 secret。
- 硬化措施不破壞正常瀏覽、圖片載入、配單與分享配單流程。

## 建議切片

### v3.0：維運通知與狀態可視化

- 第三版規劃文件。
- Discord 管理者告警。
- 服務狀態頁。
- 外部監控整合第一輪。

### v3.1：分享配單

- 分享配單資料模型與 API。
- 分享配單頁面。
- 分享 payload / token / retention / rate limit。

### v3.2：維運檢視與公開流量硬化

- 資料品質與維運檢視。
- 更嚴格 CSP、Cloudflare / rate limit 調校、備份還原演練、Playwright CI、dependency / vulnerability baseline。

## 待決定

- Discord 告警使用 webhook 還是 bot token；第一輪優先考慮 webhook，除非需要互動式命令。
- 服務狀態頁是否完全公開，或只以低調 public route / Cloudflare Access 保護。
- 分享配單保留期限與最大品項數。
- 分享配單是否保存分享當下價格 snapshot，或每次讀取時對照目前價格。
- 外部監控工具選型與部署位置。
- 維運檢視是否只做 CLI，或需要受保護的 web dashboard。
