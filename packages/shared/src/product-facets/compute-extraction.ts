// 解析處理器、主機板與記憶體商品名稱中的 facet tags。

import {
  type AddTag,
  addAllMatches,
  addFirstMatch,
  addFirstNumberMatch,
  extractFormFactors,
  type MatchRule,
} from "./helpers";

export function extractCpuTags(text: string, add: AddTag): void {
  if (/\bXEON\s+W(?:5-2465X|7-3465X)\b/.test(text)) {
    add("socket", "lga4677");
    add("cpu_family", "xeon-w");
    add("integrated_graphics", "no");
    return;
  }

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
  if (/THREADRIPPER|RYZEN\s+TR\b/.test(text)) return true;
  if (/\bI[3579]-\d{4,5}(?:KF|F)\b|\bCORE\s+ULTRA\s+[3579]\s+\d{3}(?:KF|F)\b/.test(text)) {
    return true;
  }

  const amdModel = text.match(/\b(?:RYZEN\s*)?R?[3579]\s*([345789]\d{3})([A-Z0-9]*)\b/);
  if (!amdModel) return false;
  const generation = amdModel[1]?.[0];
  const suffix = amdModel[2] ?? "";
  if (suffix.includes("G")) return false;
  return suffix.includes("F") || generation === "3" || generation === "4" || generation === "5";
}

function hasKnownCpuWithIntegratedGraphics(text: string): boolean {
  if (/\bI[3579]-\d{4,5}[A-Z]*\b|\bCORE\s+ULTRA\s+[3579]\s+\d{3}[A-Z]*\b/.test(text)) {
    return true;
  }
  const amdModel = text.match(/\b(?:RYZEN\s*)?R?[3579]\s*([345789]\d{3})([A-Z0-9]*)\b/);
  if (!amdModel) return false;
  const generation = amdModel[1]?.[0];
  const suffix = amdModel[2] ?? "";
  return suffix.includes("G") || generation === "7" || generation === "8" || generation === "9";
}

export function extractMotherboardTags(text: string, add: AddTag): void {
  const chipsetRules: MatchRule[] = [
    ["b650e", /\bB650E(?=M?\b)/],
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
    ["wrx80", /\bWRX80(?:E)?\b/],
    ["wrx90", /\bWRX90(?:E)?\b/],
  ];
  addFirstMatch(add, "chipset", text, chipsetRules);

  if (/\b(?:H610|B760|Z790|W680)/.test(text)) add("socket", "lga1700");
  else if (/\b(?:H810|B860|Z890|W880)/.test(text)) add("socket", "lga1851");
  else if (/\b(?:A520|B550)(?:M|I)?\b/.test(text)) add("socket", "am4");
  else if (/\b(?:A620|B650|B840|B850|X670|X870)/.test(text)) add("socket", "am5");
  else if (/\bWRX80(?:E)?\b/.test(text)) add("socket", "swrx8");
  else if (/\b(?:TRX50|WRX90)(?:E)?\b/.test(text)) add("socket", "str5");

  extractFormFactors(text, add, "form_factor");
  addAllMatches(add, "memory_type", text, [
    ["ddr4", /\bDDR4\b|(?:^|[^A-Z0-9])D4(?=$|[^A-Z0-9])/],
    ["ddr5", /\bDDR5\b|(?:^|[^A-Z0-9])D5(?=$|[^A-Z0-9])/],
  ]);
  if (/\b(?:A520|B550)/.test(text)) add("memory_type", "ddr4");
  else if (/\bH81M-K\b/.test(text)) add("memory_type", "ddr3");
  else if (/\b(?:H610M-H2\/M\.2|PRO\s+H610M-E)\b/.test(text)) add("memory_type", "ddr4");
  else if (
    /\b(?:A620|B650|B840|B850|X670|X870|H810|B860|Z890|W790|W880|W890|TRX50|WRX90)/.test(text)
  )
    add("memory_type", "ddr5");
  else if (/\b(?:H110|H310|H510|WRX80)/.test(text)) add("memory_type", "ddr4");
  else if (/\bPRO\s+WS\s+W680/.test(text)) add("memory_type", "ddr5");
  else if (/\b(?:B760|Z790)/.test(text) && !/\bD4\b|COMBO/.test(text)) add("memory_type", "ddr5");

  if (/\bWI-?FI\b|無線/.test(text)) add("wifi", "yes");
}

export function extractMemoryTags(text: string, add: AddTag): void {
  if (/伺服器|\b(?:ECC|RDIMM)\b/.test(text)) add("module_type", "server");
  else if (/筆記型|\bNOTE\b|\bNB\b|\bSO-?DIMM\b/.test(text)) add("module_type", "laptop");
  else if (/桌上型|\bU-?DIMM\b|單條|雙通|\bCL\d+\b/.test(text)) add("module_type", "desktop");

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
