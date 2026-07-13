// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon/crawl-coolpc-daemon-images.test.ts

import { describe, expect, it } from "vitest";
import { createBoundedImageCandidateBatch } from "../../../../src/scripts/ops/crawl-coolpc-daemon/new-product-images";

describe("CoolPC scheduled crawler image batch", () => {
  it("prioritizes new products, removes recovery duplicates, and enforces the total limit", () => {
    const newProducts = Array.from({ length: 30 }, (_, index) => ({ id: `new-${index + 1}` }));
    const recovery = [{ id: "new-1" }, { id: "recovery-1" }, { id: "recovery-2" }];

    const result = createBoundedImageCandidateBatch(newProducts, recovery, 25);

    expect(result.candidates).toHaveLength(25);
    expect(result.candidates.map(({ id }) => id)).toEqual(
      Array.from({ length: 25 }, (_, index) => `new-${index + 1}`),
    );
    expect(result.deferredCount).toBe(7);
  });
});
