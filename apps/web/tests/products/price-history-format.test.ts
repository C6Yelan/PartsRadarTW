// apps/web/tests/products/price-history-format.test.ts
import { describe, expect, it } from "vitest";

import { formatRecordDateTime } from "../../app/products/[id]/price-history/format";

describe("price history formatting", () => {
  it("formats change record timestamps as fixed UTC+8 MM/DD HH:MM", () => {
    expect(formatRecordDateTime("2026-06-05T01:07:00.000Z")).toBe("06/05 09:07");
  });
});
