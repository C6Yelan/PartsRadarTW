# Recovery operations

## Backup 與 restore 責任

使用時機：每次 production migration 前，以及固定營運週期。

備份工具、排程、儲存位置、加密、保留期限與離機副本由部署端依實際環境負責；repository 不提供或指定通用備份腳本。最低備份範圍包含 PostgreSQL 與 `product_images` storage；`snapshots` 依排障／稽核需求決定是否納入。

需要 DB 與 volumes 接近同一恢復點時，備份前應暫停 crawler、image recovery、snapshot cleanup 與其他 writers。部署端必須在與 production 分離且 PostgreSQL major version 相容的環境完成還原驗證，確認備份完整性、DB 可還原、Prisma migration history 是 repository migration 的有效前綴，且核心資料與納入備份的 storage 可讀取。

還原驗證不得覆寫 production DB 或 storage。Restore gate：

1. 還原到沒有 production ingress、Discord token 或外部來源網路權限的隔離環境。
2. 在 restored DB 可被 scheduler 讀取前停止 `discord-bot`，並將 `DISCORD_FEATURE_PUBLIC_REPORTS_ENABLED`、`DISCORD_FEATURE_PERSONAL_REPORTS_ENABLED` 與 `DISCORD_FEATURE_TARGET_WATCHES_ENABLED` 設為 `false`。
3. 停止 crawler、image recovery、snapshot cleanup 與其他 writers，再還原 PostgreSQL 及納入備份的 storage。
4. 使用 frozen release 與管理連線執行 `pnpm db:deploy`、`pnpm db:configure-runtime-role`，確認 migration history 與 runtime role 權限符合 [Migration gate](../deployment/release.md#migration-gate)。
5. 執行 `pnpm ops:discord-privacy -- cleanup` dry-run，審查後才使用 `--confirm-cleanup`。
6. 從受保護案件紀錄取得仍在最長備份保留期內的已驗證刪除案件，依事前核准的 maintenance replay 程序逐案套用既有 idempotent erase domain。
7. 逐案確認 personal settings、watches、deliveries、actor metadata、verification requests，以及 pending retry、target claim、notification cursor 或已排程 delivery 都已清除。
8. 執行 private full smoke；準備 public cutover 時再執行 browser gates 與 public-only smoke。
9. 由指定操作人員審查 migration、privacy、資料與 smoke 證據後，才可逐一恢復 Discord feature flags、writers 與 public ingress。

不得只因資料來自舊備份就略過原案件授權，也不得臨時建立繞過驗證的 public／general-purpose CLI。Phase 1 不保存 tombstone，consumed request 也已去識別，因此部署端必須在受控案件系統保存可覆蓋最長 backup rotation 的完成案件清單。缺少清單或核准程序即為 NO-GO。

## Incident 與 rollback

1. 停止 public ingress 與 external writers；需要時保留 web read-only 供診斷。
2. 保存 service 狀態、sanitized logs、migration history 與必要 snapshot。
3. 若資料仍一致，依 [Release rollback](../deployment/release.md#rollback) 修正或回退向後相容的 application image。
4. 若 DB 受影響，先在隔離環境驗證部署前備份，再執行受控還原。
5. 重新啟動時依 web → private smoke → crawler／smoke／Discord → public ingress 順序。

禁止使用 `git reset --hard`、刪除 volume、`prisma migrate reset` 或手動修改 `_prisma_migrations` 當作 production recovery。
