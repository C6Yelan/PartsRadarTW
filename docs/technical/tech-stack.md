# 技術選型

本文件記錄 PartsRadarTW 的技術選型決策。只記錄會影響專案架構、開發方式或長期維護的項目；一般小型套件可等實作時再決定。

## 已確認

| 項目 | 決策 | 說明 |
| --- | --- | --- |
| Repo 型態 | 單一 repo | 第一階段網站、API、crawler、資料模型與文件都放在同一個 repo。後續價格歷史、商品比較與營運監控也先沿用單一 repo；只有在部署、權限或維護成本明顯需要時才考慮拆 repo。 |
| 主要語言 | TypeScript | 第一階段網站、API、crawler 與後續營運工具都以 TypeScript 為主，讓資料型別、驗證邏輯與工具鏈能在單一 repo 內保持一致。 |
| 網站框架 | Next.js + React | 第一版網站使用 Next.js 與 React 開發，並以 TypeScript / TSX 撰寫前端與查詢 API。 |
| crawler 工具 | Node.js + TypeScript + cheerio | 第一版 crawler 使用獨立 Node.js process 執行，不放在 Next.js request / API route 內。HTTP client 優先使用 Node.js 內建 `fetch` 或 `undici`；HTML parser 使用 `cheerio`；Playwright 只作為後備方案，不列入第一版主線。 |
| 資料庫 | PostgreSQL | 第一版使用 PostgreSQL 作為主要資料庫，支援商品主檔、價格歷史、目前價格、crawler 狀態與後續價格變動探索。 |
| ORM / migration 工具 | Prisma | 第一版使用 Prisma 管理 PostgreSQL schema、migration 與 TypeScript database client；若未來遇到複雜查詢，可再以 raw SQL 補充。 |
| package manager | pnpm | 第一版使用 pnpm 管理依賴、scripts、workspace 與 lockfile，方便單一 repo 內的 web、crawler、shared packages 與後續營運工具共用工具鏈。 |
| 測試工具 | Vitest | 第一版使用 Vitest 測試 crawler parser、資料處理、API 邏輯與共用工具函式；瀏覽器 E2E 測試工具先不列入第一版決策。 |
| lint / format | Biome | 第一版使用 Biome 負責 lint 與 format，不使用 ESLint + Next.js config；TypeScript typecheck 負責型別檢查，Next.js build 負責確認網站可正常編譯。 |
| 部署方向 | 自架 + Docker | 專案未來以自架為主要部署方向，第一個目標環境預計是 Ubuntu 虛擬機，第一版部署設計以 Docker 為主。Docker Compose、反向代理、CI/CD 與正式主機細節等到部署文件階段再定。 |
