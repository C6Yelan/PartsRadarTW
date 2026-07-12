// packages/shared/src/product-facets.test.ts
// 驗證現有 11 個 CoolPC 分類的 facet registry 與商品名稱 filter tag 解析。

import { describe, expect, it } from "vitest";
import {
  extractProductFilterTags,
  getProductFacetDefinitions,
  isProductFilterTagSupported,
  PRODUCT_FACET_IGRPS,
} from "./product-facets";

describe("product facets", () => {
  it("defines facets for exactly the existing 11 categories", () => {
    expect(PRODUCT_FACET_IGRPS).toEqual([4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16]);
    expect(PRODUCT_FACET_IGRPS.every((igrp) => getProductFacetDefinitions(igrp).length > 0)).toBe(
      true,
    );
    expect(getProductFacetDefinitions(9)).toEqual([]);
  });

  it("extracts CPU socket, family, and explicit integrated graphics", () => {
    expect(extractProductFilterTags(4, "AMD R7 9700X【8核/16緒】3.8G / 具內顯")).toEqual([
      "socket:am5",
      "cpu_family:ryzen-7",
      "integrated_graphics:yes",
    ]);
  });

  it("extracts motherboard chipset without confusing ATX and M-ATX", () => {
    const tags = extractProductFilterTags(
      5,
      "華碩 TUF GAMING B850M-PLUS WIFI(M-ATX/DDR5/無線)",
    );
    expect(tags).toEqual([
      "socket:am5",
      "chipset:b850",
      "form_factor:m-atx",
      "memory_type:ddr5",
      "wifi:yes",
    ]);
    expect(tags).not.toContain("form_factor:atx");
  });

  it("keeps extended AMD chipset names distinct from their base variants", () => {
    const tags = extractProductFilterTags(5, "華碩 ROG STRIX B650E-I GAMING WIFI(Mini-ITX/DDR5)");
    expect(tags).toContain("chipset:b650e");
    expect(tags).not.toContain("chipset:b650");
  });

  it("extracts memory type, capacity, and speed", () => {
    expect(
      extractProductFilterTags(6, "桌上型 32GB(雙通16GB*2) DDR5 6000/CL30"),
    ).toEqual([
      "module_type:desktop",
      "memory_type:ddr5",
      "capacity_gb:32",
      "speed_mhz:6000",
    ]);
  });

  it("extracts SSD details inside the existing combined storage category", () => {
    expect(extractProductFilterTags(7, "Samsung 990 PRO 2TB M.2 PCIe 4.0 NVMe SSD")).toEqual([
      "storage_type:ssd",
      "form_factor:m2",
      "interface:pcie",
      "interface:nvme",
      "pcie_generation:gen4",
      "capacity_gb:2000",
    ]);
  });

  it("extracts external storage type, connector, and capacity", () => {
    expect(extractProductFilterTags(8, "外接 SSD 2TB USB Type-C")).toEqual([
      "external_type:external-ssd",
      "connector:type-c",
      "capacity_gb:2000",
    ]);
  });

  it("extracts air cooler shape, fan size, and explicit socket", () => {
    expect(extractProductFilterTags(10, "雙塔 CPU 散熱器 120mm 支援 AM5")).toEqual([
      "cooler_type:air-tower",
      "fan_size_mm:120",
      "socket:am5",
    ]);
  });

  it("extracts liquid cooling type, radiator size, and explicit socket", () => {
    expect(extractProductFilterTags(11, "360mm 一體式水冷 支援 LGA1700")).toEqual([
      "liquid_type:aio",
      "radiator_size_mm:360",
      "socket:lga1700",
    ]);
  });

  it("extracts GPU chip, series, and VRAM", () => {
    expect(extractProductFilterTags(12, "NVIDIA GeForce RTX 5070 Ti 16GB")).toEqual([
      "gpu_chip:nvidia",
      "gpu_series:rtx-50",
      "vram_gb:16",
    ]);
  });

  it.each([
    "AMD Ryzen TR 9960X盒【24核/48緒】",
    "AMD Ryzen TR PRO 9995WX盒【96核/192緒】",
  ])("recognizes current Ryzen TR naming as Threadripper: %s", (name) => {
    expect(extractProductFilterTags(4, name)).toEqual(["socket:str5", "cpu_family:threadripper"]);
  });

  it.each([
    ["Acer Nitro Intel ARC B570 OC 10GB(2690MHz/27cm/雙風扇/註三年)", "10"],
    ["Acer Nitro ARC B580 OC 12GB(2740MHz/28cm/三風扇/註三年)", "12"],
    ["華擎 ARC PRO B70 Creator 32G(2540MHz/27cm/鼓風扇/註冊五年保)", "32"],
  ])("extracts parenthesized Intel Arc VRAM: %s", (name, vramGb) => {
    expect(extractProductFilterTags(12, name)).toEqual([
      "gpu_chip:intel",
      "gpu_series:arc",
      `vram_gb:${vramGb}`,
    ]);
  });

  it("extracts multiple explicitly supported case form factors", () => {
    const tags = extractProductFilterTags(14, "中塔機殼 支援 E-ATX/M-ATX/背插");
    expect(tags).toEqual([
      "motherboard_support:e-atx",
      "motherboard_support:m-atx",
      "back_connect:yes",
      "case_size:mid-tower",
    ]);
    expect(tags).not.toContain("motherboard_support:atx");
  });

  it("extracts an included PSU when the wattage appears between 內附 and 電源", () => {
    expect(
      extractProductFilterTags(
        14,
        "Mavoly Strawberry M16(黑) 顯卡長20/CPU高7/內附400W電源(1年)/ITX",
      ),
    ).toContain("included_psu:yes");
  });

  it.each([
    "中塔機殼/含 500W 電源",
    "中塔機殼/包含 500W 電源",
    "中塔機殼/不含滑軌/內附400W電源",
  ])("extracts an explicitly included PSU: %s", (name) => {
    expect(extractProductFilterTags(14, name)).toContain("included_psu:yes");
  });

  it.each([
    "中塔機殼/不含電源",
    "中塔機殼/未含電源",
    "中塔機殼/不含 500W 電源",
    "中塔機殼/不包含電源",
    "中塔機殼/未包含電源",
    "中塔機殼/內含風扇/不含電源",
    "中塔機殼/不含電源/內附3顆風扇",
    "中塔機殼/未含電源/內附3顆風扇",
  ])("does not infer an included PSU from a negated description: %s", (name) => {
    expect(extractProductFilterTags(14, name)).not.toContain("included_psu:yes");
  });

  it("does not infer an included PSU from bundled fans and a power-supply shroud", () => {
    expect(
      extractProductFilterTags(14, "中塔機殼/內附3顆風扇/下置電源倉"),
    ).not.toContain("included_psu:yes");
  });

  it.each([
    ["伺服器機殼/EEB(不含滑軌)", "motherboard_support:eeb"],
    ["全塔機殼/E-ATX(不含滑軌)", "motherboard_support:e-atx"],
    ["中塔機殼/ATX(ATX-01)", "motherboard_support:atx"],
    ["小型機殼/M-ATX(XT325M_WT01)", "motherboard_support:m-atx"],
  ])("accepts an opening parenthesis after a case form factor: %s", (name, expectedTag) => {
    const tags = extractProductFilterTags(14, name);

    expect(tags).toContain(expectedTag);
    if (expectedTag !== "motherboard_support:atx") {
      expect(tags).not.toContain("motherboard_support:atx");
    }
  });

  it("extracts power supply wattage, efficiency, standards, and modularity", () => {
    expect(
      extractProductFilterTags(15, "850W ATX 3.1 PCIe 5.1 12V-2x6 80PLUS 金牌 全模組"),
    ).toEqual([
      "wattage_range:800-999",
      "efficiency:gold",
      "psu_standard:atx-3",
      "psu_standard:pcie-5",
      "psu_standard:12v-2x6",
      "modularity:full",
    ]);
  });

  it.each([
    [399, "under-400"],
    [400, "400-599"],
    [599, "400-599"],
    [600, "600-799"],
  ])("keeps %iW on the documented wattage boundary", (wattage, range) => {
    expect(extractProductFilterTags(15, `${wattage}W 電源供應器`)).toContain(
      `wattage_range:${range}`,
    );
  });

  it("extracts fan product type, size, and ARGB without a duplicate RGB tag", () => {
    expect(extractProductFilterTags(16, "120mm ARGB 機殼風扇 三入")).toEqual([
      "fan_product_type:fan",
      "fan_size_mm:120",
      "lighting:argb",
    ]);
  });

  it("rejects malformed, unknown, and cross-category tags", () => {
    expect(extractProductFilterTags(999, "AMD R7 9700X")).toEqual([]);
    expect(isProductFilterTagSupported(4, "socket:am5")).toBe(true);
    expect(isProductFilterTagSupported(4, "chipset:b850")).toBe(false);
    expect(isProductFilterTagSupported(4, "socket")).toBe(false);
  });
});
