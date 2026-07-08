// apps/crawler/tests/scripts/ops/maintenance-daemon-options.test.ts
// 驗證 maintenance daemon 的 live fetch 確認、排程預設、env 覆寫與 interval 防呆。

import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseMaintenanceDaemonOptions } from "../../../src/scripts/ops/maintenance-daemon";
import { PRODUCT_LINK_KINDS } from "../../../src/scripts/ops/product-link-checker/processor";
import { cleanupMaintenanceTempRoots, createWorkspace } from "./maintenance-daemon-support";

afterEach(cleanupMaintenanceTempRoots);

describe("maintenance daemon options", () => {
  it("requires explicit live fetch confirmation unless dry-run is used", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() => parseMaintenanceDaemonOptions([], {}, crawlerCwd)).toThrow(
      "Refusing scheduled maintenance live fetch",
    );
    expect(parseMaintenanceDaemonOptions(["--dry-run"], {}, crawlerCwd).dryRun).toBe(true);
  });

  it("uses conservative scheduled maintenance defaults", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();
    const options = parseMaintenanceDaemonOptions(["--confirm-live-fetch"], {}, crawlerCwd);

    expect(options).toMatchObject({
      workspaceRoot,
      dryRun: false,
      runOnce: false,
      intervalSeconds: 604800,
      initialDelaySeconds: 900,
      pricePriorityPauseSeconds: 300,
      prioritySignalTtlSeconds: 600,
      lockDir: join(workspaceRoot, "temp", "external-fetch.lock"),
      lockStaleSeconds: 43200,
      link: {
        limit: 200,
        staleAfterHours: 168,
        minDelayMs: 10000,
        maxDelayMs: 20000,
        kinds: [PRODUCT_LINK_KINDS.SOURCE],
      },
    });
  });

  it("reads Docker paths and cycle settings from env", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseMaintenanceDaemonOptions(
      ["--confirm-live-fetch", "--run-once"],
      {
        EXTERNAL_FETCH_LOCK_DIR: "/var/lib/partsradar/snapshots/.locks/external-fetch",
        MAINTENANCE_INTERVAL_SECONDS: "172800",
        MAINTENANCE_INITIAL_DELAY_SECONDS: "1200",
        MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS: "180",
        EXTERNAL_FETCH_PRIORITY_TTL_SECONDS: "240",
        MAINTENANCE_LINK_LIMIT: "75",
      },
      crawlerCwd,
    );

    expect(options).toMatchObject({
      runOnce: true,
      intervalSeconds: 172800,
      initialDelaySeconds: 1200,
      pricePriorityPauseSeconds: 180,
      prioritySignalTtlSeconds: 240,
      lockDir: "/var/lib/partsradar/snapshots/.locks/external-fetch",
      link: { limit: 75 },
    });
  });

  it("rejects too frequent maintenance intervals", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseMaintenanceDaemonOptions(
        ["--confirm-live-fetch", "--interval-seconds", "3599"],
        {},
        crawlerCwd,
      ),
    ).toThrow("--interval-seconds/MAINTENANCE_INTERVAL_SECONDS must be an integer between 3600 and 604800.");
  });
});
