// 將 CoolPC 現有篩選群組映射到本站已公開的穩定 filter tags。

export type SourceFilterTarget = "optgroup" | "product";

export interface SourceFilterGroupMapping {
  target: SourceFilterTarget;
  conditions: Readonly<Record<string, readonly string[] | null>>;
}

export interface SourceFilterSectionMapping {
  igrp: number;
  selectName: string;
  controlName: string;
  baseTags?: readonly string[];
  groups: readonly (SourceFilterGroupMapping | null)[];
}

const ignoredGroup = null;

export const SOURCE_FILTER_SECTION_MAPPINGS: readonly SourceFilterSectionMapping[] = [
  {
    igrp: 4,
    selectName: "n4",
    controlName: "cpuT",
    groups: [
      ignoredGroup,
      group("optgroup", {
        xeon: null,
        "1700": ["socket:lga1700"],
        "1851": ["socket:lga1851"],
        Threadripper: ["socket:str5"],
        AM4: ["socket:am4"],
        AM5: ["socket:am5"],
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
        "1150": null,
        "1151": null,
        "1200": null,
        "1700": ["socket:lga1700"],
        "1851": ["socket:lga1851"],
        AM4: ["socket:am4"],
        AM5: ["socket:am5"],
        Threadripper: ["socket:str5"],
      }),
      group("product", {
        "E-ATX": ["form_factor:e-atx"],
        ATX: ["form_factor:atx"],
        "Micro ATX": ["form_factor:m-atx"],
        "mini-ITX": ["form_factor:mini-itx"],
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
        桌上型: ["module_type:desktop"],
        筆記型: ["module_type:laptop"],
        伺服器專用: ["module_type:server"],
      }),
      group("optgroup", {
        DDR3: ["memory_type:ddr3"],
        DDR4: ["memory_type:ddr4"],
        DDR5: ["memory_type:ddr5"],
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 7,
    selectName: "n7",
    controlName: "ssdT",
    baseTags: ["storage_type:ssd"],
    groups: [
      group("optgroup", {
        "2.5吋": ["form_factor:2-5-inch"],
        "M.2 PCIe 3.0": ["form_factor:m2", "pcie_generation:gen3"],
        "M.2 PCIe 4.0": ["form_factor:m2", "pcie_generation:gen4"],
        "M.2 PCIe 5.0": ["form_factor:m2", "pcie_generation:gen5"],
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 7,
    selectName: "n8",
    controlName: "hdT",
    baseTags: ["storage_type:hdd"],
    groups: [
      group("optgroup", {
        "2.5吋": ["form_factor:2-5-inch"],
        "3.5吋": ["form_factor:3-5-inch"],
      }),
      group("optgroup", {
        傳統碟: ["storage_usage:desktop"],
        企業碟: ["storage_usage:enterprise"],
        監控碟: ["storage_usage:surveillance"],
        NAS碟: ["storage_usage:nas"],
      }),
      ignoredGroup,
    ],
  },
  {
    igrp: 8,
    selectName: "n9",
    controlName: "usbT",
    groups: [
      group("optgroup", {
        記憶卡: ["external_type:memory-card"],
        隨身碟: ["external_type:usb-flash"],
        隨身SSD碟: ["external_type:external-ssd"],
        "隨身2.5硬碟": ["external_type:external-hdd"],
        "外接3.5硬碟": ["external_type:external-hdd"],
      }),
      group("product", {
        "Type-A": ["connector:type-a"],
        "Type-C": ["connector:type-c"],
      }),
    ],
  },
  {
    igrp: 12,
    selectName: "n12",
    controlName: "vgaT",
    groups: [
      group("optgroup", {
        AMD: ["gpu_chip:amd"],
        NVIDIA: ["gpu_chip:nvidia"],
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
        "m-atx": null,
        "no-atx": null,
        含Power: ["included_psu:yes"],
        無Power: null,
      }),
      group("product", {
        ATX: ["motherboard_support:atx"],
        "E-ATX": ["motherboard_support:e-atx"],
        EEB: ["motherboard_support:eeb"],
        ITX: ["motherboard_support:mini-itx"],
        "M-ATX": ["motherboard_support:m-atx"],
        支援背插式: ["back_connect:yes"],
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
        "400W以下": ["wattage_range:under-400"],
        "400~599W": ["wattage_range:400-599"],
        "600~799W": ["wattage_range:600-799"],
        "800~999W": ["wattage_range:800-999"],
        "1000W以上": ["wattage_range:1000-plus"],
      }),
      group("product", {
        "ATX 3.X": ["psu_standard:atx-3"],
        "PCIe 5.0": null,
        銅牌: ["efficiency:bronze"],
        "銀牌、金牌": null,
        "白金、鈦金": null,
      }),
      ignoredGroup,
    ],
  },
] as const;

function group(
  target: SourceFilterTarget,
  conditions: Readonly<Record<string, readonly string[] | null>>,
): SourceFilterGroupMapping {
  return { target, conditions };
}
