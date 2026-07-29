// 解析 CoolPC 估價頁的既有篩選語意，產生可由 scheduled crawler 套用的站內 tags。

import { getProductFacetDefinitions, isProductFilterTagSupported } from "@partsradar/shared";
import { type CheerioAPI, load } from "cheerio";
import {
  SOURCE_FILTER_SECTION_MAPPINGS,
  type SourceFilterGroupMapping,
  type SourceFilterMatcher,
  type SourceFilterTarget,
} from "./mappings";

export interface ParsedCoolpcFilterSnapshot {
  tagsByIgrp: Record<string, Record<string, string[]>>;
  conditionCount: number;
  productCount: number;
  taggedProductCount: number;
  ambiguousProductCount: number;
  sourceValueDriftCount: number;
}

interface SourceCondition {
  label: string;
  rawValue: string | null;
  target: SourceFilterTarget;
}

interface MappedSourceCondition extends SourceCondition {
  tags: readonly string[];
  matcher: SourceFilterMatcher;
}

interface SourceConditionGroup {
  target: SourceFilterTarget;
  conditions: SourceCondition[];
}

export const COOLPC_FILTER_SYNC_SOURCE_LIMITS = {
  htmlBytes: 5 * 1024 * 1024,
  conditionsPerControl: 256,
  optionsPerSection: 2_000,
  conditionLabelCharacters: 128,
  conditionValueCharacters: 512,
  optionTextCharacters: 1_024,
  optgroupLabelCharacters: 256,
} as const;

const EXCLUSIVE_FACET_KEYS = new Set([
  "socket",
  "module_type",
  "storage_type",
  "external_type",
  "gpu_chip",
  "wattage_range",
]);

export function parseCoolpcFilterSnapshot(html: string): ParsedCoolpcFilterSnapshot {
  if (Buffer.byteLength(html, "utf8") > COOLPC_FILTER_SYNC_SOURCE_LIMITS.htmlBytes) {
    throw new Error("CoolPC filter source exceeds the HTML size limit.");
  }

  const dom = load(html);
  const tagsByIgrp: Record<string, Record<string, string[]>> = {};
  let conditionCount = 0;
  let productCount = 0;
  let ambiguousProductCount = 0;
  let sourceValueDriftCount = 0;

  for (const section of SOURCE_FILTER_SECTION_MAPPINGS) {
    const selects = dom(`select[name="${section.selectName}"]`);
    if (selects.length === 0) {
      throw new Error(`CoolPC filter source is missing select ${section.selectName}.`);
    }
    if (selects.length !== 1) {
      throw new Error(
        `CoolPC filter select count changed for ${section.selectName}: expected 1, got ${selects.length}.`,
      );
    }
    const select = selects.first();

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

      sourceValueDriftCount += validateManagedGroup(section.controlName, sourceGroup, mapping);
      conditionCount += sourceGroup.conditions.length;
      return mapConditions(sourceGroup, mapping);
    });
    let sectionProductCount = 0;

    const options = select.find("option").toArray();
    if (options.length > COOLPC_FILTER_SYNC_SOURCE_LIMITS.optionsPerSection) {
      throw new Error(`CoolPC filter source has too many options in ${section.selectName}.`);
    }

    for (const element of options) {
      const option = dom(element);
      if (option.is(":disabled")) {
        continue;
      }

      const rawOptionText = option.text();
      assertTextLength(
        rawOptionText,
        COOLPC_FILTER_SYNC_SOURCE_LIMITS.optionTextCharacters,
        `CoolPC filter option text is too long in ${section.selectName}.`,
      );
      const optionText = rawOptionText.trim();
      const productName = readProductName(optionText);
      if (!productName) {
        continue;
      }
      sectionProductCount += 1;

      const rawOptgroupLabel = option.parent("optgroup").attr("label") ?? "";
      assertTextLength(
        rawOptgroupLabel,
        COOLPC_FILTER_SYNC_SOURCE_LIMITS.optgroupLabelCharacters,
        `CoolPC filter optgroup label is too long in ${section.selectName}.`,
      );
      const optgroupLabel = rawOptgroupLabel.trim();
      const tags = new Set<string>();

      for (const conditions of mappedGroups) {
        if (!conditions) {
          continue;
        }

        for (const condition of conditions) {
          const targetText = condition.target === "optgroup" ? optgroupLabel : optionText;
          if (matchesSourceFilterText(targetText, condition.matcher)) {
            for (const tag of condition.tags) {
              tags.add(tag);
            }
          }
        }
      }

      const orderedTags = orderAndValidateTags(section.igrp, tags);
      if (hasExclusiveFacetConflict(orderedTags)) {
        ambiguousProductCount += 1;
        continue;
      }
      const normalizedName = normalizeFilterSyncProductName(productName);
      if (!normalizedName) {
        continue;
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
          continue;
        }
        categoryTags[normalizedName] = mergedTags;
      } else {
        categoryTags[normalizedName] = orderedTags;
        productCount += 1;
      }
    }

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
    sourceValueDriftCount,
  };
}

export function normalizeFilterSyncProductName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:(?:【限(?:組裝|搭機)】|~限(?:組裝|搭機)~)\s*)+$/g, "")
    .trim()
    .toLocaleLowerCase("zh-TW");
}

