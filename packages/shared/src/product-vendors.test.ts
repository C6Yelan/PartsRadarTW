// packages/shared/src/product-vendors.test.ts
import { describe, expect, it } from "vitest";
import { classifyProductVendor } from "./product-vendors";

describe("product vendor classification", () => {
  it("classifies product brands that appeared without vendor metadata", () => {
    expect(classifyProductVendor(6, "Origin code Vortex RGB 32GB DDR5-6200")).toEqual({
      slug: "origin-code",
      name: "Origin code",
    });
    expect(classifyProductVendor(10, "Raymii RNF-K6 大風扇RGB筆電散熱支架")).toEqual({
      slug: "raymii",
      name: "Raymii",
    });
    expect(classifyProductVendor(12, "酷碼 ARGB 強化玻璃 顯卡支撐架")).toEqual({
      slug: "coolermaster",
      name: "酷碼",
    });
    expect(classifyProductVendor(14, "BitFenix CETO Basic 白 顯卡長39")).toEqual({
      slug: "bitfenix",
      name: "BitFenix",
    });
    expect(classifyProductVendor(15, "利民 Thermalright SG-650(650W) 雙8/金牌")).toEqual({
      slug: "thermalright",
      name: "利民",
    });
  });

  it("strips source labels before matching brand names", () => {
    expect(
      classifyProductVendor(
        14,
        "【台中公益門市限定】保銳 ENERPAZO EP237白 顯卡長36.5",
      ),
    ).toEqual({
      slug: "enermax",
      name: "保銳",
    });
  });
});
