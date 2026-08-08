// 定義 web/API boundary 使用的 public category slug 與 CoolPC IGrp 對照。

export const CATEGORY_MAPPINGS = [
  { igrp: 4, slug: "cpu", label: "CPU" },
  { igrp: 5, slug: "motherboard", label: "主機板" },
  { igrp: 6, slug: "memory", label: "記憶體" },
  { igrp: 7, slug: "storage", label: "SSD" },
  { igrp: 8, slug: "hard-drive", label: "HDD" },
  { igrp: 9, slug: "external-storage", label: "外接儲存" },
  { igrp: 10, slug: "cooler", label: "散熱器" },
  { igrp: 11, slug: "liquid-cooling", label: "水冷" },
  { igrp: 12, slug: "gpu", label: "顯示卡" },
  { igrp: 14, slug: "case", label: "機殼" },
  { igrp: 15, slug: "power-supply", label: "電源供應器" },
  { igrp: 16, slug: "fan-accessory", label: "風扇／配件" },
] as const;

export type CategorySlug = (typeof CATEGORY_MAPPINGS)[number]["slug"];

export function getCategorySlug(igrp: number): CategorySlug | null {
  return CATEGORY_MAPPINGS.find((mapping) => mapping.igrp === igrp)?.slug ?? null;
}

export function getCategoryIgrp(slug: string): number | null {
  return CATEGORY_MAPPINGS.find((mapping) => mapping.slug === slug)?.igrp ?? null;
}
