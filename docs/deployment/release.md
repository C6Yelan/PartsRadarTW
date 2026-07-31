# Release

本文件定義 production release image、migration、驗證與 application rollback gate。部署順序見 [Deployment](README.md)；事故處理見 [Recovery](../operations/recovery.md)。

## Release image references

Compose 將 runtime 固定到三個可覆寫的 image reference：

- `PARTSRADAR_WEB_IMAGE`
- `PARTSRADAR_CRAWLER_IMAGE`
- `PARTSRADAR_MIGRATE_IMAGE`

預設的 `:local` tag 只供本機驗證。正式部署必須設定不重複使用的 release tag 或 registry digest，並記錄實際 image ID／digest。

Public ingress 另使用 `CLOUDFLARED_IMAGE`。Compose 預設為已驗證且支援token-file的 `cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d`。所有override必須包含 `@sha256:<64-hex-digest>`；tag-only reference一律拒絕。正式release仍應記錄實際pulled image ID／platform digest。

在部署主機建置時：

```bash
export PARTSRADAR_WEB_IMAGE='partsradar-tw-web:<release-id>'
export PARTSRADAR_CRAWLER_IMAGE='partsradar-tw-crawler:<release-id>'
export PARTSRADAR_MIGRATE_IMAGE='partsradar-tw-migrate:<release-id>'
docker compose build web migrate storage-init
docker image inspect "$PARTSRADAR_WEB_IMAGE" "$PARTSRADAR_CRAWLER_IMAGE" "$PARTSRADAR_MIGRATE_IMAGE"
```

若 image 由 registry 提供，先 pull 並驗證完整 tag／digest。後續啟動一律使用 `--no-build`，不得覆寫同一 release tag。

Repository root 是 Docker build context；`.dockerignore` 必須排除備份、database exports、封存檔、deployment secrets 與 private keys。Release validation 使用不含真實資料的 sentinel 驗證 crawler／migrate image 不含被排除內容；不得用真實備份測試或加入 `COPY` exception。

## Migration gate

升級前建立備份，再檢查目前 migration history：

```bash
docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --command "select migration_name, checksum, finished_at from \"_prisma_migrations\" order by started_at;"'
```

規則：

- 不得重寫已套用到任何持久 DB 的 migration。
- Local migration checksum 與 `_prisma_migrations` 不一致時停止部署，不手動竄改 history。
- Destructive enum／table change 必須先證明沒有仍需相容的資料，並在 disposable PostgreSQL 18 驗證 legacy、current 與 empty migration path。
- Production 使用 `pnpm db:deploy`／`migrate` image，不使用 development migration command。
- Host-side maintenance 依序執行 `pnpm db:deploy` 與 `pnpm db:configure-runtime-role`；Compose `migrate` service 已封裝相同順序。
- SSD facet projection 的同步、重建、taxonomy 變更與 rollback gate 見
  [SSD facet availability projection](product-facet-availability.md)。
- Migration history、DDL 與 `_prisma_migrations` 只由管理連線存取；runtime role 不執行 Prisma migration。

`db:configure-runtime-role` 必須確認 runtime login 不是 superuser、database owner，也沒有其他 role membership，只具有 application schema 所需的 connect、usage、DML、view read 與 sequence usage；`_prisma_migrations` 不授權給 runtime role。

## Release validation

部署前至少需要：

- `pnpm check`
- `pnpm test:all`
- `pnpm db:validate`
- Playwright desktop／mobile 關鍵流程
- PostgreSQL 18 disposable migration matrix
- 所有啟用 Compose profiles 的 config
- Cloudflare token source file 的 owner／mode preflight，以及 cloudflared container argv、environment、secret mount 的 sanitized inspect
- `web`、`crawler`、`migrate` image build
- Build-context sentinel 與 image 內容檢查
- Runtime role attributes、object grants、application 讀寫與 DDL 拒絕測試
- 既有部署的備份與隔離還原驗證；首次部署改驗證空庫初始化
- Private full smoke，再執行 public-only smoke

Smoke threshold 是部署預設，不等於已依 production baseline 校準。WARN 必須判讀；FAIL 必須阻止 cutover。

## Rollback

先依 [Incident 與 rollback](../operations/recovery.md#incident-與-rollback) 停止 external writers 與 public ingress並保存證據。

只在 schema 向後相容時，把 `PARTSRADAR_WEB_IMAGE`／`PARTSRADAR_CRAWLER_IMAGE` 切回部署前記錄的 reference；維持目前 schema、migrate image與分離後的 runtime credentials，再重建受影響服務：

```bash
docker compose up -d --no-build --force-recreate web
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d --no-build --force-recreate crawler-daemon image-cache-recovery-daemon raw-snapshot-cleanup-daemon
docker compose -f compose.yml -f compose.ops.yml --profile ops --profile discord-bot up -d --no-build --force-recreate smoke-daemon discord-bot
```

無法確認 migration history、備份可還原或 release smoke 時，部署判定為 NO-GO。
