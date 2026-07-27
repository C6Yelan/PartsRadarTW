# Deployment

PartsRadarTW 以 Docker Compose 支援單一主機部署。核心服務預設只綁定 loopback；public ingress、crawler、smoke 與 Discord 由獨立 overlay／profile 啟用。

## 前置需求

- Docker Engine 與 Docker Compose plugin。
- 足夠保存 PostgreSQL、商品圖片與 raw snapshots 的持久儲存空間。
- 已從 [`.env.example`](../../.env.example) 建立未追蹤的 `.env`。
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

`POSTGRES_USER`／`POSTGRES_PASSWORD` 是 PostgreSQL image 初始化及 migration 使用的管理角色；既有 volume 升級時必須沿用原管理角色。`POSTGRES_RUNTIME_USER`／`POSTGRES_RUNTIME_PASSWORD` 是長駐服務共用的低權限 application role，必須與管理角色不同。

Compose 只把 `MIGRATION_DATABASE_URL` 傳給 `migrate` one-shot service，長駐服務只取得 `DATABASE_URL`。Migration 完成後，`migrate` 會執行可重入的 `pnpm db:configure-runtime-role`，收斂 runtime role 權限；任一步驟失敗時，seed 與 runtime services 都不得啟動。詳細 migration 與權限 gate 見 [Release](release.md#migration-gate)。

正式網址預設為 `https://partsradar.net`，可用 `PARTSRADAR_PUBLIC_BASE_URL` 覆寫。

## Compose files

| File | Profile | Services |
| --- | --- | --- |
| `compose.yml` | 無 | PostgreSQL、storage init、migration、seed、web。 |
| `compose.crawler.yml` | `manual-crawler` | 手動 crawler、image cache backfill。 |
| `compose.crawler.yml` | `scheduled-crawler` | Crawler daemon、image recovery、snapshot cleanup。 |
| `compose.ops.yml` | `ops` | Production smoke daemon。 |
| `compose.ops.yml` | `discord-bot` | Discord bot daemon。 |
| `compose.tunnel.yml` | `public-tunnel` | Cloudflare Tunnel。 |

部署前解析所有會使用的組合：

```bash
docker compose config --quiet
docker compose -f compose.yml -f compose.crawler.yml --profile manual-crawler --profile scheduled-crawler config --quiet
docker compose -f compose.yml -f compose.ops.yml --profile ops --profile discord-bot config --quiet
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel config --quiet
```

正式完整 topology 統一透過 `scripts/ops/compose-production.sh` 載入所有 production overlays 與 profiles：

```bash
scripts/ops/compose-production.sh up -d --no-build
```

此入口會先執行 `config --quiet`，但不取代備份、migration、Discord command 註冊或 public cutover gate。任何 placeholder、缺少的必要值或意外 public bind 都必須先修正；不要保存或貼出含真實 secret 的展開後 config。

## Storage

| Volume | 內容 | 備份優先度 |
| --- | --- | --- |
| `postgres_data` | Domain truth、價格歷史、Discord 設定與 delivery metadata。 | 必須 |
| `product_images` | 站內 WebP 商品圖片；重建需要再次抓取來源。 | 必須 |
| `snapshots` | Raw HTML、locks 與 ops state。 | 依排障／稽核需求 |

`product_images` 雖可重建，但具有外部請求成本，不應在一般升級中視為可任意刪除的 build cache。

## 共同部署 gate

首次部署與既有升級都必須先：

1. 凍結要部署的 commit。
2. 依 [Release image references](release.md#release-image-references) 準備並記錄 image reference／digest。
3. 完成 [Release validation](release.md#release-validation) 與所有啟用 Compose profiles 的 config 檢查。
4. 確認 `.env` 沒有 placeholder，管理與 runtime DB roles 不同，Docker volumes 與 loopback port 設定正確。

## 首次部署

1. 完成共同部署 gate。
2. 使用已準備的 image 啟動核心服務：

```bash
docker compose up -d --no-build
```

`storage-init`、`migrate` 與 `seed` 是 one-shot dependency；`web` 只會在 PostgreSQL healthy、migration、runtime grants 與 seed 全部成功後啟動。

3. 依 [核心服務健康檢查](../operations/README.md#核心服務健康檢查) 確認 migration、seed、web 與公開 API。
4. 必要時先依 [Product image backfill](../operations/crawler.md#product-image-backfill) 補圖；若啟用 Discord，依 [Discord bot](../operations/discord.md#discord-bot) 註冊 commands。
5. 使用正式 topology 入口啟動所有背景服務與 ingress：

```bash
scripts/ops/compose-production.sh up -d --no-build
```

6. 執行 public-only smoke 與瀏覽器關鍵流程。

## 既有部署升級

1. 完成共同部署 gate，並保留目前 application image reference。
2. 在 production DB 仍可用時建立備份，完成隔離還原驗證。
3. 進入 maintenance window：停止 public ingress、drain requests，再停止 crawler、cleanup、smoke 與 Discord writers。
4. 沿用既有 `POSTGRES_USER`／`POSTGRES_PASSWORD`，加入不同的 runtime credentials；停止舊 runtime services 後執行 [Migration gate](release.md#migration-gate)。
5. 執行 `docker compose up -d --no-build` 套用 migration 並收斂 runtime role，再執行核心服務健康檢查。
6. 需要資料 backfill 時，在 writers 仍停止的狀態依 [Crawler operations](../operations/crawler.md) 完成 dry-run、審查與確認寫入。
7. 依首次部署第 4–6 步，以同一組 release reference 重建並驗證 writers、Discord 與 public ingress。

升級中的隔離還原必須通過 [Backup 與 restore gate](../operations/recovery.md#backup-與-restore-責任)。在 privacy replay、cleanup 與人工核准完成前，不得啟動 Discord outbound。

## Public ingress

Web 與 PostgreSQL 預設綁定 `127.0.0.1`。若使用 Cloudflare Tunnel：

- 在 `.env` 將 `CLOUDFLARED_IMAGE` 替換成明確 pinned version，並只在部署 secret 保存 `CLOUDFLARE_TUNNEL_TOKEN`。
- Edge TLS、HSTS、WAF、bot protection 與 access policy 必須在實際 edge 驗證。
- Production web 只信任單一合法 `CF-Connecting-IP`；缺少或非法 header 時 client identity 為 `unknown`，不會退回 XFF。
- Public HTTPS smoke 必須觀察到 `X-RateLimit-Client-Source: cf`，並從外部網路確認沒有旁路 origin DNS、WAN/NAT web port 或公開 PostgreSQL。

Tunnel 啟動與診斷指令見 [Operations](../operations/README.md#cloudflare-tunnel)。
