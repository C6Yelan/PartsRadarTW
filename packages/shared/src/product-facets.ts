// packages/shared/src/product-facets.ts
// 定義現有 CoolPC 分類可用的進階篩選，並將商品名稱解析成穩定的站內 filter tags。

export interface ProductFacetOption {
  value: string;
  label: string;
}

export interface ProductFacetDefinition {
  key: string;
  label: string;
  options: readonly ProductFacetOption[];
}

export interface ParsedProductFilterTag {
  key: string;
  value: string;
}

type AddTag = (key: string, value: string) => void;
type MatchRule = readonly [value: string, pattern: RegExp];

export const PRODUCT_FACET_IGRPS = [4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16] as const;

const CAPACITY_OPTIONS = [
  option("32", "32 GB"),
  option("64", "64 GB"),
  option("128", "128 GB"),
  option("256", "256 GB"),
  option("480", "480 GB"),
  option("500", "500 GB"),
  option("512", "512 GB"),
  option("1000", "1 TB"),
  option("2000", "2 TB"),
  option("4000", "4 TB"),
  option("8000", "8 TB"),
  option("10000", "10 TB"),
  option("12000", "12 TB"),
  option("14000", "14 TB"),
  option("16000", "16 TB"),
  option("18000", "18 TB"),
  option("20000", "20 TB"),
  option("22000", "22 TB"),
  option("24000", "24 TB"),
] as const;

const SOCKET_OPTIONS = [
  option("lga1851", "LGA 1851"),
  option("lga1700", "LGA 1700"),
  option("am5", "AM5"),
  option("am4", "AM4"),
  option("str5", "sTR5 / Threadripper"),
] as const;

