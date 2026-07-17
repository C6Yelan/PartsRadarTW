// packages/shared/src/product-facets/extraction.ts
// 將商品名稱解析成由 registry 驗證並排序的站內 filter tags。

import { getProductFacetDefinitions, isProductFilterTagSupported } from "./registry";

type AddTag = (key: string, value: string) => void;
type MatchRule = readonly [value: string, pattern: RegExp];

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
      extractStorageTags(text, add);
      break;
    case 9:
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
  if (/THREADRIPPER|\bRYZEN\s+TR(?:\s+PRO)?\s+99\d{2}(?:WX|X)\b/.test(text)) {
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

  if (/無內顯/.test(text) || hasKnownCpuWithoutIntegratedGraphics(text)) {
    add("integrated_graphics", "no");
  } else if (/(?:具|有)?內顯|內建顯示/.test(text) || hasKnownCpuWithIntegratedGraphics(text)) {
    add("integrated_graphics", "yes");
  }
}

function hasKnownCpuWithoutIntegratedGraphics(text: string): boolean {
  if (/THREADRIPPER|RYZEN\s+TR\b/.test(text)) {
    return true;
  }

  if (/\bI[3579]-\d{4,5}(?:KF|F)\b|\bCORE\s+ULTRA\s+[3579]\s+\d{3}(?:KF|F)\b/.test(text)) {
    return true;
  }

  const amdModel = text.match(/\b(?:RYZEN\s*)?R?[3579]\s*([345789]\d{3})([A-Z0-9]*)\b/);
  if (!amdModel) {
    return false;
  }

  const generation = amdModel[1]?.[0];
  const suffix = amdModel[2] ?? "";
  if (suffix.includes("G")) {
    return false;
  }
  return suffix.includes("F") || generation === "3" || generation === "4" || generation === "5";
}

function hasKnownCpuWithIntegratedGraphics(text: string): boolean {
  if (/\bI[3579]-\d{4,5}[A-Z]*\b|\bCORE\s+ULTRA\s+[3579]\s+\d{3}[A-Z]*\b/.test(text)) {
    return true;
  }

  const amdModel = text.match(/\b(?:RYZEN\s*)?R?[3579]\s*([345789]\d{3})([A-Z0-9]*)\b/);
  if (!amdModel) {
    return false;
  }

  const generation = amdModel[1]?.[0];
  const suffix = amdModel[2] ?? "";
  return suffix.includes("G") || generation === "7" || generation === "8" || generation === "9";
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
    ["b860", /\bB860/],
    ["z890", /\bZ890(?:M|I)?\b/],
    ["h81", /\bH81/],
    ["h110", /\bH110/],
    ["h310", /\bH310/],
    ["h510", /\bH510/],
    ["w680", /\bW680/],
    ["w790", /\bW790/],
    ["w880", /\bW880/],
    ["w890", /\bW890/],
    ["a520", /\bA520(?:M|I)?\b/],
    ["a620", /\bA620/],
    ["b550", /\bB550(?:M|I)?\b/],
    ["b650", /\bB650(?:M|I)?\b/],
    ["b840", /\bB840(?:M|I)?\b/],
    ["b850", /\bB850/],
    ["x670", /\bX670\b/],
    ["x870", /\bX870(?!E)/],
    ["trx50", /\bTRX50\b/],
    ["wrx90", /\bWRX90(?:E)?\b/],
  ];
  addFirstMatch(add, "chipset", text, chipsetRules);

  if (/\b(?:H610|B760|Z790|W680)/.test(text)) {
    add("socket", "lga1700");
  } else if (/\b(?:H810|B860|Z890|W880)/.test(text)) {
    add("socket", "lga1851");
  } else if (/\b(?:A520|B550)(?:M|I)?\b/.test(text)) {
    add("socket", "am4");
  } else if (/\b(?:A620|B650|B840|B850|X670|X870)/.test(text)) {
    add("socket", "am5");
  } else if (/\b(?:TRX50|WRX90)(?:E)?\b/.test(text)) {
    add("socket", "str5");
  }

  extractFormFactors(text, add, "form_factor");
  addAllMatches(add, "memory_type", text, [
    ["ddr4", /\bDDR4\b|(?:^|[^A-Z0-9])D4(?=$|[^A-Z0-9])/],
    ["ddr5", /\bDDR5\b|(?:^|[^A-Z0-9])D5(?=$|[^A-Z0-9])/],
  ]);
  if (/\b(?:A520|B550)/.test(text)) {
    add("memory_type", "ddr4");
  } else if (
    /\b(?:A620|B650|B840|B850|X670|X870|H810|B860|Z890|W790|W880|W890|TRX50|WRX90)/.test(text)
  ) {
    add("memory_type", "ddr5");
  } else if (/\b(?:H110|H310|H510|WRX80)/.test(text)) {
    add("memory_type", "ddr4");
  } else if (/\bPRO\s+WS\s+W680/.test(text)) {
    add("memory_type", "ddr5");
  } else if (/\b(?:B760|Z790)/.test(text) && !/\bD4\b|COMBO/.test(text)) {
    add("memory_type", "ddr5");
  }
  if (/\bWI-?FI\b|無線/.test(text)) {
    add("wifi", "yes");
  }
}

