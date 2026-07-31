# Operations

本 runbook 只收錄目前程式與 Compose 可執行的操作。以下指令預設從 repository root 執行，且 `.env` 已正確設定；不要在輸出或 ticket 貼出 secret。

## Runbook index

| 範圍 | 文件 |
| --- | --- |
| Crawler、snapshot cleanup、圖片與 metadata backfill | [Crawler operations](crawler.md) |
| Discord bot 與個人資料申請 | [Discord operations](discord.md) |
| Backup、restore、incident 與 rollback | [Recovery operations](recovery.md) |
| Release image、migration 與 rollback commands | [Release](../deployment/release.md) |

## 核心服務健康檢查

使用時機：部署後、incident 開始時或例行確認。

```bash
docker compose ps -a
docker compose logs --tail=100 postgres migrate seed web
curl --fail http://127.0.0.1:3000/api/source-status
curl --fail 'http://127.0.0.1:3000/api/products?pageSize=1'
```

成功標準：PostgreSQL 與 web healthy；migration／seed exit 0；API HTTP 200 且 source status 有啟用分類。

失敗處理：先讀取對應 service log。不要在 migration 失敗後強制標記成功，也不要刪除 volume 重試。

## 初始化 storage

使用時機：新主機、volume 重建或 ownership 錯誤。

```bash
docker compose run --rm storage-init
```

成功標準：`snapshots` 與 `product_images` volume 目錄存在且 runtime `node` 可寫。

失敗處理：確認 Docker volume、磁碟空間與 host filesystem；不要把 runtime service 改成 root 長期執行。

## Production smoke

### Public-only

使用時機：不提供 DB secret 的外部監控，或 public cutover 後。

```bash
pnpm ops:production-smoke -- --public-only --base-url https://partsradar.net
```

檢查 homepage、配單頁、公開 API、抽樣圖片、來源 freshness 與 rate-limit headers。成功標準為沒有 FAIL；WARN 仍需人工判讀。

### Full smoke

使用時機：private release validation 或排查 DB、crawler 與 Discord delivery。

```bash
docker compose -f compose.yml -f compose.ops.yml --profile ops run --rm smoke-daemon \
  pnpm ops:production-smoke -- --base-url http://web:3000
```

Full smoke 另檢查 crawler run、filter sync、parse errors、來源圖片、商品篩選品質、缺圖、snapshot retention 與近期 Discord delivery。只有 FAIL 使用 non-zero exit；部署流程仍須解析並人工判讀 WARN。

商品篩選品質的 empty-count／ratio 門檻可用 `SMOKE_FILTER_EMPTY_WARN_MIN_COUNT` 與 `SMOKE_FILTER_EMPTY_WARN_RATIO` 調整；完整預設值以 [`.env.example`](../../.env.example) 為準。門檻必須依 production baseline 校準，不能把「沒有 FAIL」視為已完成校準。

## Logs 與診斷資料

Application logs 最長保存 30 天；實際 rotation 由部署端透過 Docker logging driver 或 journald 設定並驗證。

- 不記錄 Authorization、Bot／interaction token、URL credentials、database URL、驗證碼或 digest。
- Discord delivery 只記錄 category、HTTP status 與 provider code，不保存 provider response body。
- CoolPC fetch error 只保存 bounded error class、安全 network code、HTTP status 或內部 policy 類別。
- 不需要 raw Discord user／guild／channel ID 時，使用 masked ID、count 或 aggregate。

Web API rate-limit denial logging 以每個 process 最多 256 個 LRU state 控制記憶體；同一
scope／sanitized client hash／window 只輸出第一筆 `api_rate_limited`，其餘事件在 window
切換時以一筆 `api_rate_limit_suppressed` 和 `suppressedCount` 彙整。Unique-key churn 達
容量時改為全域 suppression，直到已觀察的 limiter windows 結束，再依 scope 輸出固定最多
六筆 `api_rate_limit_saturated` 摘要（安靜後由下一次 request 觸發）；這避免 LRU eviction
重新取得個別 log budget。Log
只包含既有 16 字元 hash、client source、scope 與配額欄位，不包含 raw IP、headers、body
或 query。Process restart 會清空這項純 observability state，但不影響 rate-limit decision
與 HTTP contract。

