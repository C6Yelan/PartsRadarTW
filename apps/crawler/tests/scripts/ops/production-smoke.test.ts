import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseProductionSmokeOptions } from "../../../src/scripts/ops/production-smoke";
import { parseProductionSmokeDaemonOptions } from "../../../src/scripts/ops/production-smoke-daemon";

describe("production smoke options", () => {
  it("uses conservative defaults", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const options = parseProductionSmokeOptions([], {}, crawlerCwd);

    expect(options).toMatchObject({
      workspaceRoot,
      baseUrl: "http://127.0.0.1:3000/",
      timeoutMs: 5000,
      sourceWarnAfterMinutes: 60,
      sourceFailAfterMinutes: 120,
      crawlerWarnAfterMinutes: 90,
      crawlerFailAfterMinutes: 180,
      recentWindowHours: 24,
      parseErrorWarnCount: 20,
      parseErrorFailCount: 100,
      minActiveProducts: 1,
      missingImageWarnCount: 200,
      missingImageFailCount: 500,
      brokenLinkWarnCount: 1,
      brokenLinkFailCount: 50,
    });
    expect(options.productImageStorageDir).toBe(join(workspaceRoot, "storage", "product-images"));
  });

  it("accepts env and CLI overrides", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const options = parseProductionSmokeOptions(
      [
        "--base-url",
        "https://partsradar.net",
        "--timeout-ms",
        "7000",
        "--source-warn-after-minutes",
        "45",
        "--missing-image-warn-count",
        "10",
      ],
      {
        SMOKE_TIMEOUT_MS: "9000",
        SMOKE_PRODUCT_IMAGE_STORAGE_DIR: "ignored",
        PRODUCT_IMAGE_STORAGE_DIR: "custom-images",
        SMOKE_CRAWLER_FAIL_AFTER_MINUTES: "240",
      },
      crawlerCwd,
    );

    expect(options.baseUrl).toBe("https://partsradar.net/");
    expect(options.timeoutMs).toBe(7000);
    expect(options.sourceWarnAfterMinutes).toBe(45);
    expect(options.crawlerFailAfterMinutes).toBe(240);
    expect(options.missingImageWarnCount).toBe(10);
    expect(options.productImageStorageDir).toBe(join(workspaceRoot, "custom-images"));
  });

  it("rejects invalid URLs and invalid integer ranges", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() => parseProductionSmokeOptions(["--base-url", "not a url"], {}, crawlerCwd)).toThrow(
      "must be a valid HTTP(S) URL",
    );
    expect(() =>
      parseProductionSmokeOptions(["--timeout-ms", "999"], {}, crawlerCwd),
    ).toThrow("--timeout-ms/SMOKE_TIMEOUT_MS must be an integer");
  });
});

describe("production smoke daemon options", () => {
  it("adds daemon interval and run-once options", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--interval-seconds", "600", "--initial-delay-seconds", "0"],
      {},
      crawlerCwd,
    );

    expect(options.runOnce).toBe(true);
    expect(options.intervalSeconds).toBe(600);
    expect(options.initialDelaySeconds).toBe(0);
  });
});

async function createWorkspace(): Promise<{
  workspaceRoot: string;
  crawlerCwd: string;
}> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-smoke-options-"));
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");

  return {
    workspaceRoot,
    crawlerCwd: join(workspaceRoot, "apps", "crawler"),
  };
}
