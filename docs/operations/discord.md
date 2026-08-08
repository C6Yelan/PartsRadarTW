# Discord operations

## Discord bot

使用時機：設定 token／application ID 後註冊 commands 並啟動 daemon。

註冊 commands：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  node --import tsx src/scripts/ops/discord-bot.ts --register-commands
```

啟動：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot up -d
docker compose -f compose.yml -f compose.ops.yml logs --tail=100 discord-bot
```

成功標準：Commands bulk overwrite 成功、Gateway 連線、`/bot help` 可用；需要的 DM／channel 權限另行實測。

失敗處理：確認 token、application ID、Discord API 狀態與最小權限。不要記錄 raw token、provider response body 或使用者私訊內容。

### 個人排程報告 retry 狀態

個人排程報告每次最多由一個 daemon claim 15 分鐘。可恢復的 transport／provider 錯誤與 Discord rate limit 共用最多 5 次的持久 retry budget；前四次重試依序退避 5、10、20、40 分鐘，另加最多 1 分鐘 jitter，第五次失敗停止重試。Discord `retry-after` 獨立作為最早重試時間，輸入上限為 24 小時。daemon 重啟不會重設次數；有效 claim 會等到 lease 到期才重新喚醒，不會因已到期的原排程時間每秒輪詢。

DM 關閉、權限、認證或其他永久 4xx 會進入 `paused_permanent_failure`；第五次可恢復失敗進入 `paused_retry_exhausted`；部分訊息已送出後失敗則進入 `paused_partial_delivery`，避免自動重送造成重複。三種 paused 狀態都會停用設定並清空 `next_send_at`，沿用停用個人設定的 30 天 retention。使用者重新啟用排程時會重設 retry／claim 狀態並建立新的正常排程。

daemon 每輪 aggregate log 會顯示 retry 與各 paused count，但不包含 Discord user ID。若 paused count 非零，先依 delivery 的結構化 category、HTTP status 與 provider code 判斷 Discord 權限或服務狀態；不要從 provider message 字串推測，也不要手動改動 retry 欄位。`paused_partial_delivery` 代表可能已有部分內容送達，恢復前應先評估重複通知風險。

部署時先以 migration role 執行 append-only migration，再重新執行 runtime-role 收斂，最後重建／重啟 `discord-bot`。舊版 application 不使用新增欄位；application rollback 不需要刪除 enum、欄位或 index，且已 paused 的設定因 `enabled=false`、`next_send_at=NULL` 不會被舊版自動重送。

## 個人資料申請

使用時機：收到寄至隱私權政策聯絡信箱的 Discord 個人資料查詢或刪除申請。這是部署端管理流程，不提供 public API 或一般使用者 CLI。

開始前確認：

- 申請仍在原 Email thread，且包含申請類型與 Discord user ID。
- `discord-bot` service 可連線 production DB、讀取 `DISCORD_BOT_TOKEN`，且 Bot 能向申請帳號傳送 DM。
- 在存取受控的案件系統記錄案件編號、申請類型、Discord user ID、收件時間與處理結果；不得記錄驗證碼、Bot token、Email 密碼或不必要的私人資料。
- 驗證 request 從建立起 30 分鐘後失效，驗證成功後的 inspect／erase 也必須在同一到期時間前完成。因此應在操作人員已準備好處理時才建立 request。

以互動輸入取得 Discord user ID，避免把 ID 直接寫進 shell history：

```bash
read -rp "Discord user ID: " DISCORD_USER_ID
```

查詢申請使用 `inspect`，刪除申請使用 `erase`：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  node --import tsx src/scripts/ops/discord-privacy.ts create-verification \
  --request-type erase \
  --discord-user-id "$DISCORD_USER_ID"
```

成功 JSON 必須包含 `status:"pending"`、`requestId` 與 `expiresAt`，`subject` 只顯示 masked ID。將 request ID 與到期時間記入受保護案件紀錄。Bot 會私訊八位數驗證碼；若 DM 失敗，CLI 會取消 request，不得改用 Email 傳送新產生的驗證碼。

申請者必須在原 Email thread 回覆驗證碼。驗證碼不放在 CLI argument、暫存檔或 shell history：

```bash
read -rp "Request ID: " REQUEST_ID
read -rsp "Verification code: " PRIVACY_CODE
printf '\n'
printf '%s\n' "$PRIVACY_CODE" | \
  docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm -T discord-bot \
    node --import tsx src/scripts/ops/discord-privacy.ts verify-code --request-id "$REQUEST_ID"
unset PRIVACY_CODE
```

成功結果必須是 `status:"verified"`，且 `requestType` 與 Email 申請一致。驗證碼最多嘗試五次；`invalid`、`expired`、`cancelled`、`attempts_exhausted`、`not_found` 或類型不符時不得繼續。

需要確認狀態時執行：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  node --import tsx src/scripts/ops/discord-privacy.ts show-verification-status --request-id "$REQUEST_ID"
```

### 查詢

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  node --import tsx src/scripts/ops/discord-privacy.ts inspect-user --request-id "$REQUEST_ID"
```

`inspect-user` 只回傳個人報告設定、目標價提醒、通知紀錄、公開報告 actor metadata 與驗證 request 的筆數，並消耗該 request；它不是完整資料複製本。

### 刪除

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  node --import tsx src/scripts/ops/discord-privacy.ts erase-user --request-id "$REQUEST_ID" --confirm-erase
```

只有明確提供 `--confirm-erase` 才會查詢並刪除資料。未提供時只回傳 `dryRun:true`，不查詢 request 對應資料，不能當作刪除預覽。

成功結果必須包含 `dryRun:false` 與刪除前 `counts`。操作會刪除個人報告設定、目標價提醒與個人通知紀錄，清除公開報告的建立者／更新者 ID，取消同一 user 的其他驗證 request，並消耗本次 request。

### 取消

若申請撤回、Email 身分有疑義或無法在期限內完成，在尚未驗證時取消：

```bash
docker compose -f compose.yml -f compose.ops.yml --profile discord-bot run --rm discord-bot \
  node --import tsx src/scripts/ops/discord-privacy.ts cancel-verification --request-id "$REQUEST_ID"
```

## 完成與限制

完成後在案件系統保存處理時間、request ID、動作、masked subject、結果與必要 counts，並透過原 Email thread 回覆。已完成刪除案件的受保護清單必須至少涵蓋最長備份 rotation，供 [restore gate](recovery.md#backup-與-restore-責任) replay；不得在一般 application log 保存 raw Discord ID 或驗證碼。

標準 CLI 只覆蓋帳號控制權驗證、筆數盤點與刪除，不提供完整資料複製本、欄位補充／更正或獨立的停止蒐集／處理命令。收到這些申請時，不得只以 `inspect-user` counts 回覆已完成，也不得臨時執行未審查 SQL；案件應保持開啟並交由指定操作人員建立及核准個案處理程序。使用者權利案件原則上仍須依隱私權政策在 30 日內處理或另行回覆。