部署端需記錄 logging driver、retention、存取權限與 redaction 抽查；repository tests 不能證明主機 rotation 已生效。

## 外部 production gate

Repository tests 無法證明 edge、備份系統、GitHub、Discord Portal 或來源內容政策的實際設定。正式公開前，指定操作人員必須以有日期的受保護紀錄確認：

- Public ingress 沒有旁路 origin，TLS、安全 header、WAF 與 rate limit 已生效。
- 備份、加密、retention、離機副本及隔離還原已完成驗證。
- Repository 與 Discord 管理帳號啟用適當保護，token、permissions 與 intents 維持最小範圍。
- 來源抓取頻率、阻擋處理、圖片使用、attribution 與 takedown 聯絡方式已由決策人審查。

缺少這些外部證據時，不得把單元測試或 smoke 成功視為完整 launch approval。

### 分享圖 route work control

`/products/*/opengraph-image` 與 `/products/*/twitter-image` 共用每個 web process 的
`SHARE_IMAGE_RATE_LIMIT_MAX`，window 使用 `API_RATE_LIMIT_WINDOW_SECONDS`（預設 60 秒）；
production 只接受合法
`CF-Connecting-IP` 作 client identity；direct-origin 或缺少 trusted header 的流量共用
`unknown` bucket。一般商品頁與其他 API scope 不使用此 limit。

Origin contract 固定如下：

- invalid ID：不載入 Prisma、檔案或 renderer，回傳可 edge cache 1 小時的空 404。
- missing／disabled／無現價 UUID：最多一筆窄查詢，回傳可 edge cache 60 秒的空 404；
  process-local negative cache 最多 1024 entries、TTL 60 秒。
- valid product：PNG 可 cache 5 分鐘，render cache 最多 128 entries／16 MiB，
  source WebP 最多 2 MiB、response 最多 1 MiB；同 key coalesce，單 process 同時最多
  16 個 lookup 與 2 個 render。名稱、價格、更新時間、分類或 image file version 改變會建立
  新 key，因此 CDN 最長 staleness 為 5 分鐘。

這些 process-local bounds 不取代 edge control。上線前由 operator 對兩條精確 route 設定
可回復的 WAF／rate rule，排除普通 `/products/*` 頁面，並記錄原 action、threshold、
window 與 rollback 值；不得把 Cloudflare credential 放進 web runtime。先以單一合法商品、
單一 missing UUID 與 invalid path 低頻驗證 status、`Cache-Control`、`Age`、
`CF-Cache-Status`、app rate headers 及 sanitized aggregate render count，不批量產生
random IDs。

若 edge rule 誤傷正常 social crawler，先恢復該 rule 的前一組值並保留 app bounds；若回退
到仍會動態 render invalid／missing fallback 的舊 web image，必須維持或暫時收緊兩條
metadata route 的 edge rule，不可關閉全站限流或公開 origin。

## Cloudflare Tunnel

使用時機：Private smoke 通過且 edge 設定已準備完成。

Token 由主機secret provisioning寫入，不得放在command argument、shell environment、`.env`、ticket或一般backup。預設source path為 `/etc/partsradar/secrets/cloudflare-tunnel-token`；若使用其他絕對路徑，只把該非機密路徑設為 `CLOUDFLARE_TUNNEL_TOKEN_FILE`。路徑與canonical target都必須位於repository／Docker build context外，且secret file不得為symlink。

唯一允許的預設image reference為：

```text
cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d
```

所有 `CLOUDFLARED_IMAGE` override都必須包含 `@sha256:<64-hex-digest>`；tag-only reference一律拒絕。此image以UID/GID `65532:65532` 執行。Provisioning完成後只調整metadata，不在console讀回內容：

```bash
sudo chown root:65532 /etc/partsradar/secrets/cloudflare-tunnel-token
sudo chmod 0440 /etc/partsradar/secrets/cloudflare-tunnel-token
scripts/ops/validate-cloudflare-tunnel.sh
```

cloudflared 2025.4.0起支援 `TUNNEL_TOKEN_FILE`；本repository已以pinned digest的 `version`／`tunnel run --help`驗證2026.7.2。Production wrapper拒絕額外的 `--env-file`、`-f`／`--file`、`--profile`、`--project-directory`與project-name override，避免改變受審查topology或env來源。