const PRODUCT_FACETS_BY_IGRP: Readonly<Record<number, readonly ProductFacetDefinition[]>> = {
  4: [
    facet("socket", "腳位", SOCKET_OPTIONS),
    facet("cpu_family", "產品系列", [
      option("core-ultra", "Intel Core Ultra"),
      option("core-i3", "Intel Core i3"),
      option("core-i5", "Intel Core i5"),
      option("core-i7", "Intel Core i7"),
      option("core-i9", "Intel Core i9"),
      option("ryzen-3", "AMD Ryzen 3"),
      option("ryzen-5", "AMD Ryzen 5"),
      option("ryzen-7", "AMD Ryzen 7"),
      option("ryzen-9", "AMD Ryzen 9"),
      option("threadripper", "AMD Threadripper"),
    ]),
    facet("integrated_graphics", "內建顯示", [
      option("yes", "有內顯"),
      option("no", "無內顯"),
    ]),
  ],
  5: [
    facet("socket", "腳位", SOCKET_OPTIONS),
    facet("chipset", "晶片組", [
      option("h610", "H610"),
      option("b760", "B760"),
      option("z790", "Z790"),
      option("h810", "H810"),
      option("b860", "B860"),
      option("z890", "Z890"),
      option("a520", "A520"),
      option("b550", "B550"),
      option("b650", "B650"),
      option("b650e", "B650E"),
      option("b840", "B840"),
      option("b850", "B850"),
      option("x670", "X670"),
      option("x670e", "X670E"),
      option("x870", "X870"),
      option("x870e", "X870E"),
      option("trx50", "TRX50"),
      option("wrx90", "WRX90"),
    ]),
    facet("form_factor", "主機板尺寸", [
      option("e-atx", "E-ATX"),
      option("atx", "ATX"),
      option("m-atx", "M-ATX"),
      option("mini-itx", "Mini-ITX"),
      option("eeb", "EEB"),
    ]),
    facet("memory_type", "記憶體規格", [
      option("ddr4", "DDR4"),
      option("ddr5", "DDR5"),
    ]),
    facet("wifi", "無線網路", [option("yes", "含 Wi-Fi")]),
  ],
  6: [
    facet("module_type", "使用類型", [
      option("desktop", "桌上型"),
      option("laptop", "筆記型"),
      option("server", "伺服器"),
    ]),
    facet("memory_type", "記憶體規格", [
      option("ddr3", "DDR3"),
      option("ddr4", "DDR4"),
      option("ddr5", "DDR5"),
    ]),
    facet("capacity_gb", "總容量", [
      option("8", "8 GB"),
      option("16", "16 GB"),
      option("24", "24 GB"),
      option("32", "32 GB"),
      option("48", "48 GB"),
      option("64", "64 GB"),
      option("96", "96 GB"),
      option("128", "128 GB"),
    ]),
    facet("speed_mhz", "頻率", [
      option("3200", "3200 MHz"),
      option("4800", "4800 MHz"),
      option("5200", "5200 MHz"),
      option("5600", "5600 MHz"),
      option("6000", "6000 MHz"),
      option("6200", "6200 MHz"),
      option("6400", "6400 MHz"),
      option("6800", "6800 MHz"),
      option("7200", "7200 MHz"),
      option("8000", "8000 MHz"),
    ]),
  ],
  7: [
    facet("storage_type", "儲存類型", [
      option("ssd", "SSD"),
      option("hdd", "HDD"),
    ]),
    facet("form_factor", "尺寸", [
      option("m2", "M.2"),
      option("2-5-inch", "2.5 吋"),
      option("3-5-inch", "3.5 吋"),
    ]),
    facet("interface", "介面", [
      option("sata", "SATA"),
      option("pcie", "PCIe"),
      option("nvme", "NVMe"),
    ]),
    facet("pcie_generation", "PCIe 世代", [
      option("gen3", "PCIe 3.0"),
      option("gen4", "PCIe 4.0"),
      option("gen5", "PCIe 5.0"),
    ]),
    facet("capacity_gb", "容量", CAPACITY_OPTIONS),
    facet("storage_usage", "硬碟用途", [
      option("desktop", "一般桌機"),
      option("nas", "NAS"),
      option("surveillance", "監控"),
      option("enterprise", "企業"),
    ]),
  ],
  8: [
    facet("external_type", "商品類型", [
      option("memory-card", "記憶卡"),
      option("usb-flash", "隨身碟"),
      option("external-ssd", "外接 SSD"),
      option("external-hdd", "外接 HDD"),
    ]),
    facet("connector", "接頭", [
      option("type-a", "Type-A"),
      option("type-c", "Type-C"),
    ]),
    facet("capacity_gb", "容量", CAPACITY_OPTIONS),
  ],
  10: [
    facet("cooler_type", "商品類型", [
      option("air-tower", "塔式散熱器"),
      option("top-down", "下吹式散熱器"),
      option("thermal-paste", "散熱膏"),
      option("thermal-pad", "散熱墊"),
      option("laptop-cooler", "筆電散熱"),
      option("other-air", "其他氣冷"),
    ]),
    facet("fan_size_mm", "風扇尺寸", [
      option("80", "80 mm"),
      option("90", "90 mm"),
      option("92", "92 mm"),
      option("120", "120 mm"),
      option("140", "140 mm"),
    ]),
    facet("socket", "明示相容腳位", SOCKET_OPTIONS),
  ],
  11: [
    facet("liquid_type", "水冷類型", [
      option("aio", "一體式水冷"),
      option("custom", "開放式水冷"),
      option("component", "水冷零件"),
    ]),
    facet("radiator_size_mm", "冷排尺寸", [
      option("120", "120 mm"),
      option("240", "240 mm"),
      option("280", "280 mm"),
      option("360", "360 mm"),
      option("420", "420 mm"),
    ]),
    facet("socket", "明示相容腳位", SOCKET_OPTIONS),
  ],
  12: [
    facet("gpu_chip", "GPU 晶片", [
      option("nvidia", "NVIDIA"),
      option("amd", "AMD"),
      option("intel", "Intel"),
    ]),
    facet("gpu_series", "GPU 系列", [
      option("rtx-50", "GeForce RTX 50"),
      option("rtx-40", "GeForce RTX 40"),
      option("rtx-30", "GeForce RTX 30"),
      option("rx-9000", "Radeon RX 9000"),
      option("rx-7000", "Radeon RX 7000"),
      option("rx-6000", "Radeon RX 6000"),
      option("arc", "Intel Arc"),
    ]),
    facet("vram_gb", "顯示記憶體", [
      option("4", "4 GB"),
      option("6", "6 GB"),
      option("8", "8 GB"),
      option("10", "10 GB"),
      option("12", "12 GB"),
      option("16", "16 GB"),
      option("20", "20 GB"),
      option("24", "24 GB"),
      option("32", "32 GB"),
    ]),
  ],
  14: [
    facet("motherboard_support", "支援主機板", [
      option("e-atx", "E-ATX"),
      option("atx", "ATX"),
      option("m-atx", "M-ATX"),
      option("mini-itx", "Mini-ITX"),
      option("eeb", "EEB"),
    ]),
    facet("back_connect", "背插支援", [option("yes", "支援背插")]),
    facet("included_psu", "隨附電源", [option("yes", "含電源")]),
    facet("case_size", "機殼類型", [
      option("full-tower", "全塔"),
      option("mid-tower", "中塔"),
      option("mini-tower", "小型機殼"),
    ]),
  ],
  15: [
    facet("wattage_range", "瓦數", [
      option("under-400", "400W 以下"),
      option("400-599", "400～599W"),
      option("600-799", "600～799W"),
      option("800-999", "800～999W"),
      option("1000-plus", "1000W 以上"),
    ]),
    facet("efficiency", "效率認證", [
      option("bronze", "銅牌"),
      option("silver", "銀牌"),
      option("gold", "金牌"),
      option("platinum", "白金"),
      option("titanium", "鈦金"),
    ]),
    facet("psu_standard", "電源標準", [
      option("atx-3", "ATX 3.x"),
      option("pcie-5", "PCIe 5.x"),
      option("12v-2x6", "12V-2x6"),
    ]),
    facet("modularity", "模組化", [
      option("full", "全模組"),
      option("semi", "半模組"),
    ]),
  ],
  16: [
    facet("fan_product_type", "商品類型", [
      option("fan", "機殼風扇"),
      option("controller", "控制器／Hub"),
      option("cable", "線材"),
      option("bracket", "支架"),
      option("accessory", "其他配件"),
    ]),
    facet("fan_size_mm", "風扇尺寸", [
      option("80", "80 mm"),
      option("90", "90 mm"),
      option("92", "92 mm"),
      option("120", "120 mm"),
      option("140", "140 mm"),
      option("200", "200 mm"),
    ]),
    facet("lighting", "燈效", [
      option("argb", "ARGB"),
      option("rgb", "RGB"),
    ]),
  ],
};

