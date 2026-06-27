// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const shouldStartLocalServer = !process.env.E2E_BASE_URL;
const localServerCommand =
  process.env.E2E_SKIP_BUILD === "1"
    ? "pnpm --filter @partsradar/web start --hostname 127.0.0.1 --port 3100"
    : "pnpm build:web && pnpm --filter @partsradar/web start --hostname 127.0.0.1 --port 3100";

export default defineConfig({
  testDir: "apps/web/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: shouldStartLocalServer
    ? {
        command: localServerCommand,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL,
      }
    : undefined,
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