### 初次 cutover

1. Private full smoke 通過後停止 public tunnel，web 與 PostgreSQL維持 loopback。
2. 由secret provisioning寫入token file並套用 `root:65532`／`0440`；不要在shell history、trace或log傳遞token值。
3. 執行preflight並pull不可變image：

```bash
scripts/ops/validate-cloudflare-tunnel.sh
docker pull cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d
scripts/ops/compose-production.sh up -d --no-build --force-recreate cloudflared
```

4. 只記錄connector count／health；完成下方sanitized inspect、public-only smoke並確認origin無旁路。

### 正常 rotation

以下rotation與compromise處置遵循[Cloudflare Tunnel token程序](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/)。

1. 在maintenance window停止public tunnel；單replica topology會有預期短暫中斷：

```bash
scripts/ops/compose-production.sh stop cloudflared
```

2. 在Cloudflare Dashboard的Networking → Tunnels →該tunnel執行Rotate token。舊token此後不能建立新connection。
3. 由secret provisioning以atomic replace更新host token file，重新套用 `root:65532`／`0440`，再執行：

```bash
scripts/ops/validate-cloudflare-tunnel.sh
scripts/ops/compose-production.sh up -d --no-build --force-recreate cloudflared
```

4. 確認connector healthy、執行sanitized inspect、public-only smoke與origin-bypass檢查。失敗時不要恢復已失效的舊token。

### Suspected compromise／force-disconnect

1. 立即停止local connector，並在Cloudflare Dashboard先Rotate token：

```bash
scripts/ops/compose-production.sh stop cloudflared
```

2. 使用具Cloudflare One Connector `cloudflared Write`（或等價Tunnel Write）最小權限的短效API token，呼叫官方connections DELETE endpoint強制中斷所有既有connections。API bearer header必須由secret provisioning放在repository外、mode `0400`的curl config；不得放入command argument或shell environment：

```bash
curl --fail-with-body --silent --show-error \
  --config /etc/partsradar/secrets/cloudflare-api.curl \
  --request DELETE \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID:?ACCOUNT_ID is required}/cfd_tunnel/${TUNNEL_ID:?TUNNEL_ID is required}/connections"
```

3. 撤銷短效API token／移除其curl config，再以新tunnel token atomic replace host file。
4. 執行preflight、啟動cloudflared並完成與正常rotation相同的驗證。不得重用suspected-compromised token。

Sanitized 驗證只能輸出布林結果，不能回顯完整 command 或 environment：

```bash
container_id="$(scripts/ops/compose-production.sh ps -q cloudflared)"
if docker inspect "$container_id" --format '{{json .Path}} {{json .Args}}' | grep -q -- '"--token"'; then echo 'argv_token=true'; else echo 'argv_token=false'; fi
if docker inspect "$container_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Eq '^(TUNNEL_TOKEN|CLOUDFLARE_TUNNEL_TOKEN)='; then echo 'token_env=true'; else echo 'token_env=false'; fi
if docker inspect "$container_id" --format '{{range .Mounts}}{{println .Destination}}{{end}}' | grep -qx '/run/secrets/cloudflare_tunnel_token'; then echo 'token_file_path=true'; else echo 'token_file_path=false'; fi
```

成功標準：argv token=false、token env=false、token file path=true、connector healthy、public HTTPS路由指向web、public-only smoke通過且origin無旁路。

### Rollback

1. 任何preflight、connector health或public smoke失敗都先停止cloudflared，維持loopback web：

```bash
scripts/ops/compose-production.sh stop cloudflared
```

2. 若尚未rotate，可由configuration management恢復前一個已知可用的image digest與既有file secret；若已rotate，舊token已不能建立新connection，rollback只能使用新token file搭配前一個已知可用的image digest。
3. 重新執行 `scripts/ops/validate-cloudflare-tunnel.sh`，再以 `up -d --no-build --force-recreate cloudflared`恢復並重跑sanitized inspect／public smoke。
4. Suspected compromise時絕不恢復舊token或既有connections。新token／前一image仍失敗時保持public ingress停止並重新provision，不得改用argv／environment或公開web port繞過。