function readConditionGroups(dom: CheerioAPI, controlName: string): SourceConditionGroup[] {
  const inputs = dom(`input[type="checkbox"][name="${controlName}"]`).toArray();
  if (inputs.length === 0) {
    throw new Error(`CoolPC filter source is missing checkbox control ${controlName}.`);
  }
  if (inputs.length > COOLPC_FILTER_SYNC_SOURCE_LIMITS.conditionsPerControl) {
    throw new Error(`CoolPC filter source has too many conditions for ${controlName}.`);
  }

  const groups: SourceConditionGroup[] = [];
  let pending: Array<Omit<SourceCondition, "target">> = [];

  for (const element of inputs) {
    const input = dom(element);
    const label = readConditionLabel(input, element, controlName);
    const rawValue = input.attr("value") ?? null;
    if (rawValue !== null) {
      assertTextLength(
        rawValue,
        COOLPC_FILTER_SYNC_SOURCE_LIMITS.conditionValueCharacters,
        `CoolPC filter condition value is too long for ${controlName}.`,
      );
    }

    pending.push({ label, rawValue });

    const boundary = input.attr("alt");
    if (!boundary) {
      continue;
    }

    const target: SourceFilterTarget | null =
      boundary === "1" ? "optgroup" : boundary === "2" ? "product" : null;
    if (!target) {
      throw new Error(`CoolPC filter source has an unsupported group boundary for ${controlName}.`);
    }

    const conditions = pending.map((condition) => ({ ...condition, target }));
    assertUniqueConditionLabels(controlName, conditions);
    groups.push({
      target,
      conditions,
    });
    pending = [];
  }

  if (pending.length > 0) {
    throw new Error(`CoolPC filter source has an unterminated condition group for ${controlName}.`);
  }

  return groups;
}

function readConditionLabel(
  input: ReturnType<CheerioAPI>,
  element: unknown,
  controlName: string,
): string {
  const nextSibling = (element as { nextSibling?: { type?: string; data?: string } }).nextSibling;
  let rawLabel = nextSibling?.type === "text" ? (nextSibling.data ?? "") : "";

  if (!rawLabel.trim()) {
    rawLabel = input.next().first().text();
  }
  if (!rawLabel.trim() && input.parent().is("label")) {
    rawLabel = input.parent().text();
  }

  assertTextLength(
    rawLabel,
    COOLPC_FILTER_SYNC_SOURCE_LIMITS.conditionLabelCharacters,
    `CoolPC filter condition label is too long for ${controlName}.`,
  );
  const label = rawLabel.replace(/\s+/g, " ").trim();
  if (!label) {
    throw new Error(`CoolPC filter source is missing a condition label for ${controlName}.`);
  }
  return label;
}

function validateManagedGroup(
  controlName: string,
  source: SourceConditionGroup,
  mapping: SourceFilterGroupMapping,
): number {
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
      `CoolPC filter conditions changed for ${controlName}: unknown=${unknownLabels.length} missing=${missingLabels.length}.`,
    );
  }

  return source.conditions.filter((condition) => {
    const expectedValues = mapping.conditions[condition.label]?.expectedSourceValues ?? [];
    return !expectedValues.includes(condition.rawValue);
  }).length;
}

function mapConditions(
  source: SourceConditionGroup,
  mapping: SourceFilterGroupMapping,
): MappedSourceCondition[] {
  return source.conditions.flatMap((condition) => {
    const conditionMapping = mapping.conditions[condition.label];
    return conditionMapping?.tags
      ? [{ ...condition, tags: conditionMapping.tags, matcher: conditionMapping.matcher }]
      : [];
  });
}

function readProductName(optionText: string): string | null {
  const match = optionText.match(/^(.*?),\s*\$[\d,]+(?:\s|$)/);
  return match?.[1]?.trim() || null;
}

function matchesSourceFilterText(targetText: string, matcher: SourceFilterMatcher): boolean {
  if (matcher.kind === "includes") {
    const foldedTarget = targetText.toLowerCase();
    return matcher.needles.some((needle) => foldedTarget.includes(needle));
  }

  return containsWattageInRange(targetText, matcher);
}

function containsWattageInRange(
  targetText: string,
  matcher: Extract<SourceFilterMatcher, { kind: "wattage-range" }>,
): boolean {
  for (let index = 0; index < targetText.length; index += 1) {
    const firstDigit = decimalDigitValue(targetText.charCodeAt(index));
    if (firstDigit === null) {
      continue;
    }

    let value = firstDigit;
    let cursor = index + 1;
    while (cursor < targetText.length) {
      const digit = decimalDigitValue(targetText.charCodeAt(cursor));
      if (digit === null) {
        break;
      }
      value = Math.min(Number.MAX_SAFE_INTEGER, value * 10 + digit);
      cursor += 1;
    }

    const digitCount = cursor - index;
    const isWattage = targetText[cursor] === "W" || targetText[cursor] === "w";
    const hasAllowedDigits =
      digitCount >= matcher.minDigits &&
      (matcher.maxDigits === null || digitCount <= matcher.maxDigits);
    const isInRange =
      value >= matcher.minInclusive &&
      (matcher.maxExclusive === null || value < matcher.maxExclusive);
    if (isWattage && hasAllowedDigits && isInRange) {
      return true;
    }

    index = cursor - 1;
  }

  return false;
}

function decimalDigitValue(codePoint: number): number | null {
  return codePoint >= 48 && codePoint <= 57 ? codePoint - 48 : null;
}

function assertUniqueConditionLabels(
  controlName: string,
  conditions: readonly SourceCondition[],
): void {
  const labels = new Set<string>();
  for (const condition of conditions) {
    if (labels.has(condition.label)) {
      throw new Error(`CoolPC filter source has duplicate conditions for ${controlName}.`);
    }
    labels.add(condition.label);
  }
}

function assertTextLength(value: string, maxCharacters: number, message: string): void {
  if (value.length > maxCharacters) {
    throw new Error(message);
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