const EMPTY_FACETS: readonly ProductFacetDefinition[] = [];

export function getProductFacetDefinitions(igrp: number): readonly ProductFacetDefinition[] {
  return PRODUCT_FACETS_BY_IGRP[igrp] ?? EMPTY_FACETS;
}

export function parseProductFilterTag(tag: string): ParsedProductFilterTag | null {
  const separatorIndex = tag.indexOf(":");

  if (
    separatorIndex <= 0 ||
    separatorIndex === tag.length - 1 ||
    tag.indexOf(":", separatorIndex + 1) >= 0
  ) {
    return null;
  }

  return {
    key: tag.slice(0, separatorIndex),
    value: tag.slice(separatorIndex + 1),
  };
}

export function isProductFilterTagSupported(igrp: number, tag: string): boolean {
  const parsedTag = parseProductFilterTag(tag);

  if (!parsedTag) {
    return false;
  }

  return getProductFacetDefinitions(igrp).some(
    (definition) =>
      definition.key === parsedTag.key &&
      definition.options.some((candidate) => candidate.value === parsedTag.value),
  );
}

export function extractProductFilterTags(igrp: number, productName: string): string[] {
  const definitions = getProductFacetDefinitions(igrp);

  if (definitions.length === 0 || productName.trim().length === 0) {
    return [];
  }

  const text = productName.normalize("NFKC").toUpperCase();
  const matches = new Set<string>();
  const add: AddTag = (key, value) => {
    const tag = `${key}:${value}`;
    if (isProductFilterTagSupported(igrp, tag)) {
      matches.add(tag);
    }
  };

  switch (igrp) {
    case 4:
      extractCpuTags(text, add);
      break;
    case 5:
      extractMotherboardTags(text, add);
      break;
    case 6:
      extractMemoryTags(text, add);
      break;
    case 7:
      extractStorageTags(text, add);
      break;
    case 8:
      extractExternalStorageTags(text, add);
      break;
    case 10:
      extractCoolerTags(text, add);
      break;
    case 11:
      extractLiquidCoolingTags(text, add);
      break;
    case 12:
      extractGpuTags(text, add);
      break;
    case 14:
      extractCaseTags(text, add);
      break;
    case 15:
      extractPowerSupplyTags(text, add);
      break;
    case 16:
      extractFanAccessoryTags(text, add);
      break;
  }

  return definitions.flatMap((definition) =>
    definition.options
      .map((candidate) => `${definition.key}:${candidate.value}`)
      .filter((tag) => matches.has(tag)),
  );
}

