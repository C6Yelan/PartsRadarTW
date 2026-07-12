// playwright.config.ts
// 定義 desktop／mobile 瀏覽器矩陣與隔離的本機測試伺服器。
import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const workspaceEnvFile = join(process.cwd(), ".env");

if (existsSync(workspaceEnvFile)) {
  process.loadEnvFile(workspaceEnvFile);
}

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const shouldStartLocalServer = !process.env.E2E_BASE_URL;
const standaloneWebRoot = "apps/web/.next/standalone/apps/web";
const stageStandaloneAssets = [
  `rm -rf ${standaloneWebRoot}/.next/static ${standaloneWebRoot}/public`,
  `mkdir -p ${standaloneWebRoot}/.next`,
  `cp -R apps/web/.next/static ${standaloneWebRoot}/.next/static`,
  `cp -R apps/web/public ${standaloneWebRoot}/public`,
].join(" && ");
const localServerCommand = [
  ...(process.env.E2E_SKIP_BUILD === "1" ? [] : ["NODE_ENV=production pnpm build:web"]),
  stageStandaloneAssets,
  `NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3100 node ${standaloneWebRoot}/server.js`,
].join(" && ");

export default defineConfig({
  testDir: "apps/web/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: shouldStartLocalServer
    ? {
        command: localServerCommand,
        reuseExistingServer: false,
        timeout: 120_000,
        url: baseURL,
      }
    : undefined,
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-tablet",
      grepInvert: /@desktop-only|@desktop-mobile-only/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "chromium-mobile",
      grepInvert: /@desktop-only/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
