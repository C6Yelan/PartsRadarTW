# Discord Bot

PartsRadarTW Discord bot 提供個人價格報告、目標價提醒與伺服器公開價格變動報告。網站本身仍不建立會員帳號；Discord 功能以 Discord user／guild／channel ID 保存必要設定。

使用者操作說明可直接查看網站的 [`/discord`](https://partsradar.net/discord) 頁面。

## Commands

| Command | Context | 用途 |
| --- | --- | --- |
| `/bot help` | Guild、DM | 顯示 bot 功能說明。 |
| `/price-report now [window]` | Guild、DM | 在目前 context 產生 6／12／24 小時價格報告。 |
| `/price-report settings` | Guild、DM | 管理每日 DM 報告。 |
| `/watch` | Guild、DM | 建立、編輯、查看與移除目標價 watch。 |
| `/public-report settings` | Guild | 設定頻道、分類、內容、啟用狀態與測試發送。 |
| `/status` | Guild | 查看爬蟲、通知與價格報告排程狀態。 |

`/public-report settings` 與 `/status` 預設要求使用者具備 Manage Guild 權限，回覆只會顯示給操作者。

## 個人報告

每日 DM 報告可以設定：

- 台北時間的發送時間。
- 6、12 或 24 小時統計區間。
- 商品分類。
- 降價、漲價與新商品內容。
- 最多五組商品名稱關鍵字。

`/price-report now` 在目前 Guild 或 DM 回覆；scheduled report 以 DM 發送。單次報告最多列出 50 筆。

## 目標價提醒

`/watch` 接受 PartsRadarTW 商品 URL、站內 path 或商品 UUID。每位使用者最多啟用 50 筆 watch。

當目前價格小於或等於目標價時，daemon 會 claim 該筆通知並嘗試發送 DM；同一輪多筆達標會合併成 digest。失敗可以重試，成功後不重複發送，除非使用者重新編輯／重設 watch。

這不是即時庫存或購買保證。價格是否仍有效仍應回到來源商家確認。

## 公開價格報告

每個 Guild 可設定一個目標頻道與篩選條件。商品資料更新完成後，Bot 會送出有變化的商品並保存發送結果。

公開報告設定面板會顯示目前狀態、頻道與最近一次發送結果；「發送測試」按鈕可驗證目前設定與頻道權限。

## 權限

安裝 scope：

```text
bot applications.commands
```

初始 invite 可以使用 `permissions=0`；Gateway 使用 `intents=0`。實際公開報告頻道需要 bot 的 Send Messages 與 Embed Links 權限。DM 功能另受使用者隱私設定與 Discord 狀態影響。

## Runtime 設定

必要環境變數：

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`

選用設定：

- `DISCORD_BOT_INVITE_URL`
- `DISCORD_BOT_REGISTER_COMMANDS_ON_START`
- `DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED`
- `DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED`
- `DISCORD_FEATURE_TARGET_WATCHES_ENABLED`
- `DISCORD_BOT_COMMAND_COOLDOWN_SECONDS`
- `DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS`

功能 flag 只停用對應行為，不刪除 commands、settings 或 delivery history。

手動註冊 commands：

```bash
pnpm ops:discord-bot -- --register-commands
```

Compose 啟動方式見 [deployment.md](deployment.md)；維運檢查見 [operations.md](operations.md)。

## 保存資料與限制

資料庫會保存 Discord user、guild、channel ID、個人偏好、watch、notification claim 與安全化 delivery metadata。它不保存 Discord 原始 provider response body 或新寫入的 raw error message。

目前沒有完整的 Discord 資料 retention／自助刪除 policy，也不保證：

- DM 一定可送達。
- 每日報告在指定分鐘準時送出。
- Discord API、權限或 rate limit 永遠可用。
- Public invite 一定已對外發布。

部署前應確認資料處理方式符合實際營運需求，並在公開使用前補上適當的隱私與刪除流程。