function extractCpuTags(text: string, add: AddTag): void {
  if (/THREADRIPPER/.test(text)) {
    add("socket", "str5");
    add("cpu_family", "threadripper");
  } else if (/CORE\s+ULTRA/.test(text)) {
    add("socket", "lga1851");
    add("cpu_family", "core-ultra");
  } else if (/\bI[3579]-1[234]\d{3}[A-Z]*\b/.test(text)) {
    add("socket", "lga1700");
  } else if (/\b(?:RYZEN\s*)?[R]?[3579]\s*(?:7|8|9)\d{3}[A-Z0-9]*\b/.test(text)) {
    add("socket", "am5");
  } else if (/\b(?:RYZEN\s*)?[R]?[3579]\s*(?:3|4|5)\d{3}[A-Z0-9]*\b/.test(text)) {
    add("socket", "am4");
  }

  addFirstMatch(add, "cpu_family", text, [
    ["core-i3", /\b(?:CORE\s+)?I3\b/],
    ["core-i5", /\b(?:CORE\s+)?I5\b/],
    ["core-i7", /\b(?:CORE\s+)?I7\b/],
    ["core-i9", /\b(?:CORE\s+)?I9\b/],
    ["ryzen-3", /\b(?:RYZEN\s*3|R3)\b/],
    ["ryzen-5", /\b(?:RYZEN\s*5|R5)\b/],
    ["ryzen-7", /\b(?:RYZEN\s*7|R7)\b/],
    ["ryzen-9", /\b(?:RYZEN\s*9|R9)\b/],
  ]);

  if (/無內顯/.test(text)) {
    add("integrated_graphics", "no");
  } else if (/(?:具|有)?內顯|內建顯示/.test(text)) {
    add("integrated_graphics", "yes");
  }
}

function extractMotherboardTags(text: string, add: AddTag): void {
  const chipsetRules: MatchRule[] = [
    ["b650e", /\bB650E\b/],
    ["x670e", /\bX670E\b/],
    ["x870e", /\bX870E\b/],
    ["h610", /\bH610(?:M|I)?\b/],
    ["b760", /\bB760(?:M|I)?\b/],
    ["z790", /\bZ790(?:M|I)?\b/],
    ["h810", /\bH810(?:M|I)?\b/],
    ["b860", /\bB860(?:M|I)?\b/],
    ["z890", /\bZ890(?:M|I)?\b/],
    ["a520", /\bA520(?:M|I)?\b/],
    ["b550", /\bB550(?:M|I)?\b/],
    ["b650", /\bB650(?:M|I)?\b/],
    ["b840", /\bB840(?:M|I)?\b/],
    ["b850", /\bB850(?:M|I)?\b/],
    ["x670", /\bX670\b/],
    ["x870", /\bX870\b/],
    ["trx50", /\bTRX50\b/],
    ["wrx90", /\bWRX90\b/],
  ];
  addFirstMatch(add, "chipset", text, chipsetRules);

  if (/\b(?:H610|B760|Z790)(?:M|I)?\b/.test(text)) {
    add("socket", "lga1700");
  } else if (/\b(?:H810|B860|Z890)(?:M|I)?\b/.test(text)) {
    add("socket", "lga1851");
  } else if (/\b(?:A520|B550)(?:M|I)?\b/.test(text)) {
    add("socket", "am4");
  } else if (
    /\b(?:A620(?:M|I)?|B650(?:M|I)?|B650E|B840(?:M|I)?|B850(?:M|I)?|X670E?|X870E?)\b/.test(
      text,
    )
  ) {
    add("socket", "am5");
  } else if (/\b(?:TRX50|WRX90)\b/.test(text)) {
    add("socket", "str5");
  }

  extractFormFactors(text, add, "form_factor");
  addAllMatches(add, "memory_type", text, [
    ["ddr4", /\bDDR4\b|(?:^|[/\s])D4(?=$|[/\s)])/],
    ["ddr5", /\bDDR5\b|(?:^|[/\s])D5(?=$|[/\s)])/],
  ]);
  if (/\bWI-?FI\b|無線/.test(text)) {
    add("wifi", "yes");
  }
}

