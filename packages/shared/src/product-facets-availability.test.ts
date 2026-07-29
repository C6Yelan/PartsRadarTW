// packages/shared/src/product-facets-availability.test.ts
// 驗證公開 facet availability candidates 直接來自有限 registry 並維持穩定順序。

import { describe, expect, it } from "vitest";
import { getPublicProductFacetAvailabilityTags } from "./product-facets";

describe("public product facet availability", () => {
  it("derives the finite SSD candidates from the public registry", () => {
    expect(getPublicProductFacetAvailabilityTags(7)).toEqual([
      "capacity_bucket:128",
      "capacity_bucket:240-256",
      "capacity_bucket:480-512",
      "capacity_bucket:about-1tb",
      "capacity_bucket:about-2tb",
      "capacity_bucket:4000",
      "capacity_bucket:8000",
    ]);
    expect(getPublicProductFacetAvailabilityTags(4)).toEqual([]);
  });
});
