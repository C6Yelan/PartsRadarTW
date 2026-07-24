// packages/shared/src/product-facets/registry.ts
// 集中管理 product facets 的型別、定義、驗證與穩定排序。

export interface ProductFacetOption {
  value: string;
  label: string;
  group?: string;
}

export interface ProductFacetDefinition {
  key: string;
  label: string;
  options: readonly ProductFacetOption[];
  menuColumns?: 1 | 2 | 3;
}

export interface ParsedProductFilterTag {
  key: string;
  value: string;
}

export const PRODUCT_FACET_IGRPS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16] as const;

const CAPACITY_OPTIONS = [
  option("32", "32 GB", "GB 容量"),
  option("64", "64 GB", "GB 容量"),
  option("128", "128 GB", "GB 容量"),
  option("256", "256 GB", "GB 容量"),
  option("480", "480 GB", "GB 容量"),
  option("500", "500 GB", "GB 容量"),
  option("512", "512 GB", "GB 容量"),
  option("1000", "1 TB", "1～8 TB"),
  option("2000", "2 TB", "1～8 TB"),
  option("3000", "3 TB", "1～8 TB"),
  option("4000", "4 TB", "1～8 TB"),
  option("5000", "5 TB", "1～8 TB"),
  option("6000", "6 TB", "1～8 TB"),
  option("8000", "8 TB", "1～8 TB"),
  option("10000", "10 TB", "10 TB 以上"),
  option("12000", "12 TB", "10 TB 以上"),
  option("14000", "14 TB", "10 TB 以上"),
  option("16000", "16 TB", "10 TB 以上"),
  option("18000", "18 TB", "10 TB 以上"),
  option("20000", "20 TB", "10 TB 以上"),
  option("22000", "22 TB", "10 TB 以上"),
  option("24000", "24 TB", "10 TB 以上"),
  option("26000", "26 TB", "10 TB 以上"),
  option("28000", "28 TB", "10 TB 以上"),
  option("30000", "30 TB", "10 TB 以上"),
] as const;

const SSD_CAPACITY_OPTIONS = [
  option("128", "128 GB"),
  option("240", "240 GB"),
  option("256", "256 GB"),
  option("480", "480 GB"),
  option("500", "500 GB"),
  option("512", "512 GB"),
  option("960", "960 GB"),
  option("1000", "1 TB"),
  option("1024", "1024 GB"),
  option("2000", "2 TB"),
  option("2048", "2048 GB"),
  option("4000", "4 TB"),
  option("8000", "8 TB"),
] as const;

const SSD_CAPACITY_BUCKET_OPTIONS = [
  option("128", "128 GB"),
  option("240-256", "240–256 GB"),
  option("480-512", "480–512 GB"),
  option("about-1tb", "約 1 TB"),
  option("about-2tb", "約 2 TB"),
  option("4000", "4 TB"),
  option("8000", "8 TB"),
] as const;

const CAPACITY_EXCLUSIONS_BY_IGRP: Readonly<Record<number, ReadonlySet<string>>> = {
  8: new Set(["32", "64", "128", "256", "480", "512"]),
  9: new Set(),
};

const SOCKET_OPTIONS = [
  option("lga1851", "LGA 1851"),
  option("lga1700", "LGA 1700"),
  option("am5", "AM5"),
  option("am4", "AM4"),
  option("str5", "sTR5 / Threadripper"),
] as const;

const CPU_SOCKET_OPTIONS = [option("lga4677", "LGA 4677"), ...SOCKET_OPTIONS] as const;

