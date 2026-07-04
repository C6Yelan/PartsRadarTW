// apps/web/tests/ops/status-thresholds.test.ts
import { describe, expect, it } from "vitest";
import { readOpsStatusThresholds } from "../../app/ops/status/data";

describe("readOpsStatusThresholds", () => {
  it("uses smoke fallback environment names for source link thresholds", () => {
    expect(
      readOpsStatusThresholds({
        SMOKE_BROKEN_LINK_WARN_COUNT: "7",
        SMOKE_TEMPORARY_LINK_FAIL_COUNT: "900",
      }).sourceBrokenLinkWarnCount,
    ).toBe(7);
    expect(
      readOpsStatusThresholds({
        SMOKE_BROKEN_LINK_WARN_COUNT: "7",
        SMOKE_TEMPORARY_LINK_FAIL_COUNT: "900",
      }).sourceTemporaryLinkFailCount,
    ).toBe(900);
  });
});