function extractMemoryTags(text: string, add: AddTag): void {
  if (/伺服器|\b(?:ECC|RDIMM)\b/.test(text)) {
    add("module_type", "server");
  } else if (/筆記型|\bNOTE\b|\bNB\b|\bSO-?DIMM\b/.test(text)) {
    add("module_type", "laptop");
  } else if (/桌上型|\bU-?DIMM\b|單條|雙通|\bCL\d+\b/.test(text)) {
    add("module_type", "desktop");
  }

  addAllMatches(add, "memory_type", text, [
    ["ddr3", /\b(?:DDR3|D3)\b/],
    ["ddr4", /\b(?:DDR4|D4)\b/],
    ["ddr5", /\b(?:DDR5|D5)\b/],
  ]);
  addFirstNumberMatch(
    add,
    "capacity_gb",
    text,
    /(?:^|[^\d])(8|16|24|32|48|64|96|128|192|256)\s*G(?:B)?(?=\s|[(/×*"“]|$)/,
  );
  addFirstNumberMatch(
    add,
    "speed_mhz",
    text,
    /(?:DDR[345]L?|D[45])[ -]?(1600|2400|2666|3200|3600|4000|4800|5200|5600|6000|6200|6400|6800|7200|8000|8400)\b/,
  );
  addFirstNumberMatch(
    add,
    "speed_mhz",
    text,
    /(?:^|[^\d])(1600|2400|2666|3200|3600|4000|4800|5200|5600|6000|6200|6400|6800|7200|8000|8400)\s*(?:MHZ|MT\/S)/,
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
    ["nas", /\bNAS\b|NAS碟|那嘶狼|【紅標(?:PLUS|PRO)?】/],
    ["surveillance", /監控|【紫標(?:PRO)?】/],
    ["enterprise", /企業|ULTRASTAR|【金標】/],
    ["desktop", /桌機|桌上型|一般碟|【[PX]300系列】/],
  ]);
  if (/【(?:藍標|新梭魚)】/.test(text)) {
    add("storage_usage", "desktop");
  }
}

function extractExternalStorageTags(text: string, add: AddTag): void {
  if (/記憶卡|\b(?:SD(?:HC|XC)?|MICRO\s*SD(?:HC|XC)?)\b/.test(text)) {
    add("external_type", "memory-card");
  } else if (/隨身碟|格紋碟/.test(text) && !/SSD/.test(text)) {
    add("external_type", "usb-flash");
  } else if (/SSD/.test(text)) {
    add("external_type", "external-ssd");
  } else if (
    /HDD|外接硬碟|隨身硬碟|\bCANVIO\b|\b(?:EXPANSION|ONETOUCH)\b|\b25(?:A3|M3|H3)\b/.test(text)
  ) {
    add("external_type", "external-hdd");
  }

  addAllMatches(add, "connector", text, [
    ["type-a", /TYPE[ -]?A/],
    ["type-c", /TYPE[ -]?C|USB[ -]?C|\bSD820\b/],
  ]);
  extractStorageCapacity(text, add);
}

function extractCoolerTags(text: string, add: AddTag): void {
  if (/(?:M\.?2|SSD).*散熱|散熱.*(?:M\.?2|SSD)/.test(text)) {
    add("cooler_type", "ssd-heatsink");
  } else if (/扣具/.test(text)) {
    add("cooler_type", "mounting-kit");
  } else if (/散熱膏|金屬膏|道康膏|涼膏/.test(text)) {
    add("cooler_type", "thermal-paste");
  } else if (/散熱墊|導熱墊|導熱片|THERMAL\s+PAD/.test(text)) {
    add("cooler_type", "thermal-pad");
  } else if (/筆電.*散熱|散熱.*筆電|NOTEPAL|風扇.*筆電支架/.test(text)) {
    add("cooler_type", "laptop-cooler");
  } else if (/下吹/.test(text)) {
    add("cooler_type", "top-down");
  } else if (/塔散|塔式|單塔|雙塔|(?:\d+導管.*(?:TDP|高|高度|風扇))|FROZN\s+A\d+/.test(text)) {
    add("cooler_type", "air-tower");
  } else if (/散熱器|CPU.*風扇|網通設備.*散熱架/.test(text)) {
    add("cooler_type", "other-air");
  }

  extractExplicitSockets(text, add);
}

function extractLiquidCoolingTags(text: string, add: AddTag): void {
  if (/開放式/.test(text)) {
    add("liquid_type", "custom");
  } else if (/水冷(?:頭|泵|排|箱|接頭|管|液)|水泵|冷排|水箱|止水栓|流量計/.test(text)) {
    add("liquid_type", "component");
  } else if (
    /一體式|AIO|封閉式|水冷|\b(?:PANORAMA|HYPERFLOW|NANCOOL|TUF\s+GAMING\s+LC|ROG\s+(?:STRIX\s+(?:LC|SLC(?:\s+IV)?)|SLC(?:\s+IV)?|RYUO)|LC\s+III|CORELIQUID|AQUAFUSION|FROZEN\s+WARFRAME|GRAND\s+VISION|HYDROSHIFT|WATERFORCE)\b|ASETEK/.test(
      text,
    )
  ) {
    add("liquid_type", "aio");
  }

  addFirstNumberMatch(add, "radiator_size_mm", text, /(?:^|[^\d])(120|240|280|360|420)(?=[^\d]|$)/);
  extractExplicitSockets(text, add);
}

function extractGpuTags(text: string, add: AddTag): void {
  if (/支撐架|顯卡支架|VGA\s+HOLDER/.test(text)) {
    add("gpu_product_type", "accessory");
    return;
  }
  add("gpu_product_type", "graphics-card");

  if (/\b(?:RTX|GTX|GT)\s*\d|NVIDIA|\bN(?:210|710|730)/.test(text)) {
    add("gpu_chip", "nvidia");
  } else if (/\bRX\s*\d|RADEON|(?:\bR7|AXR7)\s*240\b|AI\s+PRO\s+R\d/.test(text)) {
    add("gpu_chip", "amd");
  } else if (/\bARC\s*(?:PRO\s+)?[AB]?\d|INTEL\s+ARC/.test(text)) {
    add("gpu_chip", "intel");
  }

  addFirstMatch(add, "gpu_series", text, [
    ["rtx-50", /\bRTX\s*50\d{2}/],
    ["rtx-40", /\bRTX\s*40\d{2}/],
    ["rtx-30", /\bRTX\s*30\d{2}/],
    ["geforce-gt", /\b(?:GT\s*(?:710|730|1030)|N(?:210|710|730))\b/],
    ["rx-9000", /\bRX\s*9\d{3}/],
    ["rx-7000", /\bRX\s*7\d{3}/],
    ["rx-6000", /\bRX\s*6\d{3}/],
    ["arc", /\bARC\s*(?:PRO\s+)?[AB]?\d|INTEL\s+ARC/],
    ["professional", /\b(?:NVIDIA\s+RTX\s+(?:A\d|\d{4}\s+ADA)|RTX\s+PRO|AI\s+PRO\s+R\d)/],
    ["legacy-radeon", /\bR7\s*240\b/],
  ]);
  addFirstNumberMatch(
    add,
    "vram_gb",
    text,
    /(?:^|[/\s(-])(?:O)?(1|2|4|6|8|10|12|16|20|24|32|48|72|96)\s*G(?:B|D[34567])?(?=$|[-/\s(),])/,
  );
  if (/\bRTX\s*5050\b|\bRTX\s*5060(?!\s*TI)\b/.test(text)) {
    add("vram_gb", "8");
  } else if (/\bRTX\s*5070\s*TI\b|\bRTX\s*5080\b/.test(text)) {
    add("vram_gb", "16");
  } else if (/\bRTX\s*5070(?!\s*TI)\b|\bRX\s*9070\s*GRE\b/.test(text)) {
    add("vram_gb", "12");
  } else if (/\bRTX\s*5090\b/.test(text)) {
    add("vram_gb", "32");
  } else if (/\bRX\s*(?:7650\s*GRE)\b/.test(text)) {
    add("vram_gb", "8");
  } else if (/\bRX\s*9070(?:\s*XT)?\b/.test(text)) {
    add("vram_gb", "16");
  } else if (/\bGT\s*1030\b|\bR7\s*240\b/.test(text)) {
    add("vram_gb", "2");
  } else if (/\bN210\b/.test(text)) {
    add("vram_gb", "1");
  }
}

function extractCaseTags(text: string, add: AddTag): void {
  extractFormFactors(text, add, "motherboard_support");
  if (/\bGT502\s+HORIZON\b/.test(text)) {
    add("motherboard_support", "atx");
  }
  if (/背插/.test(text)) {
    add("back_connect", "yes");
  }
  const hasNegatedIncludedPsu = /(?:不|未)(?:包)?含[^/]*(?:電源(?!倉)|POWER)/.test(text);
  if (
    !hasNegatedIncludedPsu &&
    /含[^/]*(?:電源(?!倉)|POWER)|內附[^/]*\d{3,4}\s*W[^/]*(?:電源(?!倉)|POWER)|(?:電源(?!倉)|POWER)[^/]*內附/.test(
      text,
    )
  ) {
    add("included_psu", "yes");
  }
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
    ["full", /全模(?:組)?|FULLY\s+MODULAR/],
    ["semi", /半模組|SEMI[- ]MODULAR/],
  ]);
}

function extractFanAccessoryTags(text: string, add: AddTag): void {
  if (/控制器|HUB/.test(text)) {
    add("fan_product_type", "controller");
  } else if (/線材|電源線|訊號線|連接線|啟動線|延長線|轉接線|CABLE/.test(text)) {
    add("fan_product_type", "cable");
  } else if (/支架|支撐架|轉接架|直立套件|BRACKET/.test(text)) {
    add("fan_product_type", "bracket");
  } else if (
    /風扇|效能扇|反向扇|雙向扇|磁軌扇|薄扇|靜音扇|\bFAN\b|\bNF-[A-Z0-9]|\bPWM\b/.test(text)
  ) {
    add("fan_product_type", "fan");
  } else if (/燈效套件|擴充USB模組|LCD|螢幕|燈條/.test(text)) {
    add("fan_product_type", "accessory");
  }

  extractFanSize(text, add);
  if (/\bA\.?RGB\b/.test(text)) {
    add("lighting", "argb");
  } else if (/\bRGB\b/.test(text)) {
    add("lighting", "rgb");
  }
}

function extractFormFactors(text: string, add: AddTag, key: string): void {
  addAllMatches(add, key, text, [
    ["e-atx", /(?:^|[(/,\s])E-?ATX(?=$|[^A-Z0-9-])/],
    ["atx", /(?:^|[(/,\s])ATX(?=$|[^A-Z0-9-])/],
    ["m-atx", /(?:^|[(/,\s])(?:M-?ATX|MICRO\s*ATX)(?=$|[^A-Z0-9-])/],
    ["mini-itx", /(?:^|[^A-Z0-9])(?:MINI-?ITX|ITX)(?=$|[^A-Z0-9])/],
    ["eeb", /(?:^|[(/,\s])EEB(?=$|[^A-Z0-9-])/],
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
  const terabyteMatch = text.match(
    /(?:^|[^\d])(1|2|3|4|5|6|8|10|12|14|16|18|20|22|24|26|28|30)\s*T(?:B)?\b/,
  );
  if (terabyteMatch?.[1]) {
    add("capacity_gb", String(Number(terabyteMatch[1]) * 1000));
    return;
  }

  addFirstNumberMatch(
    add,
    "capacity_gb",
    text,
    /(?:^|[^\d])(32|64|128|256|480|500|512)\s*G(?:B)?(?=$|[^A-Z0-9]|MICRO\s*SD)/,
  );
}

function addAllMatches(add: AddTag, key: string, text: string, rules: readonly MatchRule[]): void {
  for (const [value, pattern] of rules) {
    if (pattern.test(text)) {
      add(key, value);
    }
  }
}

function addFirstMatch(add: AddTag, key: string, text: string, rules: readonly MatchRule[]): void {
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
