// 將 CoolPC 現有篩選群組映射到本站已公開的穩定 filter tags。

export type SourceFilterTarget = "optgroup" | "product";

export type SourceFilterMatcher =
  | {
      kind: "includes";
      needles: readonly string[];
    }
  | {
      kind: "wattage-range";
      minInclusive: number;
      maxExclusive: number | null;
      minDigits: number;
      maxDigits: number | null;
    };

export type SourceFilterConditionMapping =
  | {
      tags: null;
      matcher: null;
      expectedSourceValues: readonly (string | null)[];
    }
  | {
      tags: readonly string[];
      matcher: SourceFilterMatcher;
      expectedSourceValues: readonly (string | null)[];
    };

export interface SourceFilterGroupMapping {
  target: SourceFilterTarget;
  conditions: Readonly<Record<string, SourceFilterConditionMapping>>;
}

export interface SourceFilterSectionMapping {
  igrp: number;
  selectName: string;
  controlName: string;
  groups: readonly (SourceFilterGroupMapping | null)[];
}

const ignoredGroup = null;
const DEFAULT_SOURCE_VALUES = [null, "on"] as const;

export const SOURCE_FILTER_SECTION_MAPPINGS: readonly SourceFilterSectionMapping[] = [
  {
    igrp: 4,
    selectName: "n4",
    controlName: "cpuT",
    groups: [
      ignoredGroup,
      group("optgroup", {
        xeon: ignoredCondition("4677"),
        "1700": mappedCondition(["socket:lga1700"], includes("1700")),
        "1851": mappedCondition(["socket:lga1851"], includes("1851")),
        Threadripper: mappedCondition(["socket:str5"], includes("Threadripper")),
        AM4: mappedCondition(["socket:am4"], includes("AM4")),
        AM5: mappedCondition(["socket:am5"], includes("AM5")),
      }),
    ],
  },
  {
    igrp: 5,
    selectName: "n5",
    controlName: "mbT",
    groups: [
      ignoredGroup,
      group("optgroup", {
        "1150": ignoredCondition(),
        "1151": ignoredCondition(),
        "1200": ignoredCondition(),
        "1700": mappedCondition(["socket:lga1700"], includes("1700")),
        "1851": mappedCondition(["socket:lga1851"], includes("1851")),
        AM4: mappedCondition(["socket:am4"], includes("AM4")),
        AM5: mappedCondition(["socket:am5"], includes("AM5")),
        Threadripper: ignoredCondition("trx50|wrx80|wrx90|Threadripper"),
      }),
      group("product", {
        "E-ATX": mappedCondition(["form_factor:e-atx"], includes("E-ATX")),
        ATX: mappedCondition(["form_factor:atx"], includes("/ATX", "(ATX"), "\\/ATX|\\(ATX"),
        "Micro ATX": mappedCondition(
          ["form_factor:m-atx"],
          includes("M-ATX", "micro ATX"),
          "M-ATX|micro ATX",
        ),
        "mini-ITX": mappedCondition(["form_factor:mini-itx"], includes("ITX"), "ITX"),
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 6,
    selectName: "n6",
    controlName: "ramT",
    groups: [
      group("optgroup", {
        桌上型: mappedCondition(["module_type:desktop"], includes("桌上型")),
        筆記型: mappedCondition(["module_type:laptop"], includes("NOTE", "筆記型"), "NOTE|筆記型"),
        伺服器專用: mappedCondition(["module_type:server"], includes("伺服器專用")),
      }),
      group("optgroup", {
        DDR3: mappedCondition(["memory_type:ddr3"], includes("DDR3")),
        DDR4: mappedCondition(["memory_type:ddr4"], includes("DDR4")),
        DDR5: mappedCondition(["memory_type:ddr5"], includes("DDR5")),
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 7,
    selectName: "n7",
    controlName: "ssdT",
    groups: [
      group("optgroup", {
        "2.5吋": mappedCondition(["form_factor:2-5-inch"], includes("2.5"), "2\\.5"),
        "M.2 PCIe 3.0": mappedCondition(
          ["form_factor:m2", "pcie_generation:gen3"],
          includes("M.2 PCIe 3"),
          "M\\.2 PCIe 3",
        ),
        "M.2 PCIe 4.0": mappedCondition(
          ["form_factor:m2", "pcie_generation:gen4"],
          includes("M.2 PCIe 4"),
          "M\\.2 PCIe 4",
        ),
        "M.2 PCIe 5.0": mappedCondition(
          ["form_factor:m2", "pcie_generation:gen5"],
          includes("M.2 PCIe 5"),
          "M\\.2 PCIe 5",
        ),
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 8,
    selectName: "n8",
    controlName: "hdT",
    groups: [
      group("optgroup", {
        "2.5吋": mappedCondition(["form_factor:2-5-inch"], includes("2.5"), "2\\.5"),
        "3.5吋": mappedCondition(["form_factor:3-5-inch"], includes("3.5"), "3\\.5"),
      }),
      group("optgroup", {
        傳統碟: mappedCondition(["storage_usage:desktop"], includes("傳統碟")),
        企業碟: mappedCondition(["storage_usage:enterprise"], includes("企業碟")),
        監控碟: mappedCondition(["storage_usage:surveillance"], includes("監控碟")),
        NAS碟: mappedCondition(["storage_usage:nas"], includes("NAS碟")),
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 9,
    selectName: "n9",
    controlName: "usbT",
    groups: [
      group("optgroup", {
        記憶卡: mappedCondition(["external_type:memory-card"], includes("記憶卡")),
        隨身碟: mappedCondition(["external_type:usb-flash"], includes("隨身碟")),
        隨身SSD碟: mappedCondition(["external_type:external-ssd"], includes("ssd"), "ssd"),
        "隨身2.5硬碟": mappedCondition(["external_type:external-hdd"], includes("2.5"), "2\\.5"),
        "外接3.5硬碟": mappedCondition(["external_type:external-hdd"], includes("3.5"), "3\\.5"),
      }),
      group("product", {
        "Type-A": mappedCondition(["connector:type-a"], includes("Type-A")),
        "Type-C": mappedCondition(["connector:type-c"], includes("Type-C")),
      }),
    ],
  },
  {
    igrp: 12,
    selectName: "n12",
    controlName: "vgaT",
    groups: [
      group("optgroup", {
        AMD: mappedCondition(["gpu_chip:amd"], includes("AMD")),
        NVIDIA: mappedCondition(["gpu_chip:nvidia"], includes("NV"), "NV"),
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 14,
    selectName: "n14",
    controlName: "caseT",
    groups: [
      group("product", {
        "m-atx": ignoredCondition("m-atx"),
        "no-atx": ignoredCondition("m-atx"),
        含Power: mappedCondition(["included_psu:yes"], includes("電源"), "電源"),
        無Power: ignoredCondition("電源"),
      }),
      group("product", {
        ATX: mappedCondition(["motherboard_support:atx"], includes("ATX"), "atx"),
        "E-ATX": mappedCondition(["motherboard_support:e-atx"], includes("E-ATX"), "e-atx"),
        EEB: mappedCondition(["motherboard_support:eeb"], includes("EEB")),
        ITX: mappedCondition(["motherboard_support:mini-itx"], includes("ITX")),
        "M-ATX": mappedCondition(["motherboard_support:m-atx"], includes("M-ATX"), "m-atx"),
        支援背插式: mappedCondition(["back_connect:yes"], includes("背插"), "背插"),
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 15,
    selectName: "n15",
    controlName: "psuT",
    groups: [
      group("product", {
        "400W以下": mappedCondition(
          ["wattage_range:under-400"],
          wattageRange(0, 400, 3, 3),
          "[^0-9][^4-9][0-9]{2}W",
        ),
        "400~599W": mappedCondition(
          ["wattage_range:400-599"],
          wattageRange(400, 600, 3, 3),
          "[^0-9][4-5][0-9]{2}W",
        ),
        "600~799W": mappedCondition(
          ["wattage_range:600-799"],
          wattageRange(600, 800, 3, 3),
          "[^0-9][6-7][0-9]{2}W",
        ),
        "800~999W": mappedCondition(
          ["wattage_range:800-999"],
          wattageRange(800, 1000, 3, 3),
          "[^0-9][8-9][0-9]{2}W",
        ),
        "1000W以上": mappedCondition(
          ["wattage_range:1000-plus"],
          wattageRange(1000, null, 4, null),
          "[0-9]{4,}W",
        ),
      }),
      group("product", {
        "ATX 3.X": mappedCondition(["psu_standard:atx-3"], includes("ATX3", "ATX 3"), "ATX3|ATX 3"),
        "PCIe 5.0": ignoredCondition("PCIe5|PCIe 5"),
        銅牌: mappedCondition(["efficiency:bronze"], includes("銅牌")),
        "銀牌、金牌": ignoredCondition("銀牌|金牌"),
        "白金、鈦金": ignoredCondition("白金|鈦金"),
      }),
      ignoredGroup,
    ],
  },
] as const;

function group(
  target: SourceFilterTarget,
  conditions: Readonly<Record<string, SourceFilterConditionMapping>>,
): SourceFilterGroupMapping {
  return { target, conditions };
}

function ignoredCondition(
  ...expectedSourceValues: readonly (string | null)[]
): SourceFilterConditionMapping {
  return {
    tags: null,
    matcher: null,
    expectedSourceValues:
      expectedSourceValues.length > 0 ? expectedSourceValues : DEFAULT_SOURCE_VALUES,
  };
}

function mappedCondition(
  tags: readonly string[],
  matcher: SourceFilterMatcher,
  ...expectedSourceValues: readonly (string | null)[]
): SourceFilterConditionMapping {
  return {
    tags,
    matcher,
    expectedSourceValues:
      expectedSourceValues.length > 0 ? expectedSourceValues : DEFAULT_SOURCE_VALUES,
  };
}

function includes(firstNeedle: string, ...otherNeedles: readonly string[]): SourceFilterMatcher {
  return {
    kind: "includes",
    needles: [firstNeedle, ...otherNeedles].map((needle) => needle.toLowerCase()),
  };
}

function wattageRange(
  minInclusive: number,
  maxExclusive: number | null,
  minDigits: number,
  maxDigits: number | null,
): SourceFilterMatcher {
  return {
    kind: "wattage-range",
    minInclusive,
    maxExclusive,
    minDigits,
    maxDigits,
  };
}
