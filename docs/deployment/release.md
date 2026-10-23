# Release

本文件定義 production release image、migration、驗證與 application rollback gate。部署順序見 [Deployment](README.md)；事故處理見 [Recovery](../operations/recovery.md)。

## Release image references

Compose 將 runtime 固定到三個可覆寫的 image reference：

- `PARTSRADAR_WEB_IMAGE`
- `PARTSRADAR_CRAWLER_IMAGE`
- `PARTSRADAR_MIGRATE_IMAGE`

預設的 `:local` tag 只供本機驗證。正式部署必須設定不重複使用的 release tag 或 registry digest，並記錄實際 image ID／digest。

Public ingress 另使用 `CLOUDFLARED_IMAGE`。Compose 預設為已驗證且支援token-file的 `cloudflare/cloudflared:2026.10.3@sha256:faa8e0a1475f137c910be6025f43c8e4092fdd35461b31e19fd1390657a1ff39`。所有override必須包含 `@sha256:<64-hex-digest>`；tag-only reference一律拒絕。正式release仍應記錄實際pulled image ID／platform digest。

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

RC-09 target-watch bounded claim的migration與application rollback另須依[Target-watch claim migration](target-watch-claim.md)執行expand／contract、index validity、failure matrix與writer cutover gate。

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
- [Private full smoke](../operations/README.md#full-smoke)，再執行 public-only smoke

Smoke threshold 是部署預設，不等於已依 production baseline 校準。WARN 必須判讀；FAIL 必須阻止 cutover。

## 容器漏洞判讀

掃描須保留所有嚴重度與尚無修補版本的結果；`ignore-unfixed` 的 gate 通過不代表映像沒有公告命中。以下是目前 linux/amd64 映像的判讀，正式 release 仍須核對實際 digest、套件版本、mounts 與設定。不要將這些條件式結論轉成全域忽略規則。

### Cloudflare Tunnel

固定版本為官方 [2026.10.3](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.3)，multi-platform digest 見上方 release references；本次驗證的 amd64 child 為 `sha256:c3f24df7c5e68c1467afc5486c155689f247eb02246b3a124fc5f42458728672`。

使用同一份 Trivy 0.76.1 資料庫比較，原始套件／公告對應由 92 筆降至 26 筆：67 筆舊對應消失、1 筆新增。新版仍列 24 筆 OS、2 筆 Go 命中，不能稱為掃描歸零。

| 剩餘項目 | 實際映像判讀 |
| --- | --- |
| `klauspost/compress 1.18.0`／`CVE-2026-63209` | 套件仍未達 1.18.7，但 [S2 漏洞](https://github.com/klauspost/compress/security/advisories/GHSA-259r-337f-4rfw)要求外來 dictionary 經 `s2.NewDict`／`Dict.Encode`。govulncheck binary 分析與原始碼皆顯示此 binary 只使用 flate，沒有受影響 S2 package／函式。保留版本命中，不能寫成套件已修補。 |
| `golang.org/x/crypto 0.58.0`／`GO-2026-5932` | [OpenPGP 公告](https://pkg.go.dev/vuln/GO-2026-5932)只有 module 層命中；此 binary 未包含受影響 OpenPGP package／函式。 |
| `ca-certificates 20250419`／`DSA-6572-1` | 套件版本仍命中，但 [Debian 要求移除](https://lists.debian.org/debian-security-announce/2026/msg00487.html)的 emSign ECC Root CA - G3 與 Comodo AAA root 已不在此映像的預設信任來源。已核對 `SSL_CERT_FILE` 指向的 148 張憑證、`/etc/ssl/certs` 及 `/etc/pki/tls/certs`；有自訂 CA、mount 或 `SSL_CERT_DIR` 時須重新檢查。 |

其餘 23 筆 OS 中／低嚴重度項目目前未列套件修補版本，仍需追蹤官方映像。2026.10.x 的 [URL normalization](https://developers.cloudflare.com/changelog/post/2026-10-22-cloudflared-path-normalization/)預設仍關閉；安全更新不額外改變路由語意。

### PostgreSQL 的 gosu

已核對 `postgres:18.6-alpine@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5`。Alpine OS 層無命中；61 筆 Go／模組命中位於 gosu 1.19，不是 PostgreSQL 資料庫引擎本身。

以官方 govulncheck 1.9.0 binary 模式逐筆比對 Go 公告及別名：58 筆沒有受影響函式，2 筆僅適用 Windows；唯一仍含受影響函式的是 [CVE-2026-61801](https://github.com/moby/sys/security/advisories/GHSA-mjcv-p78q-w5fw)。gosu 的 `SetupUser` 確實呼叫 `moby/sys/user.GetExecUserPath`，但觸發條件是攻擊者能控制 `/etc/passwd` 或 `/etc/group`。發布時核對這兩個檔案的實際掛載與寫入權限，不能因其他 Go 公告不適用就將 gosu 全部忽略。

[官方 gosu](https://github.com/tianon/gosu/releases/tag/1.19) 與 PostgreSQL 映像仍使用這個版本，目前未確認可直接替換的官方修補版。[Binary 分析](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck)檢查函式是否存在，不代表已證明動態利用成立；也不涵蓋 OS 套件。

### 應用映像的 Debian Bookworm

目前 Node.js 24.22.1／Bookworm 的 web、crawler、migrate 各有 242 筆套件／公告對應，Node.js 套件層無命中；三個映像共用基底，不應將數量相加當成不同漏洞。高／嚴重項目目前沒有掃描器列出的 Bookworm 修補版本，已核對的條件如下。

| 公告 | 判讀與後續條件 |
| --- | --- |
| [CVE-2023-45853](https://security-tracker.debian.org/tracker/CVE-2023-45853) | Debian 未在 Bookworm 的 zlib 建置受影響 MiniZip binary，此 `zlib1g` 命中不適用。 |
| [CVE-2026-16742](https://security-tracker.debian.org/tracker/CVE-2026-16742) | 漏洞在 systemd-homed；目前映像只有 libsystemd0／libudev1，沒有 homed binary。 |
| [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538) | 漏洞要求 Perl Archive::Tar；目前 perl-base 映像未包含該模組。 |
| [CVE-2026-78408](https://github.com/util-linux/util-linux/security/advisories/GHSA-55fx-f4gg-cfhj) | util-linux 2.38.1 的 nsenter 沒有受影響的 `--join-cgroup` 功能。 |
| [CVE-2026-53613](https://security-tracker.debian.org/tracker/CVE-2026-53613)、[76642](https://github.com/util-linux/util-linux/security/advisories/GHSA-m25x-3hj9-m26f)、[78410](https://github.com/util-linux/util-linux/security/advisories/GHSA-rh77-686x-2f2m) | 需要特定 fstab 授權、外部 mount helper 或特權 `X-mount.*` 操作。目前映像 fstab 未設定、應用非 root、capabilities 全移除且禁止新特權；正式容器若改過這些條件須重判。 |
| [CVE-2026-53615](https://security-tracker.debian.org/tracker/CVE-2026-53615) | libblkid 需要探測攻擊者控制的磁碟映像／媒體；未見本專案呼叫路徑，不能只以套件存在認定可利用。 |
| [CVE-2026-78409](https://github.com/util-linux/util-linux/security/advisories/GHSA-8f2p-47x3-43mv) | 上游範圍從 2.42 開始，與 Debian 對 Bookworm 2.38.1 的標記不一致。待核對 backport，維持未決，不列為已排除。 |
| [CVE-2026-84782](https://openssl-library.org/news/secadv/20260929.txt) | 限定 DTLS 流程。系統 libssl3 3.0.22 尚無 Bookworm 修補；Node 內建 OpenSSL 3.5.9 已達修補版，兩者須分開判讀。 |
| [CVE-2026-41992](https://security-tracker.debian.org/tracker/CVE-2026-41992) | 需要同一 GNU gzip 解碼程序依序處理惡意 LZW／LZH；專案快照使用 Node zlib，未見該 CLI 解碼路徑。 |
| [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720) | infocmp 存在，但未見專案呼叫受影響的 `-i` 字串分析功能；尚未證實應用可觸發。 |
| [CVE-2026-54369](https://security-tracker.debian.org/tracker/CVE-2026-54369) | libacl1 存在；需要特權 pathname ACL 操作及可替換路徑元件。沒有 getfacl／setfacl 不足以排除其他連結使用者，仍需核對實際呼叫條件。 |

### Dependabot

Push 回報的 31 則警示不能用 `pnpm audit` 無命中替代。須由有讀取權限的帳號在 Security → Dependabot，或 GitHub Dependabot alerts API，逐項核對 open 狀態、manifest／依賴路徑、受影響範圍與目前 lockfile。只有總數或 API 401 時，結論維持「未核對」，不得推定全為舊警示。

Fine-grained token 僅需該 repository 的 [Dependabot alerts read 權限](https://docs.github.com/en/rest/dependabot/alerts#list-dependabot-alerts-for-a-repository)。在已具備此權限的 GitHub CLI 登入環境，可唯讀匯出所有分頁：

```bash
gh api --paginate --slurp \
  'repos/C6Yelan/PartsRadarTW/dependabot/alerts?state=open&per_page=100' \
  --jq 'add'
```

將結果保存在既有部署證據位置，逐項判讀後再決定更新或依據充分的 dismissal；不要以缺少權限當成零筆結果。

## Rollback

先依 [Incident 與 rollback](../operations/recovery.md#incident-與-rollback) 停止 external writers 與 public ingress並保存證據。

只在 schema 向後相容時，把 `PARTSRADAR_WEB_IMAGE`／`PARTSRADAR_CRAWLER_IMAGE` 切回部署前記錄的 reference；維持目前 schema、migrate image與分離後的 runtime credentials，再重建受影響服務：

```bash
docker compose up -d --no-build --force-recreate web
docker compose -f compose.yml -f compose.crawler.yml --profile scheduled-crawler up -d --no-build --force-recreate crawler-daemon image-cache-recovery-daemon raw-snapshot-cleanup-daemon
docker compose -f compose.yml -f compose.ops.yml --profile ops --profile discord-bot up -d --no-build --force-recreate smoke-daemon discord-bot
```

無法確認 migration history、備份可還原或 release smoke 時，部署判定為 NO-GO。
