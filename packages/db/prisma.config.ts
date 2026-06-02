// packages/db/prisma.config.ts
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig, env } from "prisma/config";

const workspaceRoot = resolve(__dirname, "../..");

loadDotenv({ path: resolve(workspaceRoot, ".env"), quiet: true });
loadDotenv({
  path: resolve(workspaceRoot, ".env.local"),
  override: true,
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
