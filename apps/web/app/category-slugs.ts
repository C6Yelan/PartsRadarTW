// 定義 web/API boundary 使用的 public category slug 與 CoolPC IGrp 對照。

export const CATEGORY_MAPPINGS = [
  { igrp: 4, slug: "cpu", displayName: "CPU" },
  { igrp: 5, slug: "motherboard", displayName: "主機板" },
  { igrp: 6, slug: "memory", displayName: "記憶體" },
  { igrp: 7, slug: "storage", displayName: "SSD" },
  { igrp: 8, slug: "hard-drive", displayName: "HDD" },
  { igrp: 9, slug: "external-storage", displayName: "外接儲存" },
  { igrp: 10, slug: "cooler", displayName: "散熱器" },
  { igrp: 11, slug: "liquid-cooling", displayName: "水冷" },
  { igrp: 12, slug: "gpu", displayName: "顯示卡" },
  { igrp: 14, slug: "case", displayName: "機殼" },
  { igrp: 15, slug: "power-supply", displayName: "電源供應器" },
  { igrp: 16, slug: "fan-accessory", displayName: "風扇 / 配件" },
] as const;

export type CategorySlug = (typeof CATEGORY_MAPPINGS)[number]["slug"];

export function getCategorySlug(igrp: number): CategorySlug | null {
  return CATEGORY_MAPPINGS.find((mapping) => mapping.igrp === igrp)?.slug ?? null;
}

export function getCategoryIgrp(slug: string): number | null {
  return CATEGORY_MAPPINGS.find((mapping) => mapping.slug === slug)?.igrp ?? null;
}

export function getCategoryMapping(slug: string) {
  return CATEGORY_MAPPINGS.find((mapping) => mapping.slug === slug) ?? null;
}

export function getCategoryPath(slug: CategorySlug) {
  return `/categories/${slug}` as const;
}
