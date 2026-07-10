// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon.test.ts
// 驗證 scheduled CoolPC crawler daemon 的 live fetch 確認、env/default 解析、base URL 與排程防呆。

import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseDaemonOptions } from "../../../src/scripts/ops/crawl-coolpc-daemon";
import { createCrawlerDaemonTestEnvironment } from "./crawl-coolpc-daemon-support";

describe("CoolPC scheduled crawler daemon options", () => {
  const testEnv = createCrawlerDaemonTestEnvironment();

  afterEach(testEnv.cleanup);

  it("requires explicit live fetch confirmation", () => {
    expect(() => parseDaemonOptions([], {}, "/repo/apps/crawler")).toThrow(
      "Refusing scheduled CoolPC live fetch",
    );
  });

  it("reads safe defaults from env and resolves storage from the workspace root", async () => {
    const { workspaceRoot, crawlerCwd } = await testEnv.createWorkspace();
    const options = parseDaemonOptions(
      ["--confirm-live-fetch"],
      {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_BACKOFF_SECONDS: "7200",
        CRAWLER_LOCK_RETRY_SECONDS: "90",
        CRAWLER_CATEGORY_DELAY_MS: "5000",
        CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS: "6000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS: "9000",
        CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS: "18000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES: "4194304",
        SNAPSHOT_STORAGE_DIR: "storage/snapshots",
        PRODUCT_IMAGE_STORAGE_DIR: "storage/product-images",
        EXTERNAL_FETCH_LOCK_STALE_SECONDS: "21600",
        COOLPC_BASE_URL: "https://www.coolpc.com.tw",
      },
      crawlerCwd,
    );

    expect(options).toEqual({
      workspaceRoot,
      storageDir: join(workspaceRoot, "storage", "snapshots"),
      intervalSeconds: 600,
      backoffSeconds: 7200,
      categoryDelayMs: 5000,
      lockDir: join(workspaceRoot, "storage", "snapshots", ".locks", "external-fetch"),
      lockStaleSeconds: 21600,
      lockRetrySeconds: 90,
      runOnce: false,
      baseUrl: "https://www.coolpc.com.tw",
      newProductImageBackfill: {
        workspaceRoot,
        storageDir: join(workspaceRoot, "storage", "product-images"),
        minDelayMs: 6000,
        maxDelayMs: 9000,
        timeoutMs: 18000,
        maxSourceBytes: 4194304,
      },
    });
  });

  it("rejects command-line base URL overrides", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--base-url", "https://example.test"],
        {},
        crawlerCwd,
      ),
    ).toThrow("does not accept --base-url overrides");
  });

  it("rejects non-CoolPC base URL env values during startup parsing", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        { COOLPC_BASE_URL: "https://example.test" },
        crawlerCwd,
      ),
    ).toThrow("CoolPC base URL must be https://www.coolpc.com.tw.");
  });

  it("rejects snapshot storage paths outside the configured or built-in roots", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--storage-dir", "temp/unrelated-snapshots"],
        {},
        crawlerCwd,
      ),
    ).toThrow("not within an allowlisted snapshot storage root");
  });

  it("rejects aggressive schedule values", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "30",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "3000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--interval-seconds/CRAWLER_INTERVAL_SECONDS must be at least 60");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "60",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "2000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--category-delay-ms/CRAWLER_CATEGORY_DELAY_MS must be at least 3000");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "60",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "60001",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--category-delay-ms/CRAWLER_CATEGORY_DELAY_MS must be at most 60000");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--new-product-image-min-delay-ms",
          "12000",
          "--new-product-image-max-delay-ms",
          "5000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--new-product-image-min-delay-ms/CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS");
  });
});
