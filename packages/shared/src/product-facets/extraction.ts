// packages/shared/src/product-facets/extraction.ts
// 將商品名稱解析成由 registry 驗證並排序的站內 filter tags。

import { extractCpuTags, extractMemoryTags, extractMotherboardTags } from "./compute-extraction";
import {
  type AddTag,
  addAllMatches,
  addFirstMatch,
  addFirstNumberMatch,
  extractFormFactors,
  hasTokensInOrder,
} from "./helpers";
import { getProductFacetDefinitions, isProductFilterTagSupported } from "./registry";
import { normalizeBoundedProductName } from "../product-name";

export function extractProductFilterTags(igrp: number, productName: string): string[] {
  const definitions = getProductFacetDefinitions(igrp);
  const normalizedName = normalizeBoundedProductName(productName);

  if (definitions.length === 0 || normalizedName === null || normalizedName.trim().length === 0) {
    return [];
  }

  const text = normalizedName.toUpperCase();
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
      extractStorageTags(text, add, true);
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

function extractStorageTags(text: string, add: AddTag, includeCapacityBucket = false): void {
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
  const capacityGb = extractStorageCapacity(text, add);
  if (includeCapacityBucket && capacityGb) {
    const bucket = SSD_CAPACITY_BUCKETS[capacityGb];
    if (bucket) {
      add("capacity_bucket", bucket);
    }
  }
  addAllMatches(add, "storage_usage", text, [
    ["laptop", /\bMQ04ABD200\b/],
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
  if (/記憶卡|\b(?:SD(?:HC|XC)?|MICRO\s*SD(?:HC|XC)?|CFEXPRESS(?:\s*TYPE\s*B)?)\b/.test(text)) {
    add("external_type", "memory-card");
  } else if (
    (/隨身碟|格紋碟|\b(?:JF790C|UC310|UV128|UV320)\b|\bDT\s+EXODIA\s+S\b/.test(text) &&
      !/SSD/.test(text))
  ) {
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
  if (
    hasTokensInOrder(text, ["M.2", "散熱"]) ||
    hasTokensInOrder(text, ["M2", "散熱"]) ||
    hasTokensInOrder(text, ["SSD", "散熱"]) ||
    hasTokensInOrder(text, ["散熱", "M.2"]) ||
    hasTokensInOrder(text, ["散熱", "M2"]) ||
    hasTokensInOrder(text, ["散熱", "SSD"])
  ) {
    add("cooler_type", "ssd-heatsink");
  } else if (/扣具/.test(text)) {
    add("cooler_type", "mounting-kit");
  } else if (/散熱膏|金屬膏|道康膏|涼膏/.test(text)) {
    add("cooler_type", "thermal-paste");
  } else if (/散熱墊|導熱墊|導熱片|THERMAL\s+PAD/.test(text)) {
    add("cooler_type", "thermal-pad");
  } else if (
    hasTokensInOrder(text, ["筆電", "散熱"]) ||
    hasTokensInOrder(text, ["散熱", "筆電"]) ||
    /NOTEPAL/.test(text) ||
    hasTokensInOrder(text, ["風扇", "筆電支架"])
  ) {
    add("cooler_type", "laptop-cooler");
  } else if (/下吹/.test(text)) {
    add("cooler_type", "top-down");
  } else if (/塔散|塔式|單塔|雙塔|FROZN\s+A\d+/.test(text) || hasNumberedHeatpipeFeature(text)) {
    add("cooler_type", "air-tower");
  } else if (
    /散熱器/.test(text) ||
    hasTokensInOrder(text, ["CPU", "風扇"]) ||
    hasTokensInOrder(text, ["網通設備", "散熱架"])
  ) {
    add("cooler_type", "other-air");
  }

  extractExplicitSockets(text, add);
}

function extractLiquidCoolingTags(text: string, add: AddTag): void {
  const isCustom = /開放式/.test(text);
  const isComponent =
    /\bNL-(?:ACF1|LC1)\b|水冷(?:頭|泵|排|箱|接頭|管|液)|水泵|冷排|水箱|止水栓|流量計/.test(text) ||
    hasTokensInOrder(text, ["VRM", "水冷", "風扇"]);
  const isAio =
    !isCustom &&
    !isComponent &&
    /一體式|AIO|封閉式|水冷|\b(?:PANORAMA|HYPERFLOW|NANCOOL|TUF\s+GAMING\s+LC|ROG\s+(?:STRIX\s+(?:LC|SLC(?:\s+IV)?)|SLC(?:\s+IV)?|RYUO)|LC\s+III|CORELIQUID|AQUAFUSION|FROZEN\s+WARFRAME|GRAND\s+VISION|HYDROSHIFT|WATERFORCE)\b|ASETEK/.test(
      text,
    );

  if (isCustom) {
    add("liquid_type", "custom");
  } else if (isComponent) {
    add("liquid_type", "component");
  } else if (isAio) {
    add("liquid_type", "aio");
  }

  if (isAio || /水冷排|冷排/.test(text)) {
    addFirstNumberMatch(
      add,
      "radiator_size_mm",
      text,
      /(?:^|[^\d])(120|240|280|360|420)(?=[^\d]|$)/,
    );
  }
  extractExplicitSockets(text, add);
}

function extractGpuTags(text: string, add: AddTag): void {
  if (/支撐架|顯卡支架|VGA\s+HOLDER/.test(text)) {
    add("gpu_product_type", "accessory");
    return;
  }
  add("gpu_product_type", "graphics-card");

  if (/\b(?:RTX|GTX|GT)\s*\d|NVIDIA|\b(?:N210|N(?:710|730)(?=$|[A-Z-])[A-Z0-9-]*)\b/.test(text)) {
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
    ["geforce-gt", /\b(?:GT\s*(?:710|730|1030)|N210|N(?:710|730)(?=$|[A-Z-])[A-Z0-9-]*)\b/],
    ["rx-9000", /\bRX\s*9\d{3}/],
    ["rx-7000", /\bRX\s*7\d{3}/],
    ["rx-6000", /\bRX\s*6\d{3}/],
    ["arc", /\bARC\s*(?:PRO\s+)?[AB]?\d|INTEL\s+ARC/],
    ["professional", /\b(?:NVIDIA\s+RTX\s+(?:A\d|\d{4}\s+ADA)|RTX\s+PRO|AI\s+PRO\s+R\d)/],
    ["legacy-radeon", /(?:\bR7|AXR7)\s*240\b/],
  ]);
  const explicitVramGb = text.match(
    /(?:^|[/\s(-])(?:O)?(1|2|4|6|8|10|12|16|20|24|32|48|72|96)\s*G(?:B(?:D[34567])?|D[34567])?(?=$|[-/\s(),]|\p{Script=Han})/u,
  )?.[1];
  if (explicitVramGb) {
    add("vram_gb", explicitVramGb);
  } else if (/\bRTX\s*5050\b|\bRTX\s*5060(?!\s*TI)\b/.test(text)) {
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
  const segments = text.split("/");
  const hasNegatedIncludedPsu = segments.some(hasNegatedIncludedPsuInSegment);
  if (!hasNegatedIncludedPsu && segments.some(hasIncludedPsuInSegment)) {
    add("included_psu", "yes");
  }
}

function hasNumberedHeatpipeFeature(text: string): boolean {
  const lastFeatureIndex = Math.max(
    text.lastIndexOf("TDP"),
    text.lastIndexOf("高"),
    text.lastIndexOf("風扇"),
  );
  if (lastFeatureIndex < 0) {
    return false;
  }

  let heatpipeIndex = text.indexOf("導管");

  while (heatpipeIndex >= 0 && heatpipeIndex < lastFeatureIndex) {
    if (heatpipeIndex > 0 && isAsciiDigit(text[heatpipeIndex - 1])) {
      return true;
    }

    heatpipeIndex = text.indexOf("導管", heatpipeIndex + 2);
  }

  return false;
}

function hasNegatedIncludedPsuInSegment(segment: string): boolean {
  return ["不含", "未含", "不包含", "未包含"].some((token) => {
    const tokenIndex = segment.indexOf(token);
    return tokenIndex >= 0 && findPowerSupplyTerm(segment, tokenIndex + token.length) >= 0;
  });
}

function hasIncludedPsuInSegment(segment: string): boolean {
  const powerSupplyIndex = findPowerSupplyTerm(segment);
  if (powerSupplyIndex < 0) {
    return false;
  }

  const includedIndex = segment.indexOf("含");
  if (includedIndex >= 0 && findPowerSupplyTerm(segment, includedIndex + "含".length) >= 0) {
    return true;
  }

  const attachedIndex = segment.indexOf("內附");
  if (attachedIndex >= 0) {
    const wattageEndIndex = findWattageEnd(segment, attachedIndex + "內附".length);
    if (wattageEndIndex >= 0 && findPowerSupplyTerm(segment, wattageEndIndex) >= 0) {
      return true;
    }
  }

  return segment.indexOf("內附", powerSupplyIndex + 1) >= 0;
}

function findPowerSupplyTerm(text: string, startIndex = 0): number {
  const englishIndex = text.indexOf("POWER", startIndex);
  let chineseIndex = text.indexOf("電源", startIndex);

  while (chineseIndex >= 0 && text.startsWith("電源倉", chineseIndex)) {
    chineseIndex = text.indexOf("電源", chineseIndex + "電源".length);
  }

  if (englishIndex < 0) {
    return chineseIndex;
  }
  if (chineseIndex < 0) {
    return englishIndex;
  }
  return Math.min(englishIndex, chineseIndex);
}

function findWattageEnd(text: string, startIndex: number): number {
  for (let index = startIndex; index < text.length; index += 1) {
    for (const digitCount of [4, 3]) {
      const digitsEnd = index + digitCount;
      if (
        digitsEnd > text.length ||
        !Array.from(text.slice(index, digitsEnd)).every(isAsciiDigit)
      ) {
        continue;
      }

      let wattageEnd = digitsEnd;
      while (wattageEnd < text.length && /\s/u.test(text[wattageEnd])) {
        wattageEnd += 1;
      }
      if (text[wattageEnd] === "W") {
        return wattageEnd + 1;
      }
    }
  }

  return -1;
}

function isAsciiDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
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
    /風扇|效能扇|反向扇|雙向扇|磁軌扇|薄扇|靜音扇|\bFAN\b|\bNF-[A-Z0-9]|\bPWM\b|WONDER\s+TORNADO|\bWT1225[A-Z0-9-]*\b/.test(
      text,
    )
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
  } else if (/WONDER\s+TORNADO\s+120|\bWT1225[A-Z0-9-]*\b/.test(text)) {
    add("fan_size_mm", "120");
  }
}

const SSD_CAPACITY_BUCKETS: Readonly<Record<string, string>> = {
  "128": "128",
  "240": "240-256",
  "256": "240-256",
  "480": "480-512",
  "500": "480-512",
  "512": "480-512",
  "960": "about-1tb",
  "1000": "about-1tb",
  "1024": "about-1tb",
  "2000": "about-2tb",
  "2048": "about-2tb",
  "4000": "4000",
  "8000": "8000",
};

function extractStorageCapacity(text: string, add: AddTag): string | null {
  const terabyteMatch = text.match(
    /(?:^|[^\d])(1|2|3|4|5|6|8|10|12|14|16|18|20|22|24|26|28|30|32)\s*T(?:B)?\b/,
  );
  if (terabyteMatch?.[1]) {
    const capacityGb = String(Number(terabyteMatch[1]) * 1000);
    add("capacity_gb", capacityGb);
    return capacityGb;
  }

  const gigabyteMatch = text.match(
    /(?:^|[^\d])(32|64|128|240|256|480|500|512|960|1024|2048)\s*G(?:B)?(?=$|[^A-Z0-9]|MICRO\s*SD)/,
  );
  if (!gigabyteMatch?.[1]) {
    return null;
  }

  add("capacity_gb", gigabyteMatch[1]);
  return gigabyteMatch[1];
}
