// apps/web/tests/build-list/formatting.test.ts
import { describe, expect, it } from "vitest";

import { formatBuildListExportDateTime } from "../../app/build-list/formatting";

describe("build list formatting", () => {
  it("formats export date times in fixed UTC+8", () => {
    expect(formatBuildListExportDateTime("2026-05-28T16:05:00.000Z")).toBe(
      "2026-05-29 00:05",
    );
  });

  it("keeps invalid export date values readable", () => {
    expect(formatBuildListExportDateTime("not-a-date")).toBe("not-a-date");
  });
});
