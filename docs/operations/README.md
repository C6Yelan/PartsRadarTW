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

```bash
docker compose -f compose.yml -f compose.tunnel.yml --profile public-tunnel up -d cloudflared
docker compose -f compose.yml -f compose.tunnel.yml logs --tail=100 cloudflared
```

成功標準：使用 pinned image 與有效 token，public HTTPS 路由指向 web，public-only smoke 通過。

失敗處理：停止 cloudflared 並維持 loopback web；不要把 web port 直接綁定 public interface 作為臨時繞過。
