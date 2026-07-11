// 定義 web/API boundary 使用的 public category slug 與 CoolPC IGrp 對照。

const CATEGORY_MAPPINGS = [
  { igrp: 4, slug: "cpu" },
  { igrp: 5, slug: "motherboard" },
  { igrp: 6, slug: "memory" },
  { igrp: 7, slug: "storage" },
  { igrp: 8, slug: "external-storage" },
  { igrp: 10, slug: "cooler" },
  { igrp: 11, slug: "liquid-cooling" },
  { igrp: 12, slug: "gpu" },
  { igrp: 14, slug: "case" },
  { igrp: 15, slug: "power-supply" },
  { igrp: 16, slug: "fan-accessory" },
] as const;

export type CategorySlug = (typeof CATEGORY_MAPPINGS)[number]["slug"];

export function getCategorySlug(igrp: number): CategorySlug | null {
  return CATEGORY_MAPPINGS.find((mapping) => mapping.igrp === igrp)?.slug ?? null;
}

export function getCategoryIgrp(slug: string): number | null {
  return CATEGORY_MAPPINGS.find((mapping) => mapping.slug === slug)?.igrp ?? null;
}
