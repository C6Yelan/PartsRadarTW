// 驗證 public category slug 與 internal CoolPC IGrp 的單一雙向 mapping。

import { describe, expect, it } from "vitest";

import {
  CATEGORY_MAPPINGS,
  getCategoryIgrp,
  getCategoryMapping,
  getCategoryPath,
  getCategorySlug,
} from "../../app/category-slugs";

const EXPECTED_CATEGORY_MAPPINGS = [
  [4, "cpu"],
  [5, "motherboard"],
  [6, "memory"],
  [7, "storage"],
  [8, "hard-drive"],
  [9, "external-storage"],
  [10, "cooler"],
  [11, "liquid-cooling"],
  [12, "gpu"],
  [14, "case"],
  [15, "power-supply"],
  [16, "fan-accessory"],
] as const;

describe("category slug mapping", () => {
  it("keeps the public contract aligned to the CoolPC categories", () => {
    expect(CATEGORY_MAPPINGS.map(({ igrp, slug }) => [igrp, slug])).toEqual(
      EXPECTED_CATEGORY_MAPPINGS,
    );
  });

  it.each(EXPECTED_CATEGORY_MAPPINGS)("maps IGrp %i to %s in both directions", (igrp, slug) => {
    expect(getCategorySlug(igrp)).toBe(slug);
    expect(getCategoryIgrp(slug)).toBe(igrp);
  });

  it("does not resolve unknown public or source categories", () => {
    expect(getCategorySlug(99)).toBeNull();
    expect(getCategoryIgrp("unknown")).toBeNull();
  });

  it("uses the same mapping for route paths and user-visible names", () => {
    expect(getCategoryPath("gpu")).toBe("/categories/gpu");
    expect(getCategoryMapping("gpu")).toMatchObject({
      igrp: 12,
      slug: "gpu",
      displayName: "顯示卡",
    });
    expect(getCategoryMapping("unknown")).toBeNull();
  });
});
