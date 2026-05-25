# 開發環境設定

本文件定義 PartsRadarTW 第一版正式開發時的本機開發方式。內容先作為環境與指令規劃，實際指令會在專案初始化後依 package scripts 補齊。

## 目標

開發環境需滿足：

- 可在本機啟動 Next.js 網站。
- 可在本機啟動 PostgreSQL。
- 可執行 Prisma migration 與 Prisma client 產生。
- 可獨立執行 crawler，不和網站 dev server 綁在一起。
- 可執行 Vitest 測試。
- 盡量貼近未來 Docker 自架環境。

## 部署環境假設

目前規劃未來另外架在朋友的 Ubuntu 虛擬機上，並以 Docker 為主要部署方式。

這代表第一版開發時應避免：

- 綁定單一開發者電腦的絕對路徑。
- 依賴只有本機才有的服務。
- 把正式主機密碼、連線資訊或 private key 放進 repo。
- 讓 crawler 只能靠手動終端機長期執行。

正式 Ubuntu VM 的反向代理、HTTPS、備份、監控與自動部署流程，後續另寫部署文件處理。

## 本機必要工具

第一版本機開發需要：

- Git。
- Node.js active LTS。
- pnpm。
- Docker 或可執行 Docker Compose 的環境。
- PostgreSQL client 工具，選配。

Node.js 精確版本先不在本文件硬定；正式初始化專案時應用 `.nvmrc`、`volta` 或 package manager 設定固定版本。

pnpm 建議透過 Corepack 啟用，避免每台機器手動安裝不同版本。

## Repo 結構

預期開發目錄：

```text
apps/
  web/
  crawler/
packages/
  db/
  shared/
docs/
```

責任：

- `apps/web`：Next.js 網站與 Route Handlers。
- `apps/crawler`：獨立 crawler process。
- `packages/db`：Prisma schema、migration 與 database client。
- `packages/shared`：共用型別、分類設定與資料驗證。

## 環境變數

repo 應提供 `.env.example` 作為範本。實際本機設定使用 `.env.local` 或各 app 對應的 local env 檔，不提交到 Git。

第一版預期環境變數：

| 名稱 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `COOLPC_BASE_URL` | 原價屋來源網址，預設 `https://www.coolpc.com.tw` |
| `SNAPSHOT_STORAGE_DIR` | raw snapshot 壓縮檔保存位置 |
| `CRAWLER_INTERVAL_SECONDS` | crawler 週期秒數，第一版預設 `300` |
| `CRAWLER_BACKOFF_SECONDS` | 連續失敗後延後秒數，第一版預設 `3600` |
| `NODE_ENV` | Node.js 執行環境 |

規則：

- `.env.example` 可以提交。
- `.env.local`、`.env.production`、實際密碼與私鑰不可提交。
- 正式環境的 env 應在 Ubuntu VM 或部署工具內管理。

## PostgreSQL

本機開發優先使用 Docker Compose 啟動 PostgreSQL。

原則：

- 本機資料庫與正式資料庫分開。
- 本機資料庫可重建，不視為正式資料。
- migration 由 Prisma 管理。
- seed data 若有需要，應使用可重跑的 script。

預期服務：

```text
postgres
```

正式實作時可建立開發用 compose 檔，例如：

```text
compose.dev.yml
```

## Raw Snapshot Storage

本機 raw snapshot 可保存於 repo 外或 repo 內被忽略的資料夾。

建議預設：

```text
storage/snapshots/
```

規則：

- raw snapshot 檔案不提交。
- metadata 存 PostgreSQL。
- 實際檔案透過 `SNAPSHOT_STORAGE_DIR` 控制。
- 正式 Ubuntu VM 上需掛載 persistent volume，避免 container 重建後檔案消失。

## 預期 Scripts

正式初始化 package scripts 時，建議保留下列入口：

| Script | 用途 |
| --- | --- |
| `pnpm dev` | 啟動網站開發環境，不預設啟動 crawler |
| `pnpm dev:web` | 啟動 Next.js web app |
| `pnpm dev:crawler` | 啟動 crawler 開發模式 |
| `pnpm db:migrate` | 執行 Prisma migration |
| `pnpm db:generate` | 產生 Prisma client |
| `pnpm test` | 執行 Vitest |
| `pnpm lint` | 執行 ESLint |
| `pnpm typecheck` | 執行 TypeScript type check |

第一版不要求一開始就建立所有 script，但正式開發前應至少有：

- `pnpm dev`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`

## 開發流程

一般本機流程：

1. 安裝 dependencies。
2. 建立本機 env 檔。
3. 啟動 PostgreSQL。
4. 執行 Prisma migration。
5. 啟動 web dev server。
6. 需要測試 crawler 時，另開獨立程序啟動 crawler。
7. 修改 parser 或資料處理邏輯時，執行 Vitest。

Crawler 不應隨 `pnpm dev` 自動啟動，避免開發時無意中頻繁請求原價屋。

## Crawler 開發規則

Crawler 開發時應遵守：

- 優先使用 fixture 測試 parser。
- 需要實際抓取原價屋時才手動執行 crawler。
- 實際抓取需遵守 5 分鐘週期與 backoff 規則。
- 疑似攔截時立即停止當次流程。
- 不因本機測試失敗清空正式商品資料。

Parser 修正後，應能使用保存的 raw snapshot 或 fixture 重跑測試，避免每次都重新打來源站。

## 本機檔案與 Git

不應提交：

- `node_modules/`
- `.next/`
- build output。
- `.env.local`
- `.env.production`
- raw snapshot 檔案。
- 本機資料庫 volume。
- IDE 或作業系統產生的暫存檔。

應提交：

- `.env.example`
- package scripts。
- Prisma schema 與 migration。
- parser fixture，前提是內容已確認適合放入 repo。
- 測試檔。
- 技術文件。
