// packages/shared/src/product-facets.test.ts
// 驗證 CoolPC 分類的 facet registry 與商品名稱 filter tag 解析。

import { describe, expect, it } from "vitest";
import {
  extractProductFilterTags,
  getProductFacetDefinitions,
  getPublicProductFacetDefinitions,
  isProductFilterTagSupported,
  mergeProductFilterTags,
  PRODUCT_FACET_IGRPS,
} from "./product-facets";

describe("product facets", () => {
  it("defines facets for the existing categories", () => {
    expect(PRODUCT_FACET_IGRPS).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16]);
    expect(PRODUCT_FACET_IGRPS.every((igrp) => getProductFacetDefinitions(igrp).length > 0)).toBe(
      true,
    );
  });

  it("extracts CPU socket, family, and explicit integrated graphics", () => {
    expect(extractProductFilterTags(4, "AMD R7 9700X【8核/16緒】3.8G / 具內顯")).toEqual([
      "socket:am5",
      "cpu_family:ryzen-7",
      "integrated_graphics:yes",
    ]);
  });

  it.each([
    ["Intel i5-14400F【10核/16緒】", "integrated_graphics:no"],
    ["Intel i5-14600K【14核/20緒】", "integrated_graphics:yes"],
    ["AMD R5 7500F MPK【6核/12緒】", "integrated_graphics:no"],
    ["AMD R5 5500X3D【6核/12緒】", "integrated_graphics:no"],
    ["AMD R7 5700G【8核/16緒】", "integrated_graphics:yes"],
  ])("infers deterministic integrated graphics for %s", (name, expectedTag) => {
    expect(extractProductFilterTags(4, name)).toContain(expectedTag);
  });

  it("extracts motherboard chipset without confusing ATX and M-ATX", () => {
    const tags = extractProductFilterTags(5, "華碩 TUF GAMING B850M-PLUS WIFI(M-ATX/DDR5/無線)");
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

  it("recognizes the B650E chipset in the confirmed B650EM model without matching B650M", () => {
    expect(extractProductFilterTags(5, "技嘉 B650EM FORCE WIFI6E")).toContain("chipset:b650e");
    expect(extractProductFilterTags(5, "技嘉 B650M FORCE WIFI")).toContain("chipset:b650");
    expect(extractProductFilterTags(5, "技嘉 B650M FORCE WIFI")).not.toContain("chipset:b650e");
  });

  it("removes the legacy motherboard socket catch-all while preserving chipset tags", () => {
    expect(getFacetOptions(5, "socket").map((option) => option.value)).toEqual([
      "lga1851",
      "lga1700",
      "am5",
      "am4",
      "swrx8",
      "str5",
    ]);
    expect(isProductFilterTagSupported(5, "socket:other")).toBe(false);
    expect(mergeProductFilterTags(5, ["socket:other"], [])).toEqual([]);

    for (const chipset of ["h81", "h110", "h310", "h510", "w680", "w790", "w880", "w890"]) {
      const tags = extractProductFilterTags(5, `測試 ${chipset.toUpperCase()} 主機板`);
      expect(tags).toContain(`chipset:${chipset}`);
      expect(tags).not.toContain("socket:other");
    }
  });

  it.each([
    ["H610 主機板", "socket:lga1700"],
    ["H810 主機板", "socket:lga1851"],
    ["PRO WS W680M-ACE SE 主機板", "socket:lga1700"],
    ["PRO WS W880-ACE SE 主機板", "socket:lga1851"],
    ["A520 主機板", "socket:am4"],
    ["A620 主機板", "socket:am5"],
    ["TRX50 主機板", "socket:str5"],
    ["PRO WS WRX90E-SAGE SE 主機板", "socket:str5"],
  ])("keeps supported motherboard socket parsing for %s", (name, expectedSocket) => {
    expect(extractProductFilterTags(5, name)).toContain(expectedSocket);
  });

  it("keeps WRX80 on sWRX8 when stale filter-sync data reports generic Threadripper", () => {
    const localTags = extractProductFilterTags(5, "華碩 PRO WS WRX80E-SAGE SE WIFI II");

    expect(localTags).toEqual(["socket:swrx8", "chipset:wrx80", "memory_type:ddr4", "wifi:yes"]);
    expect(mergeProductFilterTags(5, localTags, ["socket:str5"])).toEqual(localTags);
  });

  it.each([
    "華擎 H610M-H2/M.2",
    "微星 PRO H610M-E",
  ])("adds DDR4 only for the confirmed H610 motherboard models: %s", (name) => {
    expect(extractProductFilterTags(5, name)).toContain("memory_type:ddr4");
  });

  it("does not infer a memory type for an unspecified H610 model", () => {
    expect(extractProductFilterTags(5, "測試 H610M 主機板")).not.toContain("memory_type:ddr4");
  });

  it("supports the confirmed H81 DDR3 motherboard without inventing a newer memory type", () => {
    expect(extractProductFilterTags(5, "華碩 H81M-K")).toEqual(["chipset:h81", "memory_type:ddr3"]);
  });

  it("exposes the new motherboard and HDD taxonomy with the requested UI labels", () => {
    expect(getFacetOptions(5, "socket").find(({ value }) => value === "swrx8")?.label).toBe(
      "sWRX8 / Threadripper Pro",
    );
    expect(getFacetOptions(5, "form_factor").find(({ value }) => value === "ceb")?.label).toBe(
      "CEB",
    );
    expect(getFacetOptions(5, "memory_type").find(({ value }) => value === "ddr3")?.label).toBe(
      "DDR3",
    );
    expect(getFacetOptions(8, "storage_usage").find(({ value }) => value === "laptop")?.label).toBe(
      "筆電／行動裝置",
    );
  });

  it.each([
    "華碩 Pro WS W790-ACE CEB",
    "華碩 PRO WS TRX50-SAGE WIFI CEB",
    "華碩 Pro WS W890-SAGE CEB",
  ])("extracts CEB without confusing it with EEB: %s", (name) => {
    const tags = extractProductFilterTags(5, name);
    expect(tags).toContain("form_factor:ceb");
    expect(tags).not.toContain("form_factor:eeb");
  });

  it("extracts memory type, capacity, and speed", () => {
    expect(extractProductFilterTags(6, "桌上型 32GB(雙通16GB*2) DDR5 6000/CL30")).toEqual([
      "module_type:desktop",
      "memory_type:ddr5",
      "capacity_gb:32",
      "speed_mhz:6000",
    ]);
  });

  it("extracts decision-useful SSD details", () => {
    expect(extractProductFilterTags(7, "Samsung 990 PRO 2TB M.2 PCIe 4.0 NVMe SSD")).toEqual([
      "form_factor:m2",
      "pcie_generation:gen4",
      "capacity_gb:2000",
      "capacity_bucket:about-2tb",
    ]);
  });

  it.each([
    ["SSD 240G", "240", "240-256"],
    ["SSD 240GB", "240", "240-256"],
    ["SSD 960G", "960", "about-1tb"],
    ["SSD 1024G", "1024", "about-1tb"],
    ["SSD 2048G", "2048", "about-2tb"],
    ["SSD 1024G ~搭機價~", "1024", "about-1tb"],
  ])("keeps the exact SSD capacity and adds its display bucket: %s", (name, exact, bucket) => {
    expect(extractProductFilterTags(7, name)).toEqual([
      `capacity_gb:${exact}`,
      `capacity_bucket:${bucket}`,
    ]);
  });

  it.each([
    ["SSD 256G", "capacity_bucket:240-256"],
    ["SSD 480G", "capacity_bucket:480-512"],
    ["SSD 500G", "capacity_bucket:480-512"],
    ["SSD 512G", "capacity_bucket:480-512"],
    ["SSD 1TB", "capacity_bucket:about-1tb"],
    ["SSD 2TB", "capacity_bucket:about-2tb"],
  ])("maps SSD capacities into stable bucket tags: %s", (name, bucketTag) => {
    expect(extractProductFilterTags(7, name)).toContain(bucketTag);
  });

  it("extracts HDD size, capacity, and usage", () => {
    expect(extractProductFilterTags(8, "Seagate 8TB 3.5吋 NAS碟")).toEqual([
      "form_factor:3-5-inch",
      "capacity_gb:8000",
      "storage_usage:nas",
    ]);
  });

  it.each([
    [
      "三星 2024 EVO Plus 64G micro SDXC / R:160 / 附轉卡",
      ["external_type:memory-card", "capacity_gb:64"],
    ],
    [
      "Lexar High-Performance 633x 64Gmicro SDXC / R:100",
      ["external_type:memory-card", "capacity_gb:64"],
    ],
    [
      "GIGASTONE 256G 格紋碟 / Type-A / USB3.2 G1",
      ["external_type:usb-flash", "connector:type-a", "capacity_gb:256"],
    ],
    [
      "Toshiba 1TB Canvio Advance V10 / Type-A",
      ["external_type:external-hdd", "connector:type-a", "capacity_gb:1000"],
    ],
    [
      "Seagate OneTouch 5T極夜黑 / Type-A / 硬體加密",
      ["external_type:external-hdd", "connector:type-a", "capacity_gb:5000"],
    ],
    [
      "創見 4TB 25M3 / Type-A / 軍規",
      ["external_type:external-hdd", "connector:type-a", "capacity_gb:4000"],
    ],
    [
      "Micron Crucial X10 SSD碟 6TB Type-C",
      ["external_type:external-ssd", "connector:type-c", "capacity_gb:6000"],
    ],
    [
      "威剛 SD820 SSD碟 1TB 藍/讀取2000MB/s/支援iPhone15",
      ["external_type:external-ssd", "connector:type-c", "capacity_gb:1000"],
    ],
  ])("extracts current external-storage naming: %s", (name, expectedTags) => {
    expect(extractProductFilterTags(9, name)).toEqual(expectedTags);
  });

  it("extracts air cooler shape without exposing the unsupported fan-size facet", () => {
    expect(extractProductFilterTags(10, "雙塔 CPU 散熱器 120mm 支援 AM5")).toEqual([
      "cooler_type:air-tower",
    ]);
  });

  it("keeps SSD heatsinks separate from CPU air coolers", () => {
    expect(extractProductFilterTags(10, "M.2 2280 SSD 固態硬碟散熱片/鋁合金")).toEqual([
      "cooler_type:ssd-heatsink",
    ]);
  });

  it("extracts liquid cooling type and radiator size", () => {
    expect(extractProductFilterTags(11, "360mm 一體式水冷 支援 LGA1700")).toEqual([
      "liquid_type:aio",
      "radiator_size_mm:360",
    ]);
  });

  it("extracts common live AIO naming with text between radiator size and water cooling", () => {
    expect(extractProductFilterTags(11, "華碩 Prime LC 360 ARGB 水冷 / 一體式風扇")).toEqual([
      "liquid_type:aio",
      "radiator_size_mm:360",
    ]);
  });

  it("keeps explicit water-cooling components out of the AIO type", () => {
    expect(extractProductFilterTags(11, "開放式水冷 360 冷排")).toEqual([
      "liquid_type:custom",
      "radiator_size_mm:360",
    ]);
    expect(extractProductFilterTags(11, "240mm 水冷排")).toEqual([
      "liquid_type:component",
      "radiator_size_mm:240",
    ]);
  });

  it.each([
    "Noctua 120mm VRM 水冷專用風扇",
    "曜越 T1000 水冷液",
    "銀欣 IceMyst 120mm 水冷頭風扇",
  ])("keeps non-radiator liquid-cooling accessories out of AIO radiator tags: %s", (name) => {
    expect(extractProductFilterTags(11, name)).toEqual(["liquid_type:component"]);
  });

  it("extracts GPU chip, series, and VRAM", () => {
    expect(extractProductFilterTags(12, "NVIDIA GeForce RTX 5070 Ti 16GB")).toEqual([
      "gpu_product_type:graphics-card",
      "gpu_chip:nvidia",
      "gpu_series:rtx-50",
      "vram_gb:16",
    ]);
  });

  it.each([
    "AMD Ryzen TR 9960X盒【24核/48緒】",
    "AMD Ryzen TR PRO 9995WX盒【96核/192緒】",
  ])("recognizes current Ryzen TR naming as Threadripper: %s", (name) => {
    expect(extractProductFilterTags(4, name)).toEqual([
      "socket:str5",
      "cpu_family:threadripper",
      "integrated_graphics:no",
    ]);
  });

  it.each([
    ["Acer Nitro Intel ARC B570 OC 10GB(2690MHz/27cm/雙風扇/註三年)", "10"],
    ["Acer Nitro ARC B580 OC 12GB(2740MHz/28cm/三風扇/註三年)", "12"],
    ["華擎 ARC PRO B70 Creator 32G(2540MHz/27cm/鼓風扇/註冊五年保)", "32"],
  ])("extracts parenthesized Intel Arc VRAM: %s", (name, vramGb) => {
    expect(extractProductFilterTags(12, name)).toEqual([
      "gpu_product_type:graphics-card",
      "gpu_chip:intel",
      "gpu_series:arc",
      `vram_gb:${vramGb}`,
    ]);
  });

  it.each([
    [
      "撼訊 AXR7 240 2GBD5",
      ["gpu_product_type:graphics-card", "gpu_chip:amd", "gpu_series:legacy-radeon", "vram_gb:2"],
    ],
    ["麗臺 N730K", ["gpu_product_type:graphics-card", "gpu_chip:nvidia", "gpu_series:geforce-gt"]],
    ["華碩 N710D3", ["gpu_product_type:graphics-card", "gpu_chip:nvidia", "gpu_series:geforce-gt"]],
    [
      "RTX5060Ti 16G冰魄白",
      ["gpu_product_type:graphics-card", "gpu_chip:nvidia", "gpu_series:rtx-50", "vram_gb:16"],
    ],
  ])("extracts only explicit GPU series and VRAM from confirmed live names: %s", (name, tags) => {
    expect(extractProductFilterTags(12, name)).toEqual(tags);
  });

  it.each([
    "RTX 3050",
    "RTX 3060",
    "外接顯示卡",
  ])("does not infer VRAM when the GPU name omits capacity: %s", (name) => {
    expect(extractProductFilterTags(12, name).some((tag) => tag.startsWith("vram_gb:"))).toBe(
      false,
    );
  });

  it("extracts multiple explicitly supported case form factors", () => {
    const tags = extractProductFilterTags(14, "中塔機殼 支援 E-ATX/M-ATX/背插");
    expect(tags).toEqual([
      "motherboard_support:e-atx",
      "motherboard_support:m-atx",
      "back_connect:yes",
    ]);
    expect(tags).not.toContain("motherboard_support:atx");
  });

  it.each([
    "ITX【SFX】",
    "/ITX",
    "(Mini-ITX)",
    "ITX/ATX",
  ])("accepts punctuation around the ITX form factor: %s", (name) => {
    expect(extractProductFilterTags(14, name)).toContain("motherboard_support:mini-itx");
  });

  it.each([
    "BITX",
    "ITX2",
    "MINI-ITXPRO",
  ])("does not extract ITX from an alphanumeric token: %s", (name) => {
    expect(extractProductFilterTags(14, name)).not.toContain("motherboard_support:mini-itx");
  });

  it("does not invent case support tags for a bundle-only power supply", () => {
    expect(
      extractProductFilterTags(14, "【限搭購喬思伯機殼】全漢 金鋼彈 SFX 750W 電源"),
    ).not.toContain("motherboard_support:mini-itx");
  });

  it("extracts an included PSU when the wattage appears between 內附 and 電源", () => {
    expect(
      extractProductFilterTags(
        14,
        "Mavoly Strawberry M16(黑) 顯卡長20/CPU高7/內附400W電源(1年)/ITX",
      ),
    ).toContain("included_psu:yes");
  });

  it("extracts an explicitly included PSU", () => {
    expect(extractProductFilterTags(14, "中塔機殼/含 500W 電源")).toContain("included_psu:yes");
  });

  it.each([
    "中塔機殼/不含電源",
    "中塔機殼/未含電源",
    "中塔機殼/不包含電源",
    "中塔機殼/內含風扇/不含電源",
    "中塔機殼/不含電源/內附3顆風扇",
  ])("does not infer an included PSU from a negated description: %s", (name) => {
    expect(extractProductFilterTags(14, name)).not.toContain("included_psu:yes");
  });

  it("does not infer an included PSU from bundled fans and a power-supply shroud", () => {
    expect(extractProductFilterTags(14, "中塔機殼/內附3顆風扇/下置電源倉")).not.toContain(
      "included_psu:yes",
    );
  });

  it("recognizes the confirmed ATX support of a GT502 Horizon fan bundle", () => {
    expect(
      extractProductFilterTags(
        14,
        "華碩 TUF Gaming GT502 Horizon(白色)+Prime MR120 ARGB(白)反向扇(三入)+正向(單顆)",
      ),
    ).toEqual(["motherboard_support:atx"]);
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

  it("extracts distinct power supply wattage, efficiency, standards, and modularity", () => {
    expect(
      extractProductFilterTags(15, "850W ATX 3.1 PCIe 5.1 12V-2x6 80PLUS 金牌 全模組"),
    ).toEqual([
      "wattage_range:800-999",
      "efficiency:gold",
      "psu_standard:atx-3",
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

  it("recognizes the confirmed Wonder Tornado model as a 120mm fan", () => {
    expect(
      extractProductFilterTags(16, "Scythe Wonder Tornado 120 ARGB WT1225FD25WARX3-P"),
    ).toEqual(["fan_product_type:fan", "fan_size_mm:120", "lighting:argb"]);
  });

  it("does not give an unknown fan accessory a catch-all type", () => {
    expect(extractProductFilterTags(16, "機殼專用磁吸飾板")).toEqual([]);
  });

  it("classifies an explicitly named lighting kit as an accessory", () => {
    expect(extractProductFilterTags(16, "機殼專用 ARGB 燈效套件")).toEqual([
      "fan_product_type:accessory",
      "lighting:argb",
    ]);
  });

  it("keeps GPU accessories out of chip, series, and VRAM facets", () => {
    expect(extractProductFilterTags(12, "ROG Herculx 顯示卡支撐架 ARGB")).toEqual([
      "gpu_product_type:accessory",
    ]);
  });

  it("extracts current HDD capacities and only explicit consumer series usage", () => {
    expect(extractProductFilterTags(8, "Seagate 30TB【EXOS企業碟】")).toContain(
      "capacity_gb:30000",
    );
    expect(extractProductFilterTags(8, "WD 3TB【藍標】")).toEqual([
      "capacity_gb:3000",
      "storage_usage:desktop",
    ]);
    const laptopTags = extractProductFilterTags(8, "Toshiba 2TB 2.5吋 5400轉 MQ04ABD200【限搭機】");
    expect(laptopTags).toEqual([
      "form_factor:2-5-inch",
      "capacity_gb:2000",
      "storage_usage:laptop",
    ]);
    expect(mergeProductFilterTags(8, laptopTags, ["storage_usage:desktop"])).toEqual(laptopTags);
  });

  it("keeps storage capacities scoped to each category without mutating the shared registry", () => {
    const ssdCapacities = getFacetOptions(7, "capacity_gb").map((option) => option.value);
    const hddCapacities = getFacetOptions(8, "capacity_gb").map((option) => option.value);
    const externalCapacities = getFacetOptions(9, "capacity_gb").map((option) => option.value);

    expect(ssdCapacities).toEqual([
      "128",
      "240",
      "256",
      "480",
      "500",
      "512",
      "960",
      "1000",
      "1024",
      "2000",
      "2048",
      "4000",
      "8000",
    ]);
    expect(ssdCapacities).not.toEqual(
      expect.arrayContaining(["32", "64", "3000", "10000", "32000"]),
    );
    expect(hddCapacities).not.toEqual(
      expect.arrayContaining(["32", "64", "128", "256", "480", "512"]),
    );
    expect(hddCapacities).toEqual(expect.arrayContaining(["500", "5000", "30000", "32000"]));
    expect(externalCapacities).toEqual(
      expect.arrayContaining(["480", "3000", "10000", "26000", "28000", "30000", "32000"]),
    );
    expect(externalCapacities).toHaveLength(26);
  });

  it("publishes SSD buckets instead of exact capacities and can hide empty buckets", () => {
    const publicDefinitions = getPublicProductFacetDefinitions(
      7,
      new Set(["capacity_bucket:240-256", "capacity_bucket:about-1tb"]),
    );

    expect(publicDefinitions.some((definition) => definition.key === "capacity_gb")).toBe(false);
    expect(
      publicDefinitions
        .find((definition) => definition.key === "capacity_bucket")
        ?.options.map((option) => [option.value, option.label]),
    ).toEqual([
      ["240-256", "240–256 GB"],
      ["about-1tb", "約 1 TB"],
    ]);
    expect(
      getProductFacetDefinitions(8).some((definition) => definition.key === "capacity_bucket"),
    ).toBe(false);
    expect(
      getProductFacetDefinitions(9).some((definition) => definition.key === "capacity_bucket"),
    ).toBe(false);
  });

  it("rejects excluded capacity tags and parser matches only in the affected categories", () => {
    expect(isProductFilterTagSupported(7, "capacity_gb:32")).toBe(false);
    expect(isProductFilterTagSupported(7, "capacity_gb:3000")).toBe(false);
    expect(isProductFilterTagSupported(7, "capacity_gb:1024")).toBe(true);
    expect(isProductFilterTagSupported(7, "capacity_bucket:about-1tb")).toBe(true);
    expect(isProductFilterTagSupported(8, "capacity_bucket:about-1tb")).toBe(false);
    expect(isProductFilterTagSupported(9, "capacity_bucket:about-1tb")).toBe(false);
    expect(isProductFilterTagSupported(8, "capacity_gb:480")).toBe(false);
    expect(isProductFilterTagSupported(9, "capacity_gb:480")).toBe(true);
    expect(isProductFilterTagSupported(9, "capacity_gb:3000")).toBe(true);

    expect(extractProductFilterTags(7, "SSD 3TB")).not.toContain("capacity_gb:3000");
    expect(extractProductFilterTags(8, "HDD 480GB")).not.toContain("capacity_gb:480");
    expect(extractProductFilterTags(9, "外接 SSD 480GB Type-C")).toContain("capacity_gb:480");
    expect(extractProductFilterTags(9, "外接 HDD 3TB Type-A")).toContain("capacity_gb:3000");
    expect(extractProductFilterTags(8, "Seagate 5TB 3.5吋")).toContain("capacity_gb:5000");
    expect(mergeProductFilterTags(7, [], ["capacity_gb:3000"])).toEqual([]);
    expect(mergeProductFilterTags(8, [], ["capacity_gb:480"])).toEqual([]);
    expect(mergeProductFilterTags(9, [], ["capacity_gb:3000"])).toEqual(["capacity_gb:3000"]);
  });

  it("keeps semantic option groups contiguous and stable", () => {
    const motherboardDefinitions = getProductFacetDefinitions(5);
    expect(
      motherboardDefinitions.find((definition) => definition.key === "chipset")?.menuColumns,
    ).toBe(3);
    expect(
      motherboardDefinitions.find((definition) => definition.key === "socket"),
    ).not.toHaveProperty("menuColumns");
    expect(motherboardDefinitions.find((definition) => definition.key === "wifi")).toMatchObject({
      key: "wifi",
      label: "無線網路",
      options: [{ value: "yes", label: "含 Wi-Fi" }],
    });
    expect(readGroups(5, "chipset")).toEqual([
      ["Intel LGA 1700", ["h610", "b760", "z790"]],
      ["Intel LGA 1851", ["h810", "b860", "z890"]],
      ["Intel 舊平台／工作站", ["h81", "h110", "h310", "h510", "w680", "w790", "w880", "w890"]],
      ["AMD AM4", ["a520", "b550"]],
      ["AMD AM5", ["a620", "b650", "b650e", "b840", "b850", "x670", "x670e", "x870", "x870e"]],
      ["Threadripper", ["trx50", "wrx80", "wrx90"]],
    ]);
    expect(getFacetOptions(5, "chipset").find(({ value }) => value === "b650e")?.label).toBe(
      "B650E",
    );
    expect(readGroups(6, "speed_mhz")).toEqual([
      ["1600～4000 MHz", ["1600", "2400", "2666", "3200", "3600", "4000"]],
      [
        "4800 MHz 以上",
        ["4800", "5200", "5600", "6000", "6200", "6400", "6800", "7200", "8000", "8400"],
      ],
    ]);
    const speedOptions = getFacetOptions(6, "speed_mhz");
    expect(speedOptions[5]).toMatchObject({ value: "4000", group: "1600～4000 MHz" });
    expect(speedOptions[6]).toMatchObject({ value: "4800", group: "4800 MHz 以上" });
    expect(readGroups(12, "gpu_series").map(([group]) => group)).toEqual([
      "GeForce",
      "Radeon",
      "Intel／專業繪圖",
    ]);
    expect(readGroups(12, "vram_gb").map(([group]) => group)).toEqual([
      "1～6 GB",
      "8～16 GB",
      "20 GB 以上",
    ]);
    expect(readGroups(9, "capacity_gb").map(([group]) => group)).toEqual([
      "GB 容量",
      "1～8 TB",
      "10 TB 以上",
    ]);
    expect(getFacetOptions(4, "socket").every((option) => option.group === undefined)).toBe(true);
  });

  it("uses total kit capacity before per-module capacity", () => {
    expect(extractProductFilterTags(6, 'Biwin 192G("雙通"四根48G*4)D5 6000 CL28')).toEqual([
      "module_type:desktop",
      "memory_type:ddr5",
      "capacity_gb:192",
      "speed_mhz:6000",
    ]);
  });

  it("rejects malformed, unknown, and cross-category tags", () => {
    expect(extractProductFilterTags(999, "AMD R7 9700X")).toEqual([]);
    expect(isProductFilterTagSupported(4, "socket:am5")).toBe(true);
    expect(isProductFilterTagSupported(4, "chipset:b850")).toBe(false);
    expect(isProductFilterTagSupported(4, "socket")).toBe(false);
  });
});

function getFacetOptions(igrp: number, facetKey: string) {
  const definition = getProductFacetDefinitions(igrp).find((facet) => facet.key === facetKey);
  expect(definition).toBeDefined();
  return definition?.options ?? [];
}

function readGroups(igrp: number, facetKey: string): Array<[string, string[]]> {
  const groups: Array<[string, string[]]> = [];

  for (const option of getFacetOptions(igrp, facetKey)) {
    const group = option.group ?? "";
    const previous = groups.at(-1);
    if (previous?.[0] === group) {
      previous[1].push(option.value);
    } else {
      groups.push([group, [option.value]]);
    }
  }

  return groups;
}
