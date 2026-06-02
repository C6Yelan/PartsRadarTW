// apps/web/tests/products/return-href.test.ts
import { describe, expect, it } from "vitest";

import { normalizeReturnHref } from "../../app/products/[id]/return-href";

describe("product detail return href", () => {
  it("allows only the product explorer root path and query string", () => {
    expect(normalizeReturnHref("/?q=ryzen&page=2")).toBe("/?q=ryzen&page=2");
    expect(normalizeReturnHref(["/?status=inactive", "/?q=ignored"])).toBe("/?status=inactive");
  });

  it("falls back home for external, protocol-relative, or non-root return URLs", () => {
    expect(normalizeReturnHref(undefined)).toBe("/");
    expect(normalizeReturnHref("https://example.test/?q=ryzen")).toBe("/");
    expect(normalizeReturnHref("//example.test/?q=ryzen")).toBe("/");
    expect(normalizeReturnHref("/products/11111111-1111-1111-1111-111111111111")).toBe("/");
  });
});
