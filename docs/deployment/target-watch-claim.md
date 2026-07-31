# Target-watch claim migration

本 runbook 限定 RC-09 target-watch bounded claim 的 expand migration、application cutover 與 rollback gate。一般 release 順序仍以 [Release](release.md) 與 [Recovery](../operations/recovery.md) 為準。

## Expand／contract 邊界

本次 expand migration 只建立：

- `discord_target_price_notification_scan_state` singleton derived scan state；
- `discord_target_price_watches_pending_scan_idx` partial index。

既有 `discord_target_price_watches_notification_due_idx` 必須保持 valid／ready，供部署中途失敗與舊 application image rollback 使用。移除舊 index 不屬於本次 release；只有在新版本已穩定運作、production plan evidence證明新 access path成立，且舊 image rollback window關閉後，才可另開 append-only cleanup migration審查。

Scan state只保存可重建的掃描 cursor與round high-water，不複製watch、product或current-price truth。Domain truth仍位於既有正規化 tables；migration管理角色負責DDL，runtime role只取得 application DML，不得擁有relation、執行DDL或讀取`_prisma_migrations`。

## 部署前 gate

1. 凍結已審核 commit與 immutable web、crawler、migrate image references。
2. 確認 migration history是repository的有效prefix，且沒有failed／pending migration；不得改寫已套用 migration或手動修改`_prisma_migrations`。
3. 依 [Recovery](../operations/recovery.md#backup-與-restore-責任) 完成production backup與isolated restore。Restore環境不得有production ingress、Discord token或外部來源權限。
4. 在isolated restore執行empty／current／legacy matrix及runtime-role convergence，確認兩個index都是valid／ready。
5. 記錄目前 crawler image reference，並確認回退image不依賴新scan-state table。
6. 停止target-watch writer。此writer與其他Discord功能共用daemon時，停止`discord-bot` service；不可只依賴排程剛好未觸發。確認沒有正在執行的target-watch cycle後才進行migration。

任一 gate失敗即為NO-GO。不要以production資料執行破壞性、壓力或大量重送測試。

## Migration與private smoke

使用migration管理連線與frozen migrate image，依序執行：

```bash
pnpm db:deploy
pnpm db:configure-runtime-role
```

不得使用`prisma db push`、`prisma migrate reset`或development migration command。`db:configure-runtime-role`失敗時不得啟動writer。

以管理連線執行以下sanitized validity gate；輸出只包含index名稱與布林狀態：

```sql
SELECT index_class.relname AS index_name,
       index.indisready,
       index.indisvalid
FROM pg_index AS index
JOIN pg_class AS table_class ON table_class.oid = index.indrelid
JOIN pg_class AS index_class ON index_class.oid = index.indexrelid
JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
WHERE namespace.nspname = 'public'
  AND table_class.relname = 'discord_target_price_watches'
  AND index_class.relname IN (
    'discord_target_price_watches_notification_due_idx',
    'discord_target_price_watches_pending_scan_idx'
  )
ORDER BY index_class.relname;
```

兩列都必須存在，且`indisready`、`indisvalid`皆為true。接著以runtime role完成：

1. target-watch所需read／claim／delivery DML private smoke；
2. scan-state table read／update；
3. application relation DML成功；
4. DDL、role management與`_prisma_migrations` read被拒絕；
5. 不送出真實Discord訊息、不輸出user／product／Discord IDs。

完成private smoke後才以reviewed crawler image恢復`discord-bot`／target-watch writer。第一輪只觀察aggregate scanned、claimed、sent、failed與claim-age資訊；不得將synthetic evidence描述為production完成。

## Failure與forward recovery

Migration或role convergence任何一步失敗時：

1. 保持target-watch writer停止，保存sanitized error、release SHA、migration狀態及兩個index的validity。
2. 確認舊`discord_target_price_watches_notification_due_idx`仍valid／ready。若舊index缺失或invalid，判定NO-GO，不啟動任何target-watch image。
3. 不刪除volume、不重跑destructive command、不手動修改`_prisma_migrations`，也不改寫已發布migration。
4. 若只有新table／新index部分建立，保留向後相容物件；不要在事故處理中臨時drop舊index。
5. 以reviewed fix-forward release處理failed migration或invalid新index。需要額外DDL時，使用新的append-only recovery migration與正式Prisma recovery流程，先在isolated restore重現並通過matrix。
6. 重新執行`db:deploy`、`db:configure-runtime-role`、index validity及private smoke；全部通過前writer維持停止。

## Application rollback prerequisites

只有下列條件全部成立時，才可保留expanded schema並回退crawler application image：

- 舊due index仍存在且valid／ready；
- migration history已確認一致，沒有未處理的failed migration；
- domain tables與既有columns未被drop、rename或改變語意；
- 舊image不需要scan-state table，且其target-watch query在isolated restore通過；
- runtime role仍具有舊image所需DML，且沒有DDL、ownership或migration metadata權限；
- 回退image reference已凍結，private smoke通過。

回退後保留新table與新index；不得為了模擬舊schema而drop expand物件。部署前image若仍是未修正的unbounded target-watch實作，只能用於恢復其他相容服務，target-watch writer必須保持停止，直到reviewed fix-forward image通過全部gate。只有回退目標本身已具bounded claim安全契約時，才可重新恢復writer。

## Disposable PostgreSQL 18 matrix

| Case | Initial state | Required action | Pass condition |
| --- | --- | --- | --- |
| Empty | 空database | 套用全部committed migrations，收斂runtime role | migration 0 failed／pending；新table與兩個index valid；runtime DML allow、DDL deny |
| Current | 最新main migration prefix與代表性watches | 套用RC-09 migration兩次`db:deploy` | 第一次upgrade成功、第二次no-op；資料不變；兩個index valid |
| Legacy | 有效prefix至少包含`20260621030000_add_target_price_notification_claim`與代表性watches | 套用剩餘migrations與RC-09 | 舊due index全程保留；新table singleton正確；新partial index valid |
| Statement failure | 分別在RC-09每個statement後注入失敗 | 停止，不做contract cleanup | 每個prefix後舊due index仍valid且舊query可用 |
| Application rollback | RC-09已成功、兩個index共存 | 使用部署前crawler image且保持target-watch writer停止，執行private smoke | 舊image不讀新table仍可啟動相容服務，舊query access path存在，沒有schema或grant錯誤 |

Repository integration test `packages/db/tests/target-price-notification/migration.integration.test.ts`覆蓋deployed current schema、populated legacy upgrade、每個statement failure prefix與舊query access path。Empty/current完整Prisma history、runtime-role convergence及application image rollback仍須在disposable PostgreSQL 18／isolated restore執行。
