import {
  getProductFacetDefinitions,
  isProductFilterTagSupported,
  parseProductFilterTag,
} from "@partsradar/shared";
import { fail, ok, warn } from "../results";
import type { ProductionSmokeClient, SmokeCheckResult } from "../types";

export interface ProductFilterQualityCandidate {
  id: string;
  filterTags: string[];
  sourceCategory: {
    igrp: number;
    displayName: string;
  };
}

export interface ProductFilterCoverageSnapshot {
  [key: string]: number;
}

interface CoverageRequirement {
  key: string;
  minimum: number;
  applies?: (tags: ReadonlyMap<string, ReadonlySet<string>>) => boolean;
}

export interface ProductFilterQualityAudit {
  products: number;
  emptyProducts: number;
  unsupportedTags: string[];
  conflicts: string[];
  zeroCountOptions: string[];
  belowMinimum: string[];
  coverage: ProductFilterCoverageSnapshot;
}

const REQUIREMENTS: Readonly<Record<number, readonly CoverageRequirement[]>> = {
  4: required(["socket", "cpu_family", "integrated_graphics"], 1),
  5: [...required(["socket", "chipset", "memory_type"], 0.99), ...required(["form_factor"], 0.95)],
  6: [
    ...required(["memory_type", "capacity_gb", "speed_mhz"], 0.95),
    ...required(["module_type"], 0.9),
  ],
  7: required(["capacity_gb"], 0.95),
  8: [...required(["capacity_gb"], 1), ...required(["storage_usage"], 0.98)],
  9: required(["external_type", "capacity_gb"], 0.95),
  10: required(["cooler_type"], 0.95),
  11: [...required(["liquid_type"], 0.95), ...required(["radiator_size_mm"], 0.98)],
  12: [
    ...required(["gpu_product_type"], 1),
    ...required(
      ["gpu_chip", "gpu_series", "vram_gb"],
      0.95,
      (tags) => tags.get("gpu_product_type")?.has("graphics-card") ?? false,
    ),
  ],
  14: required(["motherboard_support"], 0.99),
  15: [...required(["wattage_range", "efficiency"], 1), ...required(["psu_standard"], 0.8)],
  16: required(["fan_product_type"], 0.95),
};

const MULTI_VALUE_FACETS = new Set(["connector", "motherboard_support", "psu_standard"]);
const COVERAGE_DROP_WARN = 0.05;
let previousCoverage: ProductFilterCoverageSnapshot | null = null;

export async function checkProductFilterQuality(
  client: ProductionSmokeClient,
): Promise<SmokeCheckResult> {
  const products = await client.product.findMany({
    where: {
      isActive: true,
      sourceCategory: { igrp: { in: Object.keys(REQUIREMENTS).map(Number) } },
    },
    select: {
      id: true,
      filterTags: true,
      sourceCategory: { select: { igrp: true, displayName: true } },
    },
  });
  const audit = auditProductFilterQuality(products);
  const drops = compareCoverage(previousCoverage, audit.coverage);
  previousCoverage = audit.coverage;
  const issues = [...audit.belowMinimum, ...drops, ...audit.unsupportedTags, ...audit.conflicts];
  const optionalWarnings = [...(audit.emptyProducts > 0 ? [`empty=${audit.emptyProducts}`] : [])];
  const message = formatAuditMessage(
    audit.products,
    audit.zeroCountOptions.length,
    issues,
    optionalWarnings,
  );

  if (audit.unsupportedTags.length > 0 || audit.conflicts.length > 0) {
    return fail("product filter quality", message);
  }
  if (issues.length > 0 || optionalWarnings.length > 0) {
    return warn("product filter quality", message);
  }
  return ok("product filter quality", message);
}

