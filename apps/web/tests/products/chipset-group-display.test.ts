// 驗證晶片組 group 名稱只在顯示層解析，且未知名稱能安全保留。

import { describe, expect, it } from "vitest";

import {
  parseChipsetGroupDisplay,
  shouldShowChipsetVendorHeading,
} from "../../app/product-explorer/components/chipset-group-display";

describe("chipset group display", () => {
  it.each([
    ["Intel LGA 1700", "LGA 1700"],
    ["Intel LGA 1851", "LGA 1851"],
  ])("parses %s as Intel", (group, platformLabel) => {
    expect(parseChipsetGroupDisplay(group)).toEqual({
      vendor: "intel",
      vendorLabel: "Intel",
      platformLabel,
      originalGroup: group,
    });
  });

  it.each([
    ["AMD AM4", "AM4"],
    ["AMD AM5", "AM5"],
    ["Threadripper", "Threadripper"],
  ])("parses %s as AMD", (group, platformLabel) => {
    expect(parseChipsetGroupDisplay(group)).toEqual({
      vendor: "amd",
      vendorLabel: "AMD",
      platformLabel,
      originalGroup: group,
    });
  });

  it("keeps an unknown group visible without assigning a vendor", () => {
    expect(parseChipsetGroupDisplay("Future workstation platform")).toEqual({
      vendor: "unknown",
      vendorLabel: "",
      platformLabel: "Future workstation platform",
      originalGroup: "Future workstation platform",
    });
  });

  it.each([
    ["Intel LGA 1700", null, true],
    ["Intel LGA 1851", "Intel LGA 1700", false],
    ["AMD AM4", "Intel 舊平台／工作站", true],
    ["AMD AM5", "AMD AM4", false],
    ["Threadripper", "AMD AM5", false],
    ["Future workstation platform", "Threadripper", false],
  ])(
    "detects the vendor boundary for %s after %s",
    (group, previousGroup, expected) => {
      expect(shouldShowChipsetVendorHeading(group, previousGroup)).toBe(expected);
    },
  );
});
