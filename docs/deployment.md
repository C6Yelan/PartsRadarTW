# Deployment

PartsRadarTW 以 Docker Compose 支援單一主機部署。核心服務預設只綁定 loopback；public ingress、crawler、smoke 與 Discord 都由獨立 overlay／profile 啟用。

## 前置需求

- Docker Engine 與 Docker Compose plugin。
- 足夠保存 PostgreSQL、商品圖片與 raw snapshots 的持久儲存空間。
- 已從 `.env.example` 建立未追蹤的 `.env`。
- PostgreSQL 18 相容的備份與還原工具；Compose 預設 `postgres:18-alpine`。

必要環境變數：

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_RUNTIME_USER
POSTGRES_RUNTIME_PASSWORD
MIGRATION_DATABASE_URL
DATABASE_URL
```

`POSTGRES_USER`／`POSTGRES_PASSWORD` 是 PostgreSQL image 首次初始化及 migration 使用的管理角色；既有 volume 升級時必須沿用原管理角色。`POSTGRES_RUNTIME_USER`／`POSTGRES_RUNTIME_PASSWORD` 是 Web、crawler、Discord、smoke 與 seed 共用的低權限 application role，必須與管理角色不同。Compose 只把 `MIGRATION_DATABASE_URL` 傳給 `migrate` one-shot service，所有長駐服務只取得由 runtime credentials 組成的 `DATABASE_URL`。Host-side Prisma migration 也使用 `MIGRATION_DATABASE_URL`；一般 application／本機執行使用 `DATABASE_URL`。資料庫名稱、使用者與密碼應可安全放入 URI。

Migration 完成後，`migrate` service 會執行 `pnpm db:configure-runtime-role`。此步驟可重入，會建立或更新 runtime login、移除 superuser／createdb／createrole／replication／bypass RLS 與 role inheritance，拒絕 database owner 或具有其他 role membership 的設定，只授予 application schema 的連線、schema usage、資料表 DML、view read 與 sequence usage。`_prisma_migrations` 不授權給 runtime role。任一 migration 或權限收斂失敗時，seed 與 runtime services 都不得啟動。

正式網址預設為 `https://partsradar.net`，可用 `PARTSRADAR_PUBLIC_BASE_URL` 覆寫。

## Compose files

| File | Profile | Services |
| --- | --- | --- |
| `compose.yml` | 無 | PostgreSQL、storage init、migration、seed、web。 |
| `compose.crawler.yml` | `manual-crawler` | 手動 crawler、image cache backfill。 |
| `compose.crawler.yml` | `scheduled-crawler` | Crawler daemon、image cache recovery daemon、raw snapshot cleanup daemon。 |
| `compose.ops.yml` | `ops` | Production smoke daemon。 |
| `compose.ops.yml` | `discord-bot` | Discord bot daemon。 |
| `compose.tunnel.yml` | `public-tunnel` | Cloudflare Tunnel。 |

部署前先解析所有會使用的組合：

```bash
docker compose config --quiet
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler --profile scheduled-crawler config --quiet
docker compose -f compose.yml -f compose.ops.yml --profile ops --profile discord-bot config --quiet
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel config --quiet
```

正式完整 topology 統一透過 `scripts/ops/compose-production.sh` 載入上述四個 Compose files 與 scheduled crawler、ops、Discord、public tunnel profiles。例如：

```bash
scripts/ops/compose-production.sh up -d --no-build
```

此入口會先執行 `config --quiet`，但不取代備份、migration、Discord command 註冊或 public cutover gate。

任何 placeholder、缺少的必要值或意外 public bind 都必須先修正。若需人工檢視展開後的 config，不要保存或貼出含真實 secret 的輸出。

## Release image references

Compose 將 runtime 固定到三個可覆寫的 image reference：

- `PARTSRADAR_WEB_IMAGE`
- `PARTSRADAR_CRAWLER_IMAGE`
- `PARTSRADAR_MIGRATE_IMAGE`

預設的 `:local` tag 只供本機驗證。正式部署必須為三者設定不重複使用的 release tag，或使用 registry digest reference；記錄實際 image ID／digest 後，不得覆寫同一 release tag。