export function auditProductFilterQuality(
  products: readonly ProductFilterQualityCandidate[],
): ProductFilterQualityAudit {
  const unsupportedTags = new Set<string>();
  const conflicts = new Set<string>();
  const optionCounts = new Map<string, number>();
  const coverage: ProductFilterCoverageSnapshot = {};
  let emptyProducts = 0;

  for (const product of products) {
    const igrp = product.sourceCategory.igrp;
    const tagsByKey = groupTags(product.filterTags);
    if (product.filterTags.length === 0) {
      emptyProducts += 1;
    }
    for (const tag of product.filterTags) {
      if (!isProductFilterTagSupported(igrp, tag)) {
        unsupportedTags.add(`unsupported=${product.id}:${tag}`);
      } else {
        optionCounts.set(`${igrp}:${tag}`, (optionCounts.get(`${igrp}:${tag}`) ?? 0) + 1);
      }
    }
    for (const [key, values] of tagsByKey) {
      const allowsMultiple = MULTI_VALUE_FACETS.has(key) || (igrp === 5 && key === "memory_type");
      if (values.size > 1 && !allowsMultiple) {
        conflicts.add(`conflict=${product.id}:${key}`);
      }
    }
    if (
      tagsByKey.get("gpu_product_type")?.has("accessory") &&
      ["gpu_chip", "gpu_series", "vram_gb"].some((key) => tagsByKey.has(key))
    ) {
      conflicts.add(`conflict=${product.id}:gpu-accessory-facets`);
    }
  }

  const belowMinimum: string[] = [];
  for (const [igrpText, requirements] of Object.entries(REQUIREMENTS)) {
    const igrp = Number(igrpText);
    const categoryProducts = products.filter((product) => product.sourceCategory.igrp === igrp);
    for (const requirement of requirements) {
      const applicable = categoryProducts.filter((product) => {
        const tags = groupTags(product.filterTags);
        return requirement.applies?.(tags) ?? true;
      });
      const covered = applicable.filter((product) =>
        groupTags(product.filterTags).has(requirement.key),
      );
      const ratio = applicable.length === 0 ? 1 : covered.length / applicable.length;
      const coverageKey = `${igrp}:${requirement.key}`;
      coverage[coverageKey] = ratio;
      if (ratio < requirement.minimum) {
        belowMinimum.push(
          `coverage=${coverageKey}:${covered.length}/${applicable.length}<${percent(requirement.minimum)}`,
        );
      }
    }
  }

  const zeroCountOptions: string[] = [];
  for (const igrpText of Object.keys(REQUIREMENTS)) {
    const igrp = Number(igrpText);
    if (!products.some((product) => product.sourceCategory.igrp === igrp)) {
      continue;
    }
    for (const facet of getProductFacetDefinitions(igrp)) {
      for (const option of facet.options) {
        const key = `${igrp}:${facet.key}:${option.value}`;
        if (!optionCounts.has(key)) {
          zeroCountOptions.push(`zero=${key}`);
        }
      }
    }
  }

  return {
    products: products.length,
    emptyProducts,
    unsupportedTags: [...unsupportedTags],
    conflicts: [...conflicts],
    zeroCountOptions,
    belowMinimum,
    coverage,
  };
}

function groupTags(tags: readonly string[]): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const tag of tags) {
    const parsed = parseProductFilterTag(tag);
    if (!parsed) {
      continue;
    }
    const values = grouped.get(parsed.key) ?? new Set<string>();
    values.add(parsed.value);
    grouped.set(parsed.key, values);
  }
  return grouped;
}

function required(
  keys: readonly string[],
  minimum: number,
  applies?: CoverageRequirement["applies"],
): CoverageRequirement[] {
  return keys.map((key) => ({ key, minimum, applies }));
}

function compareCoverage(
  previous: ProductFilterCoverageSnapshot | null,
  current: ProductFilterCoverageSnapshot,
): string[] {
  if (!previous) {
    return [];
  }
  return Object.entries(current).flatMap(([key, ratio]) => {
    const prior = previous[key];
    return prior !== undefined && prior - ratio >= COVERAGE_DROP_WARN
      ? [`drop=${key}:${percent(prior)}->${percent(ratio)}`]
      : [];
  });
}

function formatAuditMessage(
  products: number,
  zeroCountOptions: number,
  issues: readonly string[],
  warnings: readonly string[],
): string {
  const details = [...issues, ...warnings];
  return `${products} active product(s), ${zeroCountOptions} zero-count option(s); ${details.length === 0 ? "all quality gates passed" : details.slice(0, 8).join(", ")}${details.length > 8 ? `, +${details.length - 8} more` : ""}`;
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
