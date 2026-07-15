# Contributing to PartsRadarTW

感謝你協助維護 PartsRadarTW。本文件只保留建立開發環境、判斷程式歸屬與驗證變更所需的資訊。

## 開發環境

- Node.js `24.16.0`，版本固定於 `.nvmrc`。
- pnpm `11.3.0`，版本固定於根目錄 `package.json`。
- Docker 與 Docker Compose，用於 PostgreSQL 與部署驗證。
- 執行瀏覽器測試時需要 Playwright Chromium。

不要提交 `.env`、token、webhook URL、資料庫密碼、raw snapshot、備份或 runtime storage。

## 本機啟動

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:generate
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev:web
```

啟動前請把 `.env` 的必要資料庫欄位改成只供本機使用的值。`pnpm db:seed` 會 upsert 並啟用目前支援的原價屋分類。

## 程式歸屬

| 路徑 | 責任 |
| --- | --- |
| `apps/web` | Next.js 頁面、公開 Route Handlers、瀏覽器配單與 UI。 |
| `apps/crawler` | 原價屋抓取與解析、維運 CLI、smoke、Discord bot。 |
| `packages/db` | Prisma schema、migration、seed 與 DB client。 |
| `packages/shared` | crawler 與 web 必須完全一致的來源身分與 URL contract。 |

`packages/shared` 不是通用工具箱。UI formatter、API query、Discord 訊息、配單與 app-private helper 應留在所屬 app；完整規則見 [`packages/shared/README.md`](packages/shared/README.md)。

新增 import 時直接指向擁有該 symbol 的模組。只有 package public API 或確實被多個 production consumer 使用的 feature facade 才應 re-export。

## 變更原則

- 優先完成能解決問題的最小變更。
- 不因檔案行數而拆分模組，也不預留沒有 consumer 的 extension point。
- 不改變既有 public API、DB 或部署 contract，除非該變更本身已明確納入範圍。
- 既有 migration 一旦可能套用到持久資料庫就不得重寫；建立新的 migration。
- 公開商品圖片必須由 crawler 驗證來源並寫入本地 WebP storage；訪客請求不得即時抓取來源站。
- 不在一般測試中 live fetch 原價屋，也不呼叫真實 Discord 或 Cloudflare。

## 註解與文件

註解說明責任、相容性、安全或維運原因，不逐行翻譯程式。移除臨時標籤、執行過程與已失效的待辦標記。Repo-relative path header 可使用但不是硬性規則。

只有在使用方式、行為、API、schema、指令或架構邊界改變時才更新文件。不要把開發紀錄、對話、未確認的未來規劃或一次性驗證證據寫進正式文件。

## 驗證指令

| 變更範圍 | 至少執行 |
| --- | --- |
| Web、crawler 或 shared 核心邏輯 | `pnpm test:core` |
| 維運 CLI、smoke、locks | `pnpm test:ops` |
| Discord bot | `pnpm test:discord` |
| 跨區域或 release candidate | `pnpm test:all` |
| Prisma schema／migration | `pnpm db:validate` 加上 disposable DB migration 驗證 |
| TypeScript、格式或 build | `pnpm check` |
| 公開頁面、RWD 或 API smoke | `pnpm e2e` |

`pnpm test` 等同 core tests；它不是完整測試集合。`pnpm check` 會執行 typecheck、Biome lint 與 Next.js production build。

Playwright 在沒有 `E2E_BASE_URL` 時會建立並啟動本機 web；安裝瀏覽器：

```bash
pnpm e2e:install
```

## 提交前檢查

- 變更只包含本次範圍，沒有 `.env`、備份、raw data 或私人筆記。
- 沒有無 consumer export、重複 helper、過程註解或不必要測試。
- 相關測試與 `git diff --check` 已通過。
- 文件指令與實際 package／Compose service 一致。
- 已明確記錄未能在本機驗證的外部條件。
