// vitest.db.config.ts
// 僅執行需要 disposable PostgreSQL 的 integration tests，並拒絕未確認隔離的資料庫。

import { defineConfig } from "vitest/config";
import { validateTestDatabaseEnvironment } from "./scripts/test-database-safety.mjs";

validateTestDatabaseEnvironment(process.env, { requiredUrls: ["TEST_DATABASE_URL"] });

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/**/*.integration.test.{ts,tsx}", "packages/**/*.integration.test.{ts,tsx}"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
