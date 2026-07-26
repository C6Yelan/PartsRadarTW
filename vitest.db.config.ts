// vitest.db.config.ts
// 僅執行需要 disposable PostgreSQL 的 integration tests，並拒絕未確認隔離的資料庫。

import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");
}

if (process.env.PARTSRADAR_TEST_DATABASE_ISOLATED !== "1") {
  throw new Error(
    "PARTSRADAR_TEST_DATABASE_ISOLATED=1 is required to confirm the database is disposable.",
  );
}

const parsedDatabaseUrl = new URL(testDatabaseUrl);

if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
  throw new Error("TEST_DATABASE_URL must use the postgres or postgresql protocol.");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/**/*.integration.test.{ts,tsx}", "packages/**/*.integration.test.{ts,tsx}"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
