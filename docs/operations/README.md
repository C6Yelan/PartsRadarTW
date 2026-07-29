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

部署端需記錄 logging driver、retention、存取權限與 redaction 抽查；repository tests 不能證明主機 rotation 已生效。

## 外部 production gate

Repository tests 無法證明 edge、備份系統、GitHub、Discord Portal 或來源內容政策的實際設定。正式公開前，指定操作人員必須以有日期的受保護紀錄確認：

- Public ingress 沒有旁路 origin，TLS、安全 header、WAF 與 rate limit 已生效。
- 備份、加密、retention、離機副本及隔離還原已完成驗證。
- Repository 與 Discord 管理帳號啟用適當保護，token、permissions 與 intents 維持最小範圍。
- 來源抓取頻率、阻擋處理、圖片使用、attribution 與 takedown 聯絡方式已由決策人審查。

缺少這些外部證據時，不得把單元測試或 smoke 成功視為完整 launch approval。

## Cloudflare Tunnel

使用時機：Private smoke 通過且 edge 設定已準備完成。

Token 由主機 secret provisioning 寫入，不得放在 command argument、shell environment、`.env`、ticket 或一般 backup。預設 source path 為 `/etc/partsradar/secrets/cloudflare-tunnel-token`；若由受保護的 provisioning 流程寫入其他絕對路徑，只把該非機密路徑設為 `CLOUDFLARE_TUNNEL_TOKEN_FILE`。

Pinned `cloudflare/cloudflared:2026.7.2` 以 UID/GID `65532:65532` 執行。Provisioning 完成後只調整 metadata，不在 console 讀回內容：

```bash
sudo chown root:65532 /etc/partsradar/secrets/cloudflare-tunnel-token
sudo chmod 0440 /etc/partsradar/secrets/cloudflare-tunnel-token
scripts/ops/compose-production.sh config --quiet
```

cloudflared 2025.4.0 起支援 `TUNNEL_TOKEN_FILE`；本 repository 已以 2026.7.2 的 `version`／`tunnel run --help` 驗證。部署時仍須記錄 pulled image digest，且不得改用 mutable `latest`。

Maintenance cutover：

1. Private full smoke 通過後停止 public tunnel，web 與 PostgreSQL維持 loopback。
2. 由 secret provisioning 更新 file；不要在 shell history、trace 或 log 傳遞 token 值。
3. 以 `scripts/ops/compose-production.sh up -d --no-build cloudflared` 建立新 connector。
4. 只記錄 connector count／health，執行 public-only smoke並確認 origin 無旁路。
5. 有任何實際曝露證據時立即 rotate 並清除舊 connections；沒有曝露證據時仍排定受控輪替，不宣稱現有 token 已外洩。

```bash
scripts/ops/compose-production.sh up -d --no-build cloudflared
scripts/ops/compose-production.sh logs --tail=100 cloudflared
```

成功標準：使用 pinned image 與有效 token，public HTTPS 路由指向 web，public-only smoke 通過。

Sanitized 驗證只能輸出布林結果，不能回顯完整 command 或 environment：

```bash
container_id="$(scripts/ops/compose-production.sh ps -q cloudflared)"
if docker inspect "$container_id" --format '{{json .Path}} {{json .Args}}' | grep -q -- '"--token"'; then echo 'argv_token=true'; else echo 'argv_token=false'; fi
if docker inspect "$container_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Eq '^(TUNNEL_TOKEN|CLOUDFLARE_TUNNEL_TOKEN)='; then echo 'token_env=true'; else echo 'token_env=false'; fi
if docker inspect "$container_id" --format '{{range .Mounts}}{{println .Destination}}{{end}}' | grep -qx '/run/secrets/cloudflare_tunnel_token'; then echo 'token_file_path=true'; else echo 'token_file_path=false'; fi
```

失敗處理：執行 `scripts/ops/compose-production.sh stop cloudflared`，維持 loopback web並調查 image／file metadata。Rollback 只能使用前一個已知可用的 pinned image與受控 file secret；若舊 token 已 rotate，不得恢復舊值，也不得改用 argv／environment。不要把 web port直接綁定 public interface作為臨時繞過。