function extractMemoryTags(text: string, add: AddTag): void {
  if (/伺服器|\b(?:ECC|RDIMM)\b/.test(text)) {
    add("module_type", "server");
  } else if (/筆記型|\bNOTE\b|\bNB\b|\bSO-?DIMM\b/.test(text)) {
    add("module_type", "laptop");
  } else if (/桌上型|\bU-?DIMM\b/.test(text)) {
    add("module_type", "desktop");
  }

  addAllMatches(add, "memory_type", text, [
    ["ddr3", /\bDDR3\b/],
    ["ddr4", /\bDDR4\b/],
    ["ddr5", /\bDDR5\b/],
  ]);
  addFirstNumberMatch(add, "capacity_gb", text, /(?:^|[^\d])(8|16|24|32|48|64|96|128)\s*G(?:B)?(?=\s|[(/×*]|$)/);
  addFirstNumberMatch(
    add,
    "speed_mhz",
    text,
    /(?:DDR[345][ -]?|D[45]-)(3200|4800|5200|5600|6000|6200|6400|6800|7200|8000)\b/,
  );
}

function extractStorageTags(text: string, add: AddTag): void {
  if (/\bSSD\b|\bNVME\b|M\.?2/.test(text)) {
    add("storage_type", "ssd");
  }
  if (/\bHDD\b|傳統(?:內接)?硬碟|NAS碟|監控碟|企業碟/.test(text)) {
    add("storage_type", "hdd");
  }

  addAllMatches(add, "form_factor", text, [
    ["m2", /M\.?2/],
    ["2-5-inch", /2\.?5\s*(?:吋|INCH)/],
    ["3-5-inch", /3\.?5\s*(?:吋|INCH)/],
  ]);
  addAllMatches(add, "interface", text, [
    ["sata", /\bSATA\b/],
    ["pcie", /\bPCI-?E\b/],
    ["nvme", /\bNVME\b/],
  ]);
  addFirstMatch(add, "pcie_generation", text, [
    ["gen3", /PCI-?E\s*(?:GEN\s*)?3(?:\.0)?/],
    ["gen4", /PCI-?E\s*(?:GEN\s*)?4(?:\.0)?/],
    ["gen5", /PCI-?E\s*(?:GEN\s*)?5(?:\.0)?/],
  ]);
  extractStorageCapacity(text, add);
  addAllMatches(add, "storage_usage", text, [
    ["nas", /\bNAS\b|NAS碟/],
    ["surveillance", /監控/],
    ["enterprise", /企業/],
    ["desktop", /桌機|桌上型|一般碟/],
  ]);
}

function extractExternalStorageTags(text: string, add: AddTag): void {
  if (/記憶卡|\b(?:SD|MICROSD)\b/.test(text)) {
    add("external_type", "memory-card");
  } else if (/隨身碟/.test(text) && !/SSD/.test(text)) {
    add("external_type", "usb-flash");
  } else if (/SSD/.test(text)) {
    add("external_type", "external-ssd");
  } else if (/HDD|外接硬碟|隨身硬碟/.test(text)) {
    add("external_type", "external-hdd");
  }

  addAllMatches(add, "connector", text, [
    ["type-a", /TYPE[ -]?A/],
    ["type-c", /TYPE[ -]?C|USB[ -]?C/],
  ]);
  extractStorageCapacity(text, add);
}

function extractCoolerTags(text: string, add: AddTag): void {
  if (/散熱膏/.test(text)) {
    add("cooler_type", "thermal-paste");
  } else if (/散熱墊|導熱墊/.test(text)) {
    add("cooler_type", "thermal-pad");
  } else if (/筆電.*散熱|散熱.*筆電/.test(text)) {
    add("cooler_type", "laptop-cooler");
  } else if (/下吹/.test(text)) {
    add("cooler_type", "top-down");
  } else if (/塔散|塔式|單塔|雙塔/.test(text)) {
    add("cooler_type", "air-tower");
  } else if (/散熱器|CPU.*風扇/.test(text)) {
    add("cooler_type", "other-air");
  }

  extractFanSize(text, add);
  extractExplicitSockets(text, add);
}

function extractLiquidCoolingTags(text: string, add: AddTag): void {
  if (/一體式|AIO|封閉式/.test(text)) {
    add("liquid_type", "aio");
  } else if (/開放式/.test(text)) {
    add("liquid_type", "custom");
  } else if (/水冷頭|水泵|冷排|水箱|接頭|水冷管/.test(text)) {
    add("liquid_type", "component");
  }

  addFirstNumberMatch(add, "radiator_size_mm", text, /(?:^|[^\d])(120|240|280|360|420)\s*(?:MM|水冷|冷排)/);
  extractExplicitSockets(text, add);
}

function extractGpuTags(text: string, add: AddTag): void {
  if (/\b(?:RTX|GTX)\s*\d|NVIDIA/.test(text)) {
    add("gpu_chip", "nvidia");
  } else if (/\bRX\s*\d|RADEON/.test(text)) {
    add("gpu_chip", "amd");
  } else if (/\bARC\s*[AB]?\d|INTEL\s+ARC/.test(text)) {
    add("gpu_chip", "intel");
  }

  addFirstMatch(add, "gpu_series", text, [
    ["rtx-50", /\bRTX\s*50\d{2}/],
    ["rtx-40", /\bRTX\s*40\d{2}/],
    ["rtx-30", /\bRTX\s*30\d{2}/],
    ["rx-9000", /\bRX\s*9\d{3}/],
    ["rx-7000", /\bRX\s*7\d{3}/],
    ["rx-6000", /\bRX\s*6\d{3}/],
    ["arc", /\bARC\s*[AB]?\d|INTEL\s+ARC/],
  ]);
  addFirstNumberMatch(add, "vram_gb", text, /(?:^|[/\s])(4|6|8|10|12|16|20|24|32)\s*G(?:B)?(?=$|[/\s),])/);
}

