// apps/crawler/tests/coolpc/vendor-classification.test.ts
import { describe, expect, it } from "vitest";
import { classifyProductVendor } from "../../src/coolpc/vendor-classification";

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
    expect(classifyProductVendor(8, "Toshiba 2TB【P300系列】(256M/7200轉/3年保)")).toEqual({
      slug: "toshiba",
      name: "Toshiba",
    });
    expect(classifyProductVendor(11, "華碩 Prime LC 240 ARGB 水冷")).toEqual({
      slug: "asus",
      name: "華碩",
    });
    expect(classifyProductVendor(16, "台達 AK-12B(黑) 12cm 效能扇")).toEqual({
      slug: "delta",
      name: "台達",
    });
    expect(classifyProductVendor(16, "Acer Predator Frostblade 120 風扇")).toEqual({
      slug: "acer",
      name: "宏碁",
    });
    expect(classifyProductVendor(11, "鈦鉭 TCOMAS LE200 360(黑) 水冷")).toEqual({
      slug: "tcomas",
      name: "鈦鉭",
    });
    expect(classifyProductVendor(11, "ASRock Pro White 360 ARGB(白) 水冷")).toEqual({
      slug: "asrock",
      name: "華擎",
    });
    expect(classifyProductVendor(11, "SAMA L50 360 BK(黑) 水冷")).toEqual({
      slug: "sama",
      name: "SAMA",
    });
    expect(classifyProductVendor(16, "威剛 XPG VENTO 120 ARGB(白) 風扇")).toEqual({
      slug: "adata",
      name: "威剛",
    });
    expect(classifyProductVendor(16, "海盜船 iCUE LINK 200mm 連接線")).toEqual({
      slug: "corsair",
      name: "海盜船",
    });
    expect(classifyProductVendor(16, "i-CoolTw 12cm 靜音油封風扇(大4Pin)")).toEqual({
      slug: "icooltw",
      name: "i-CoolTw",
    });
    expect(classifyProductVendor(16, "BitFenix 火鳥 幽靈 Spectre A.RGB 風扇")).toEqual({
      slug: "bitfenix",
      name: "BitFenix",
    });
    expect(classifyProductVendor(16, "Sharkoon SilentStorm 暴風扇 A.RGB")).toEqual({
      slug: "sharkoon",
      name: "旋剛",
    });
  });

  it("strips source labels before matching brand names", () => {
    expect(
      classifyProductVendor(14, "【台中公益門市限定】保銳 ENERPAZO EP237白 顯卡長36.5"),
    ).toEqual({
      slug: "enermax",
      name: "保銳",
    });
  });
});