若在部署主機建置 release image：

```bash
export PARTSRADAR_WEB_IMAGE='partsradar-tw-web:<release-id>'
export PARTSRADAR_CRAWLER_IMAGE='partsradar-tw-crawler:<release-id>'
export PARTSRADAR_MIGRATE_IMAGE='partsradar-tw-migrate:<release-id>'
docker compose build web migrate storage-init
docker image inspect "$PARTSRADAR_WEB_IMAGE" "$PARTSRADAR_CRAWLER_IMAGE" "$PARTSRADAR_MIGRATE_IMAGE"
```

Repository root 是 Docker build context；`.dockerignore` 明確排除 `backups/`、資料庫 dump、封存檔、deployment secrets 與 private key 類型。Release validation 必須在 build context 放置不含真實資料的 sentinel，重建 crawler／migrate image，並確認兩個 image 都不存在該 sentinel。不得用真實備份測試，也不得以 `COPY` exception 將這些路徑重新納入。

若 image 已由 registry 提供，三個變數改用已驗證的完整 tag／digest並先 pull。後續啟動一律使用 `--no-build`，確保 Compose 啟動的是這組 reference。

## Storage

| Volume | 內容 | 備份優先度 |
| --- | --- | --- |
| `postgres_data` | Domain truth、價格歷史、Discord 設定與 delivery metadata。 | 必須 |
| `product_images` | 站內 WebP 商品圖片；重新建立需再次對來源站抓取。 | 必須 |
| `snapshots` | Raw HTML、locks 與 smoke state。 | 依排障／稽核需求 |

`product_images` 是可重建但有外部請求成本的 operational data，不應在一般升級中視為可任意刪除的 build cache。

