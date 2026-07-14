// apps/crawler/tests/scripts/ops/image-cache-recovery-daemon.test.ts

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatImageRecoveryCycleSummary,
  parseImageRecoveryDaemonOptions,
} from "../../../src/scripts/ops/image-cache-recovery-daemon";

describe("image cache recovery daemon options", () => {
  it("requires explicit live fetch confirmation", () => {
    expect(() =>
      parseImageRecoveryDaemonOptions([], join(process.cwd(), "apps", "crawler"), {}),
    ).toThrow("without --confirm-live-fetch");
  });

  it("uses a source-image-only lock and bounded daemon settings", () => {
    const options = parseImageRecoveryDaemonOptions(
      ["--confirm-live-fetch", "--run-once"],
      join(process.cwd(), "apps", "crawler"),
      {
        SNAPSHOT_STORAGE_DIR: "storage/snapshots",
        PRODUCT_IMAGE_STORAGE_DIR: "storage/product-images",
        SOURCE_IMAGE_FETCH_LOCK_DIR: "storage/snapshots/.locks/source-image-fetch",
        SOURCE_IMAGE_FETCH_LOCK_STALE_SECONDS: "300",
        IMAGE_RECOVERY_INTERVAL_SECONDS: "600",
        IMAGE_RECOVERY_BATCH_LIMIT: "10",
        CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS: "1000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS: "2000",
      },
    );

    expect(options.runOnce).toBe(true);
    expect(options.intervalSeconds).toBe(600);
    expect(options.batchLimit).toBe(10);
    expect(options.imageOptions.sourceImageFetchLockDir).toContain("source-image-fetch");
    expect(options.imageOptions.minDelayMs).toBe(1000);
    expect(options.imageOptions.maxDelayMs).toBe(2000);
  });

  it("formats one bounded selection and processing summary per cycle", () => {
    expect(
      formatImageRecoveryCycleSummary(
        {
          neverCheckedRead: 18,
          retryDueRead: 2,
          auditRead: 5,
          reconciledExisting: 4,
          selectedForBackfill: 21,
        },
        {
          selected: 21,
          cached: 10,
          dryRun: 0,
          skipped: 0,
          reused: 2,
          invalid: 1,
          failed: 8,
          liveFetches: 19,
        },
      ),
    ).toBe(
      "Image recovery cycle finished. neverCheckedRead=18 retryDueRead=2 auditRead=5 reconciledExisting=4 selectedForBackfill=21 cached=10 reused=2 failed=8 invalid=1 liveFetches=19",
    );
  });
});
