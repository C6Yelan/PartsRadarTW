# Deployment

PartsRadarTW 以 Docker Compose 支援單一主機部署。核心服務預設只綁定 loopback；public ingress、crawler、smoke 與 Discord 都由獨立 overlay／profile 啟用。

本文件描述 release candidate 的部署流程，不代表任何特定主機已完成備份、edge hardening 或 migration。

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
DATABASE_URL
```

Compose 會在 container 內依前三個值建立 `DATABASE_URL`；host-side Prisma 指令使用 `.env` 的 `DATABASE_URL`。資料庫名稱、使用者與密碼應可安全放入 URI。

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

若 image 已由 registry 提供，三個變數改用已驗證的完整 tag／digest並先 pull。後續啟動一律使用 `--no-build`，確保 Compose 啟動的是這組 reference。

## Storage

| Volume | 內容 | 備份優先度 |
| --- | --- | --- |
| `postgres_data` | Domain truth、價格歷史、Discord 設定與 delivery metadata。 | 必須 |
| `product_images` | 站內 WebP 商品圖片；重新建立需再次對來源站抓取。 | 建議保留 |
| `snapshots` | Raw HTML、locks 與 smoke state。 | 依排障／稽核需求 |

`product_images` 是可重建但有外部請求成本的 operational data，不應在一般升級中視為可任意刪除的 build cache。

`snapshots` volume 內的 production smoke notification state 只支援 schema v3。v1／v2 state 與其備份不得覆蓋有效 v3 state；舊副本只能在新版部署後驗證 v3 state 與 daemon health 成功後由部署端另行辨識與刪除。這不是刪除 snapshot volume，也不影響 PostgreSQL、product images、raw snapshots 或其他 persisted state 的備份與還原政策。詳細邊界見 [operations.md](operations.md#smoke-notification-state-compatibility)。

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

## 首次部署

1. 凍結要部署的 commit，依前節準備三個 release image reference並記錄 image ID／digest，再完成本機 release validation 與 Compose config 檢查。
2. 確認 `.env`、Docker volumes 與 loopback port 設定正確。
3. 使用已準備的 image啟動核心服務：

```bash
docker compose up -d --no-build
```

`storage-init`、`migrate` 與 `seed` 是 one-shot dependency；`web` 只會在 PostgreSQL healthy、migration／seed 成功後啟動。

4. 確認核心狀態：

```bash
docker compose ps -a
docker compose logs --tail=100 migrate seed web
curl --fail http://127.0.0.1:3000/api/source-status
```

5. 必要時先以 dry-run 檢查圖片補圖，再以正式 topology 入口啟動所有背景服務與 ingress：

```bash
scripts/ops/compose-production.sh up -d --no-build
```

6. 啟動前必須已完成 Discord command 註冊與功能檢查；啟動後再執行 public-only smoke 與瀏覽器關鍵流程。

## 既有部署升級

1. 凍結要部署的 commit，保留舊 reference，依前節準備新 release image reference並記錄 image ID／digest，再完成本機 release validation 與 Compose config 檢查。
2. 在現有 PostgreSQL 仍可用時建立備份，驗證 checksum 並完成 restore drill。
3. 進入 maintenance window：停止 public ingress、drain requests，再停止舊 web、crawler、cleanup、smoke 與 Discord writers。
4. 依前述 migration gate 檢查既有 history；有 checksum 落差就停止。
5. 執行 `docker compose up -d --no-build`，再依首次部署第 4 步驗證核心服務。
6. 若既有商品需要首次建立或依新規則重算 `filter_tags`，依 [Product filter tag backfill](operations.md#product-filter-tag-backfill) 完成 dry-run、審查、confirm-write及第二次 `changed=0` dry-run；失敗或統計異常時停止 rollout且不要恢復 writers。
7. 依首次部署第 5–7 步以同一組 reference重建並驗證 writers、Discord 與 public ingress。

詳細指令與成功標準見 [operations.md](operations.md)。

## Docker targets

- `web`：Next.js standalone runtime。
- `crawler`：Crawler、ops 與 Discord 共用 runtime；預設 command 只顯示安全的 manual crawl help。
- `migrate`：執行 Prisma production migration。

三個 runtime 都以 non-root `node` 執行。`storage-init` 只在 one-shot container 內以 root 建立 volume 目錄並調整 ownership。

## Public ingress

Web 與 PostgreSQL 預設綁定 `127.0.0.1`。若使用 Cloudflare Tunnel：

- 必須在 `.env` 將 `CLOUDFLARED_IMAGE` 替換成明確 pinned version；預設 placeholder 不可部署。
- `CLOUDFLARE_TUNNEL_TOKEN` 只放在部署 secret。
- Edge TLS、HSTS、WAF、bot protection 與 access policy 需在實際 edge 設定驗證；repository 不會自動證明它們存在。

## Release validation

部署前至少需要：

- `pnpm check`
- `pnpm test:all`
- `pnpm db:validate`
- Playwright desktop／mobile 關鍵流程
- PostgreSQL 18 disposable migration matrix
- 所有啟用 Compose profiles 的 config
- `web`、`crawler`、`migrate` image build
- Backup 與 restore drill（既有部署升級；首次部署改驗證空庫初始化）
- Private full smoke，再執行 public-only smoke

Smoke threshold 是部署預設，不等於已依 production baseline 校準。WARN 必須判讀；FAIL 必須阻止 cutover。

## Rollback

- 發現應用程式問題時先停 external writers 與 public ingress，再保留 DB／volume 證據。
- 只在 schema 向後相容時，把 `PARTSRADAR_WEB_IMAGE`／`PARTSRADAR_CRAWLER_IMAGE` 切回部署前記錄的 reference；維持目前 schema 與 migrate image，再以 `--no-build --force-recreate` 重建受影響的 web／crawler／ops services。

```bash
docker compose up -d --no-build --force-recreate web
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d --no-build --force-recreate crawler-daemon image-cache-recovery-daemon raw-snapshot-cleanup-daemon
docker compose -f compose.yml -f compose.ops.yml --profile ops --profile discord-bot up -d --no-build --force-recreate smoke-daemon discord-bot
```

- 不以 `prisma migrate reset` 或刪除 volume作為 production rollback。
- DB rollback 必須使用部署前備份與已演練的還原程序；先還原到隔離環境驗證。
- Product image與snapshot volume除非已證明損壞，否則維持原狀。

無法確認 migration history、備份可還原或 release smoke 時，部署判定應為 NO-GO。
