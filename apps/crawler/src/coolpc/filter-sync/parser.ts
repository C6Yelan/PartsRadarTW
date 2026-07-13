// 解析 CoolPC 估價頁的既有篩選語意，產生可由 scheduled crawler 套用的站內 tags。

import { getProductFacetDefinitions, isProductFilterTagSupported } from "@partsradar/shared";
import { load, type CheerioAPI } from "cheerio";
import {
  SOURCE_FILTER_SECTION_MAPPINGS,
  type SourceFilterGroupMapping,
  type SourceFilterTarget,
} from "./mappings";

export interface ParsedCoolpcFilterSnapshot {
  tagsByIgrp: Record<string, Record<string, string[]>>;
  conditionCount: number;
  productCount: number;
  taggedProductCount: number;
  ambiguousProductCount: number;
}

interface SourceCondition {
  label: string;
  pattern: RegExp;
  target: SourceFilterTarget;
}

interface SourceConditionGroup {
  target: SourceFilterTarget;
  conditions: SourceCondition[];
}

const EXCLUSIVE_FACET_KEYS = new Set([
  "socket",
  "module_type",
  "storage_type",
  "external_type",
  "gpu_chip",
  "wattage_range",
]);

export function parseCoolpcFilterSnapshot(html: string): ParsedCoolpcFilterSnapshot {
  const dom = load(html);
  const tagsByIgrp: Record<string, Record<string, string[]>> = {};
  let conditionCount = 0;
  let productCount = 0;
  let ambiguousProductCount = 0;

  for (const section of SOURCE_FILTER_SECTION_MAPPINGS) {
    const select = dom(`select[name="${section.selectName}"]`).first();
    if (select.length === 0) {
      throw new Error(`CoolPC filter source is missing select ${section.selectName}.`);
    }

    const sourceGroups = readConditionGroups(dom, section.controlName);
    if (sourceGroups.length !== section.groups.length) {
      throw new Error(
        `CoolPC filter group count changed for ${section.controlName}: expected ${section.groups.length}, got ${sourceGroups.length}.`,
      );
    }

    const mappedGroups = sourceGroups.map((sourceGroup, index) => {
      const mapping = section.groups[index];
      if (!mapping) {
        return null;
      }

      validateManagedGroup(section.controlName, sourceGroup, mapping);
      conditionCount += sourceGroup.conditions.length;
      return mapConditions(sourceGroup, mapping);
    });
    let sectionProductCount = 0;

    select.find("option").each((_, element) => {
      const option = dom(element);
      if (option.is(":disabled")) {
        return;
      }

      const optionText = option.text().trim();
      const productName = readProductName(optionText);
      if (!productName) {
        return;
      }
      sectionProductCount += 1;

      const optgroupLabel = option.parent("optgroup").attr("label")?.trim() ?? "";
      const tags = new Set(section.baseTags ?? []);

      for (const conditions of mappedGroups) {
        if (!conditions) {
          continue;
        }

        for (const condition of conditions) {
          const targetText = condition.target === "optgroup" ? optgroupLabel : optionText;
          if (condition.pattern.test(targetText)) {
            for (const tag of condition.tags) {
              tags.add(tag);
            }
          }
        }
      }

      const orderedTags = orderAndValidateTags(section.igrp, tags);
      if (hasExclusiveFacetConflict(orderedTags)) {
        ambiguousProductCount += 1;
        return;
      }
      const normalizedName = normalizeFilterSyncProductName(productName);
      if (!normalizedName) {
        return;
      }

      const categoryKey = String(section.igrp);
      tagsByIgrp[categoryKey] ??= {};
      const categoryTags = tagsByIgrp[categoryKey];
      const existingTags = categoryTags[normalizedName];
      if (existingTags) {
        const mergedTags = orderAndValidateTags(
          section.igrp,
          new Set([...existingTags, ...orderedTags]),
        );
        if (hasExclusiveFacetConflict(mergedTags)) {
          ambiguousProductCount += 1;
          delete categoryTags[normalizedName];
          productCount -= 1;
          return;
        }
        categoryTags[normalizedName] = mergedTags;
      } else {
        categoryTags[normalizedName] = orderedTags;
        productCount += 1;
      }
    });

    if (sectionProductCount === 0) {
      throw new Error(`CoolPC filter source has no priced products in ${section.selectName}.`);
    }
  }

  if (conditionCount === 0 || productCount === 0) {
    throw new Error("CoolPC filter source did not contain mapped conditions and products.");
  }

  const taggedProductCount = Object.values(tagsByIgrp).reduce(
    (total, products) => total + Object.values(products).filter((tags) => tags.length > 0).length,
    0,
  );

  return {
    tagsByIgrp,
    conditionCount,
    productCount,
    taggedProductCount,
    ambiguousProductCount,
  };
}