function extractCaseTags(text: string, add: AddTag): void {
  extractFormFactors(text, add, "motherboard_support");
  if (/背插/.test(text)) {
    add("back_connect", "yes");
  }
  if (/含.*(?:電源|POWER)|(?:電源|POWER).*內附/.test(text)) {
    add("included_psu", "yes");
  }
  addFirstMatch(add, "case_size", text, [
    ["full-tower", /全塔/],
    ["mid-tower", /中塔/],
    ["mini-tower", /小型機殼|迷你機殼|MINI\s*TOWER/],
  ]);
}

function extractPowerSupplyTags(text: string, add: AddTag): void {
  const wattageMatch = text.match(/(?:^|[^\d])(\d{3,4})\s*W\b/);
  if (wattageMatch?.[1]) {
    const wattage = Number(wattageMatch[1]);
    add(
      "wattage_range",
      wattage < 400
        ? "under-400"
        : wattage < 600
          ? "400-599"
          : wattage < 800
            ? "600-799"
            : wattage < 1000
              ? "800-999"
              : "1000-plus",
    );
  }

  addFirstMatch(add, "efficiency", text, [
    ["bronze", /銅牌|80\s*(?:PLUS|\+)\s*BRONZE/],
    ["silver", /銀牌|80\s*(?:PLUS|\+)\s*SILVER/],
    ["gold", /金牌|80\s*(?:PLUS|\+)\s*GOLD/],
    ["platinum", /白金|80\s*(?:PLUS|\+)\s*PLATINUM/],
    ["titanium", /鈦金|80\s*(?:PLUS|\+)\s*TITANIUM/],
  ]);
  addAllMatches(add, "psu_standard", text, [
    ["atx-3", /ATX\s*3(?:\.\d)?/],
    ["pcie-5", /PCI-?E\s*5(?:\.\d)?/],
    ["12v-2x6", /12V-?2X6/],
  ]);
  addFirstMatch(add, "modularity", text, [
    ["full", /全模組|FULLY\s+MODULAR/],
    ["semi", /半模組|SEMI[- ]MODULAR/],
  ]);
}

