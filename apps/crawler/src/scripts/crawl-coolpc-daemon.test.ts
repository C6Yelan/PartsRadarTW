import { describe, expect, it } from "vitest";
import { parseDaemonOptions } from "./crawl-coolpc-daemon";

describe("CoolPC scheduled crawler daemon options", () => {
  it("requires explicit live fetch confirmation", () => {
    expect(() => parseDaemonOptions([], {}, "/repo/apps/crawler")).toThrow(
      "Refusing scheduled CoolPC live fetch",
    );
  });

  it("reads safe defaults from env and resolves storage from the workspace root", () => {
    const options = parseDaemonOptions(
      ["--confirm-live-fetch"],
      {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_BACKOFF_SECONDS: "7200",
        CRAWLER_CATEGORY_DELAY_MS: "5000",
        SNAPSHOT_STORAGE_DIR: "storage/snapshots",
        COOLPC_BASE_URL: "https://example.test",
      },
      "/repo/apps/crawler",
    );

    expect(options).toEqual({
      workspaceRoot: "/repo",
      storageDir: "/repo/storage/snapshots",
      intervalSeconds: 600,
      backoffSeconds: 7200,
      categoryDelayMs: 5000,
      runOnce: false,
      baseUrl: "https://example.test",
    });
  });

  it("rejects aggressive schedule values", () => {
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
        "/repo/apps/crawler",
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
        "/repo/apps/crawler",
      ),
    ).toThrow("--category-delay-ms/CRAWLER_CATEGORY_DELAY_MS must be at least 3000");
  });
});
