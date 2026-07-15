// 驗證跨功能分頁與數字輸入 helper 的既有邊界與 gap semantics。

import { describe, expect, it } from "vitest";

import { toDigitsOnly } from "../../app/_shared/numeric-input";
import { getVisiblePages } from "../../app/_shared/pagination";

describe("shared pagination helpers", () => {
  it.each([
    { label: "zero total pages", currentPage: 1, totalPages: 0, expected: [1] },
    { label: "one total page", currentPage: 1, totalPages: 1, expected: [1] },
    { label: "two adjacent pages", currentPage: 1, totalPages: 2, expected: [1, 2] },
    {
      label: "first page with a trailing gap",
      currentPage: 1,
      totalPages: 10,
      expected: [1, 2, "gap-2-10", 10],
    },
    {
      label: "middle page with gaps on both sides",
      currentPage: 5,
      totalPages: 10,
      expected: [1, "gap-1-4", 4, 5, 6, "gap-6-10", 10],
    },
    {
      label: "last page with a leading gap",
      currentPage: 10,
      totalPages: 10,
      expected: [1, "gap-1-9", 9, 10],
    },
  ])("builds visible pages for $label", ({ currentPage, totalPages, expected }) => {
    expect(getVisiblePages(currentPage, totalPages)).toEqual(expected);
  });

  it.each([
    { value: "", expected: "" },
    { value: "123", expected: "123" },
    { value: " 1,234.50 ", expected: "123450" },
    { value: "page-9-of-12", expected: "912" },
    { value: "１２3", expected: "3" },
  ])("keeps only ASCII digits from $value", ({ value, expected }) => {
    expect(toDigitsOnly(value)).toBe(expected);
  });
});