舊版 production smoke notification state 不得覆蓋有效 v3 state；辨識、還原與刪除邊界見 [operations.md](operations.md#smoke-notification-state-compatibility)。

## Migration gate

升級前先建立備份，再檢查目前 migration history：

```bash
docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --command "select migration_name, checksum, finished_at from \"_prisma_migrations\" order by started_at;"'
```

規則：

- 不得重寫已套用到任何持久 DB 的 migration。
- Local migration checksum 與 `_prisma_migrations` 不一致時停止部署，不要手動竄改 history。
- Destructive enum／table change 必須先證明沒有仍需相容的資料，並在 disposable PostgreSQL 18 驗證 legacy、current 與 empty migration path。
- Production 使用 `pnpm db:deploy`／`migrate` image，不使用 development migration command。
- Host-side maintenance 必須依序執行 `pnpm db:deploy` 與 `pnpm db:configure-runtime-role`；Compose 的 `migrate` service 已封裝相同順序。
- Migration history、DDL 與 `_prisma_migrations` 僅由管理連線存取；runtime role 不應用來執行 Prisma migration。

## 首次部署

1. 凍結要部署的 commit，依前節準備三個 release image reference並記錄 image ID／digest，再完成本機 release validation 與 Compose config 檢查。
2. 確認 `.env` 的管理與 runtime roles 不同、兩組密碼均已設定，並確認 Docker volumes 與 loopback port 設定正確。
3. 使用已準備的 image啟動核心服務：

```bash
docker compose up -d --no-build
```

`storage-init`、`migrate` 與 `seed` 是 one-shot dependency；`migrate` 會先套用 migration，再建立／更新 runtime role及權限。`seed` 使用 runtime role，`web` 只會在 PostgreSQL healthy、migration／runtime grants／seed 全部成功後啟動。

4. 依 [核心服務健康檢查](operations.md#核心服務健康檢查) 確認 migration、seed、web 與公開 API。
5. 必要時先依 [Product image backfill](operations.md#product-image-backfill) 完成圖片補圖 dry-run；若啟用 Discord，先依 [Discord bot runbook](operations.md#discord-bot) 註冊 commands。
6. 以正式 topology 入口啟動所有背景服務與 ingress：

```bash
scripts/ops/compose-production.sh up -d --no-build
```

7. 執行 public-only smoke 與瀏覽器關鍵流程。

## 既有部署升級

1. 凍結要部署的 commit，保留舊 reference，依前節準備新 release image reference並記錄 image ID／digest，再完成本機 release validation 與 Compose config 檢查。
2. 在現有 PostgreSQL 仍可用時，使用部署環境的備份機制建立備份、驗證完整性並完成隔離還原驗證。
3. 進入 maintenance window：停止 public ingress、drain requests，再停止舊 web、crawler、cleanup、smoke 與 Discord writers。
4. 在不變更既有 `POSTGRES_USER`／`POSTGRES_PASSWORD` 的前提下加入新的 runtime credentials；停止舊 runtime services後，依前述 migration gate 檢查既有 history，有 checksum 落差就停止。
5. 執行 `docker compose up -d --no-build`；migrate one-shot 會在既有資料庫套用待處理 migration並收斂 runtime role，再依首次部署第 4 步驗證核心服務。不得先把現有 superuser credentials 改名為 runtime credentials。
6. 若本次 release 需要資料 backfill，在 writers 仍停止時依 [Operations](operations.md) 的對應流程完成 dry-run、審查與確認寫入；失敗或統計異常時停止 rollout。
7. 依首次部署第 5–7 步以同一組 reference重建並驗證 writers、Discord 與 public ingress。

詳細指令與成功標準見 [operations.md](operations.md)。

隔離還原必須另外通過 [privacy-aware restore gate](operations.md#backup-與-restore-責任)。在歷史 erase replay、privacy cleanup、pending delivery/claim/cursor 檢查與人工核准完成前，不得啟動 Discord outbound。

## Public ingress

Web 與 PostgreSQL 預設綁定 `127.0.0.1`。若使用 Cloudflare Tunnel：

- 必須在 `.env` 將 `CLOUDFLARED_IMAGE` 替換成明確 pinned version；預設 placeholder 不可部署。
- `CLOUDFLARE_TUNNEL_TOKEN` 只放在部署 secret。
- Edge TLS、HSTS、WAF、bot protection 與 access policy 需在實際 edge 設定驗證；repository 不會自動證明它們存在。
- Production web 只信任單一合法 `CF-Connecting-IP`；缺少或非法 header 時 client identity 會是 `unknown`，不會退回 XFF。Public HTTPS smoke 必須觀察到 `X-RateLimit-Client-Source: cf`。
- 必須從外部網路證明沒有旁路 origin DNS、WAN/NAT web port 或公開 PostgreSQL。這些是人工 launch gate，不會因 unit tests 通過而視為完成。

## Release validation

部署前至少需要：

- `pnpm check`
- `pnpm test:all`
- `pnpm db:validate`
- Playwright desktop／mobile 關鍵流程
- PostgreSQL 18 disposable migration matrix
- 所有啟用 Compose profiles 的 config
- `web`、`crawler`、`migrate` image build
- crawler／migrate image 不含 build-context sentinel、備份、dump、封存檔或 deployment key
- runtime role attributes、object grants、實際 application讀寫與 DDL 拒絕測試
- 部署端備份與隔離還原驗證（既有部署升級；首次部署改驗證空庫初始化）
- Private full smoke，再執行 public-only smoke

Smoke threshold 是部署預設，不等於已依 production baseline 校準。WARN 必須判讀；FAIL 必須阻止 cutover。

## Rollback

- 先依 [Incident 與 rollback](operations.md#incident-與-rollback) 停止 external writers 與 public ingress並保存證據。
- 只在 schema 向後相容時，把 `PARTSRADAR_WEB_IMAGE`／`PARTSRADAR_CRAWLER_IMAGE` 切回部署前記錄的 reference；維持目前 schema、migrate image與分離後的 runtime credentials，再以 `--no-build --force-recreate` 重建受影響的 web／crawler／ops services。不得因 application image rollback 將長駐服務切回管理角色。

```bash
docker compose up -d --no-build --force-recreate web
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d --no-build --force-recreate crawler-daemon image-cache-recovery-daemon raw-snapshot-cleanup-daemon
docker compose -f compose.yml -f compose.ops.yml --profile ops --profile discord-bot up -d --no-build --force-recreate smoke-daemon discord-bot
```

無法確認 migration history、備份可還原或 release smoke 時，部署判定應為 NO-GO。