function extractFanAccessoryTags(text: string, add: AddTag): void {
  if (/控制器|HUB/.test(text)) {
    add("fan_product_type", "controller");
  } else if (/線材|延長線|轉接線|CABLE/.test(text)) {
    add("fan_product_type", "cable");
  } else if (/支架|BRACKET/.test(text)) {
    add("fan_product_type", "bracket");
  } else if (/風扇|\bFAN\b/.test(text)) {
    add("fan_product_type", "fan");
  } else {
    add("fan_product_type", "accessory");
  }

  extractFanSize(text, add);
  if (/\bARGB\b/.test(text)) {
    add("lighting", "argb");
  } else if (/\bRGB\b/.test(text)) {
    add("lighting", "rgb");
  }
}

function extractFormFactors(text: string, add: AddTag, key: string): void {
  addAllMatches(add, key, text, [
    ["e-atx", /(?:^|[(/,\s])E-?ATX(?=$|[/),\s])/],
    ["atx", /(?:^|[(/,\s])ATX(?=$|[/),\s])/],
    ["m-atx", /(?:^|[(/,\s])(?:M-?ATX|MICRO\s*ATX)(?=$|[/),\s])/],
    ["mini-itx", /MINI-?ITX|(?:^|[(/,\s])ITX(?=$|[/),\s])/],
    ["eeb", /(?:^|[(/,\s])EEB(?=$|[/),\s])/],
  ]);
}

function extractExplicitSockets(text: string, add: AddTag): void {
  addAllMatches(add, "socket", text, [
    ["lga1851", /(?:LGA\s*)?1851/],
    ["lga1700", /(?:LGA\s*)?1700/],
    ["am5", /\bAM5\b/],
    ["am4", /\bAM4\b/],
    ["str5", /\bSTR5\b|THREADRIPPER/],
  ]);
}

function extractFanSize(text: string, add: AddTag): void {
  addFirstNumberMatch(add, "fan_size_mm", text, /(?:^|[^\d])(80|90|92|120|140|200)\s*(?:MM|公厘)/);
  if (/\b12\s*CM\b/.test(text)) {
    add("fan_size_mm", "120");
  } else if (/\b14\s*CM\b/.test(text)) {
    add("fan_size_mm", "140");
  }
}

function extractStorageCapacity(text: string, add: AddTag): void {
  const terabyteMatch = text.match(/(?:^|[^\d])(1|2|4|8|10|12|14|16|18|20|22|24)\s*T(?:B)?\b/);
  if (terabyteMatch?.[1]) {
    add("capacity_gb", String(Number(terabyteMatch[1]) * 1000));
    return;
  }

  addFirstNumberMatch(add, "capacity_gb", text, /(?:^|[^\d])(32|64|128|256|480|500|512)\s*G(?:B)?\b/);
}

function addAllMatches(
  add: AddTag,
  key: string,
  text: string,
  rules: readonly MatchRule[],
): void {
  for (const [value, pattern] of rules) {
    if (pattern.test(text)) {
      add(key, value);
    }
  }
}

function addFirstMatch(
  add: AddTag,
  key: string,
  text: string,
  rules: readonly MatchRule[],
): void {
  for (const [value, pattern] of rules) {
    if (pattern.test(text)) {
      add(key, value);
      return;
    }
  }
}

function addFirstNumberMatch(add: AddTag, key: string, text: string, pattern: RegExp): void {
  const match = text.match(pattern);
  if (match?.[1]) {
    add(key, match[1]);
  }
}

function option(value: string, label: string): ProductFacetOption {
  return { value, label };
}

function facet(
  key: string,
  label: string,
  options: readonly ProductFacetOption[],
): ProductFacetDefinition {
  return { key, label, options };
}
