// 驗證價格報告關鍵字跨 package 共用的格式與分組 tokenization。

import { describe, expect, it } from "vitest";
import {
  canonicalizePriceReportKeyword,
  tokenizePriceReportKeywordGroups,
} from "./price-report-keyword";

describe("price-report keyword helpers", () => {
  it.each([
    { input: "", canonical: "", groups: [] },
    { input: "   ", canonical: "", groups: [] },
    {
      input: " RTX   5090，  顯示卡 , , ASUS ",
      canonical: "RTX 5090, 顯示卡, ASUS",
      groups: [["RTX", "5090"], ["顯示卡"], ["ASUS"]],
    },
    {
      input: "AMD\u3000Ryzen, Intel   Core",
      canonical: "AMD Ryzen, Intel Core",
      groups: [
        ["AMD", "Ryzen"],
        ["Intel", "Core"],
      ],
    },
  ])("canonicalizes and tokenizes $input", ({ input, canonical, groups }) => {
    expect(canonicalizePriceReportKeyword(input)).toBe(canonical);
    expect(tokenizePriceReportKeywordGroups(input)).toEqual(groups);
  });

  it("treats missing values as no keyword groups", () => {
    expect(tokenizePriceReportKeywordGroups(null)).toEqual([]);
    expect(tokenizePriceReportKeywordGroups(undefined)).toEqual([]);
  });
});