export function normalizeFilterSyncProductName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("zh-TW");
}

function readConditionGroups(dom: CheerioAPI, controlName: string): SourceConditionGroup[] {
  const inputs = dom(`input[type="checkbox"][name="${controlName}"]`).toArray();
  if (inputs.length === 0) {
    throw new Error(`CoolPC filter source is missing checkbox control ${controlName}.`);
  }

  const groups: SourceConditionGroup[] = [];
  let pending: Array<Omit<SourceCondition, "target">> = [];

  for (const element of inputs) {
    const input = dom(element);
    const label = readConditionLabel(input, element);
    const rawPattern = input.attr("value");
    const patternText = !rawPattern || rawPattern === "on" ? label : rawPattern;

    pending.push({ label, pattern: compilePattern(patternText, controlName, label) });

    const boundary = input.attr("alt");
    if (!boundary) {
      continue;
    }

    const target = boundary === "1" ? "optgroup" : boundary === "2" ? "product" : null;
    if (!target) {
      throw new Error(`CoolPC filter source has unsupported alt=${boundary} for ${controlName}.`);
    }

    groups.push({
      target,
      conditions: pending.map((condition) => ({ ...condition, target })),
    });
    pending = [];
  }

  if (pending.length > 0) {
    throw new Error(`CoolPC filter source has an unterminated condition group for ${controlName}.`);
  }

  return groups;
}

function readConditionLabel(input: ReturnType<CheerioAPI>, element: unknown): string {
  const parent = input.parent();
  const parentLabel = parent.text().replace(/\s+/g, " ").trim();
  if (parent.find('input[type="checkbox"]').length === 1) {
    return parentLabel;
  }

  const nextSibling = (element as { nextSibling?: { type?: string; data?: string } }).nextSibling;
  return nextSibling?.type === "text" ? (nextSibling.data ?? "").replace(/\s+/g, " ").trim() : "";
}

function validateManagedGroup(
  controlName: string,
  source: SourceConditionGroup,
  mapping: SourceFilterGroupMapping,
): void {
  if (source.target !== mapping.target) {
    throw new Error(
      `CoolPC filter target changed for ${controlName}: expected ${mapping.target}, got ${source.target}.`,
    );
  }

  const sourceLabels = new Set(source.conditions.map((condition) => condition.label));
  const mappedLabels = Object.keys(mapping.conditions);
  const unknownLabels = [...sourceLabels].filter((label) => !(label in mapping.conditions));
  const missingLabels = mappedLabels.filter((label) => !sourceLabels.has(label));

  if (unknownLabels.length > 0 || missingLabels.length > 0) {
    throw new Error(
      `CoolPC filter conditions changed for ${controlName}: unknown=${unknownLabels.join("|") || "none"} missing=${missingLabels.join("|") || "none"}.`,
    );
  }
}

function mapConditions(source: SourceConditionGroup, mapping: SourceFilterGroupMapping) {
  return source.conditions.flatMap((condition) => {
    const tags = mapping.conditions[condition.label];
    return tags ? [{ ...condition, tags }] : [];
  });
}

function readProductName(optionText: string): string | null {
  const match = optionText.match(/^(.*?),\s*\$[\d,]+(?:\s|$)/);
  return match?.[1]?.trim() || null;
}

function compilePattern(pattern: string, controlName: string, label: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    throw new Error(`CoolPC filter regex is invalid for ${controlName}/${label}.`);
  }
}

function orderAndValidateTags(igrp: number, tags: Set<string>): string[] {
  const definitions = getProductFacetDefinitions(igrp);
  const ordered = definitions.flatMap((definition) =>
    definition.options
      .map((option) => `${definition.key}:${option.value}`)
      .filter((tag) => tags.has(tag)),
  );

  for (const tag of tags) {
    if (!isProductFilterTagSupported(igrp, tag)) {
      throw new Error(`CoolPC filter mapping produced unsupported IGrp=${igrp} tag ${tag}.`);
    }
  }

  return ordered;
}

function hasExclusiveFacetConflict(tags: readonly string[]): boolean {
  return [...EXCLUSIVE_FACET_KEYS].some(
    (key) => tags.filter((tag) => tag.startsWith(`${key}:`)).length > 1,
  );
}
