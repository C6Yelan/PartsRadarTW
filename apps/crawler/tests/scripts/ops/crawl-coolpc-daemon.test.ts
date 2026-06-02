import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";
import { parseDaemonOptions } from "../../../src/scripts/ops/crawl-coolpc-daemon";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CoolPC scheduled crawler daemon options", () => {
  it("requires explicit live fetch confirmation", () => {
    expect(() => parseDaemonOptions([], {}, "/repo/apps/crawler")).toThrow(
      "Refusing scheduled CoolPC live fetch",
    );
  });

  it("reads safe defaults from env and resolves storage from the workspace root", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();
    const options = parseDaemonOptions(
      ["--confirm-live-fetch"],
      {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_BACKOFF_SECONDS: "7200",
        CRAWLER_CATEGORY_DELAY_MS: "5000",
        SNAPSHOT_STORAGE_DIR: "storage/snapshots",
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
      runOnce: false,
      baseUrl: "https://www.coolpc.com.tw",
    });
  });

  it("rejects command-line base URL overrides", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--base-url", "https://example.test"],
        {},
        crawlerCwd,
      ),
    ).toThrow("does not accept --base-url overrides");
  });

  it("rejects non-CoolPC base URL env values during startup parsing", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        { COOLPC_BASE_URL: "https://example.test" },
        crawlerCwd,
      ),
    ).toThrow("CoolPC base URL must be https://www.coolpc.com.tw.");
  });

  it("rejects aggressive schedule values", async () => {
    const { crawlerCwd } = await createWorkspace();

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
  });
});

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-daemon-options-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });

  return { workspaceRoot, crawlerCwd };
}