const PRODUCT_FACETS_BY_IGRP: Readonly<Record<number, readonly ProductFacetDefinition[]>> = {
  4: [
    facet("socket", "腳位", CPU_SOCKET_OPTIONS),
    facet("cpu_family", "產品系列", [
      option("xeon-w", "Intel Xeon W"),
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
    facet("integrated_graphics", "內建顯示", [option("yes", "有內顯"), option("no", "無內顯")]),
  ],
  5: [
    facet("socket", "腳位", SOCKET_OPTIONS),
    facet(
      "chipset",
      "晶片組",
      [
        option("h610", "H610", "Intel LGA 1700"),
        option("b760", "B760", "Intel LGA 1700"),
        option("z790", "Z790", "Intel LGA 1700"),
        option("h810", "H810", "Intel LGA 1851"),
        option("b860", "B860", "Intel LGA 1851"),
        option("z890", "Z890", "Intel LGA 1851"),
        option("h81", "H81", "Intel 舊平台／工作站"),
        option("h110", "H110", "Intel 舊平台／工作站"),
        option("h310", "H310", "Intel 舊平台／工作站"),
        option("h510", "H510", "Intel 舊平台／工作站"),
        option("w680", "W680", "Intel 舊平台／工作站"),
        option("w790", "W790", "Intel 舊平台／工作站"),
        option("w880", "W880", "Intel 舊平台／工作站"),
        option("w890", "W890", "Intel 舊平台／工作站"),
        option("a520", "A520", "AMD AM4"),
        option("b550", "B550", "AMD AM4"),
        option("a620", "A620", "AMD AM5"),
        option("b650", "B650", "AMD AM5"),
        option("b650e", "B650E", "AMD AM5"),
        option("b840", "B840", "AMD AM5"),
        option("b850", "B850", "AMD AM5"),
        option("x670", "X670", "AMD AM5"),
        option("x670e", "X670E", "AMD AM5"),
        option("x870", "X870", "AMD AM5"),
        option("x870e", "X870E", "AMD AM5"),
        option("trx50", "TRX50", "Threadripper"),
        option("wrx90", "WRX90", "Threadripper"),
      ],
      3,
    ),
    facet("form_factor", "主機板尺寸", [
      option("e-atx", "E-ATX"),
      option("atx", "ATX"),
      option("m-atx", "M-ATX"),
      option("mini-itx", "Mini-ITX"),
      option("eeb", "EEB"),
    ]),
    facet("memory_type", "記憶體規格", [option("ddr4", "DDR4"), option("ddr5", "DDR5")]),
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
      option("192", "192 GB"),
      option("256", "256 GB"),
    ]),
    facet("speed_mhz", "頻率", [
      option("1600", "1600 MHz", "1600～4000 MHz"),
      option("2400", "2400 MHz", "1600～4000 MHz"),
      option("2666", "2666 MHz", "1600～4000 MHz"),
      option("3200", "3200 MHz", "1600～4000 MHz"),
      option("3600", "3600 MHz", "1600～4000 MHz"),
      option("4000", "4000 MHz", "1600～4000 MHz"),
      option("4800", "4800 MHz", "4800 MHz 以上"),
      option("5200", "5200 MHz", "4800 MHz 以上"),
      option("5600", "5600 MHz", "4800 MHz 以上"),
      option("6000", "6000 MHz", "4800 MHz 以上"),
      option("6200", "6200 MHz", "4800 MHz 以上"),
      option("6400", "6400 MHz", "4800 MHz 以上"),
      option("6800", "6800 MHz", "4800 MHz 以上"),
      option("7200", "7200 MHz", "4800 MHz 以上"),
      option("8000", "8000 MHz", "4800 MHz 以上"),
      option("8400", "8400 MHz", "4800 MHz 以上"),
    ]),
  ],
  7: [
    facet("form_factor", "尺寸", [option("m2", "M.2"), option("2-5-inch", "2.5 吋")]),
    facet("pcie_generation", "PCIe 世代", [
      option("gen3", "PCIe 3.0"),
      option("gen4", "PCIe 4.0"),
      option("gen5", "PCIe 5.0"),
    ]),
    facet("capacity_gb", "標稱容量", SSD_CAPACITY_OPTIONS),
    facet("capacity_bucket", "容量", SSD_CAPACITY_BUCKET_OPTIONS),
  ],
  8: [
    facet("form_factor", "尺寸", [option("2-5-inch", "2.5 吋"), option("3-5-inch", "3.5 吋")]),
    facet("capacity_gb", "容量", getCapacityOptionsForIgrp(8)),
    facet("storage_usage", "硬碟用途", [
      option("desktop", "一般桌機"),
      option("nas", "NAS"),
      option("surveillance", "監控"),
      option("enterprise", "企業"),
    ]),
  ],
  9: [
    facet("external_type", "商品類型", [
      option("memory-card", "記憶卡"),
      option("usb-flash", "隨身碟"),
      option("external-ssd", "外接 SSD"),
      option("external-hdd", "外接 HDD"),
    ]),
    facet("connector", "接頭", [option("type-a", "Type-A"), option("type-c", "Type-C")]),
    facet("capacity_gb", "容量", getCapacityOptionsForIgrp(9)),
  ],
  10: [
    facet("cooler_type", "商品類型", [
      option("air-tower", "塔式散熱器"),
      option("top-down", "下吹式散熱器"),
      option("thermal-paste", "散熱膏"),
      option("thermal-pad", "散熱墊"),
      option("ssd-heatsink", "SSD 散熱"),
      option("mounting-kit", "安裝扣具"),
      option("laptop-cooler", "筆電散熱"),
      option("other-air", "其他氣冷"),
    ]),
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
  ],
  12: [
    facet("gpu_product_type", "商品類型", [
      option("graphics-card", "顯示卡"),
      option("accessory", "顯卡配件"),
    ]),
    facet("gpu_chip", "GPU 晶片", [
      option("nvidia", "NVIDIA"),
      option("amd", "AMD"),
      option("intel", "Intel"),
    ]),
    facet("gpu_series", "GPU 系列", [
      option("rtx-50", "GeForce RTX 50", "GeForce"),
      option("rtx-40", "GeForce RTX 40", "GeForce"),
      option("rtx-30", "GeForce RTX 30", "GeForce"),
      option("geforce-gt", "GeForce GT", "GeForce"),
      option("rx-9000", "Radeon RX 9000", "Radeon"),
      option("rx-7000", "Radeon RX 7000", "Radeon"),
      option("rx-6000", "Radeon RX 6000", "Radeon"),
      option("arc", "Intel Arc", "Intel／專業繪圖"),
      option("professional", "專業繪圖卡", "Intel／專業繪圖"),
      option("legacy-radeon", "舊款 Radeon", "Intel／專業繪圖"),
    ]),
    facet("vram_gb", "顯示記憶體", [
      option("1", "1 GB", "1～6 GB"),
      option("2", "2 GB", "1～6 GB"),
      option("4", "4 GB", "1～6 GB"),
      option("6", "6 GB", "1～6 GB"),
      option("8", "8 GB", "8～16 GB"),
      option("10", "10 GB", "8～16 GB"),
      option("12", "12 GB", "8～16 GB"),
      option("16", "16 GB", "8～16 GB"),
      option("20", "20 GB", "20 GB 以上"),
      option("24", "24 GB", "20 GB 以上"),
      option("32", "32 GB", "20 GB 以上"),
      option("48", "48 GB", "20 GB 以上"),
      option("72", "72 GB", "20 GB 以上"),
      option("96", "96 GB", "20 GB 以上"),
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
  ],
  15: [
    facet("wattage_range", "瓦數", [
      option("under-400", "399W 以下"),
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
    facet("psu_standard", "電源標準", [option("atx-3", "ATX 3.x"), option("12v-2x6", "12V-2x6")]),
    facet("modularity", "模組化", [option("full", "全模組"), option("semi", "半模組")]),
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
    facet("lighting", "燈效", [option("argb", "ARGB"), option("rgb", "RGB")]),
  ],
};

const EMPTY_FACETS: readonly ProductFacetDefinition[] = [];

export function getProductFacetDefinitions(igrp: number): readonly ProductFacetDefinition[] {
  return PRODUCT_FACETS_BY_IGRP[igrp] ?? EMPTY_FACETS;
}

export function getPublicProductFacetDefinitions(
  igrp: number,
  availableTags?: ReadonlySet<string>,
): readonly ProductFacetDefinition[] {
  return getProductFacetDefinitions(igrp).flatMap((definition) => {
    if (igrp === 7 && definition.key === "capacity_gb") {
      return [];
    }
    if (igrp !== 7 || definition.key !== "capacity_bucket" || !availableTags) {
      return [definition];
    }

    const options = definition.options.filter((option) =>
      availableTags.has(`${definition.key}:${option.value}`),
    );
    return options.length > 0 ? [{ ...definition, options }] : [];
  });
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

export function mergeProductFilterTags(
  igrp: number,
  localTags: readonly string[],
  sourceTags: readonly string[],
): string[] {
  const sourceFacetKeys = new Set(sourceTags.map(readFacetKey));
  const selected = new Set([
    ...localTags.filter((tag) => !sourceFacetKeys.has(readFacetKey(tag))),
    ...sourceTags,
  ]);

  return getProductFacetDefinitions(igrp).flatMap((definition) =>
    definition.options
      .map((candidate) => `${definition.key}:${candidate.value}`)
      .filter((tag) => selected.has(tag)),
  );
}

function readFacetKey(tag: string): string {
  return tag.slice(0, tag.indexOf(":"));
}

function getCapacityOptionsForIgrp(igrp: number): readonly ProductFacetOption[] {
  const exclusions = CAPACITY_EXCLUSIONS_BY_IGRP[igrp] ?? new Set<string>();
  return CAPACITY_OPTIONS.filter((capacity) => !exclusions.has(capacity.value));
}

function option(value: string, label: string, group?: string): ProductFacetOption {
  return group ? { value, label, group } : { value, label };
}

function facet(
  key: string,
  label: string,
  options: readonly ProductFacetOption[],
  menuColumns?: 1 | 2 | 3,
): ProductFacetDefinition {
  return menuColumns ? { key, label, options, menuColumns } : { key, label, options };
}
