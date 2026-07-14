// apps/web/app/product-explorer/components/AdvancedFilter.tsx
// 將目前分類的各組進階條件呈現為獨立多選欄位。

"use client";

import type { ProductFacetDefinition, ProductFacetOption } from "@partsradar/shared";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "../../_shared/icons";
import type { CategoryItem } from "../types";

export function AdvancedFilter({
  categories,
  selectedCategory,
  selectedFacets,
  onToggle,
}: {
  categories: CategoryItem[];
  selectedCategory: string;
  selectedFacets: string[];
  onToggle: (tag: string) => void;
}) {
  const definitions =
    categories.find((category) => category.slug === selectedCategory)?.facets ?? [];

  return definitions.map((definition) =>
    definition.options.length === 1 ? (
      <SingleOptionFacet
        definition={definition}
        key={definition.key}
        selectedFacets={selectedFacets}
        onToggle={onToggle}
      />
    ) : (
      <FacetFilter
        definition={definition}
        key={definition.key}
        selectedFacets={selectedFacets}
        onToggle={onToggle}
      />
    ),
  );
}

function SingleOptionFacet({
  definition,
  selectedFacets,
  onToggle,
}: {
  definition: ProductFacetDefinition;
  selectedFacets: string[];
  onToggle: (tag: string) => void;
}) {
  const option = definition.options[0];
  if (!option) {
    return null;
  }

  const tag = `${definition.key}:${option.value}`;
  const checked = selectedFacets.includes(tag);

  return (
    <label className={checked ? "single-option-facet is-active" : "single-option-facet"}>
      <input checked={checked} type="checkbox" onChange={() => onToggle(tag)} />
      <span>{option.label}</span>
    </label>
  );
}

function FacetFilter({
  definition,
  selectedFacets,
  onToggle,
}: {
  definition: ProductFacetDefinition;
  selectedFacets: string[];
  onToggle: (tag: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOptions = definition.options.filter((option) =>
    selectedFacets.includes(`${definition.key}:${option.value}`),
  );
  const summary =
    selectedOptions.length === 0
      ? "全部"
      : selectedOptions.length <= 2
        ? selectedOptions.map((option) => option.label).join("、")
        : `已選 ${selectedOptions.length} 項`;
  const optionGroups = groupFacetOptions(definition.options);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="facet-filter" ref={rootRef}>
      <span>{definition.label}</span>
      <div className={isOpen ? "facet-menu is-open" : "facet-menu"}>
        <button
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className="facet-menu-trigger"
          type="button"
          onClick={() => setIsOpen((value) => !value)}
        >
          <span>{summary}</span>
          <ChevronDownIcon className="filter-chevron" />
        </button>
        {isOpen ? (
          <div className="facet-menu-popover" data-menu-columns={definition.menuColumns}>
            <div className={optionGroups ? "facet-option-list is-grouped" : "facet-option-list"}>
              {optionGroups
                ? optionGroups.map((group) => (
                    <fieldset
                      aria-label={group.label}
                      className="facet-option-group"
                      key={`${group.label}:${group.options[0]?.value}`}
                    >
                      {group.options.map((option) => (
                        <FacetOption
                          definitionKey={definition.key}
                          key={option.value}
                          option={option}
                          selectedFacets={selectedFacets}
                          onToggle={onToggle}
                        />
                      ))}
                    </fieldset>
                  ))
                : definition.options.map((option) => (
                    <FacetOption
                      definitionKey={definition.key}
                      key={option.value}
                      option={option}
                      selectedFacets={selectedFacets}
                      onToggle={onToggle}
                    />
                  ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FacetOption({
  definitionKey,
  option,
  selectedFacets,
  onToggle,
}: {
  definitionKey: string;
  option: ProductFacetOption;
  selectedFacets: string[];
  onToggle: (tag: string) => void;
}) {
  const tag = `${definitionKey}:${option.value}`;
  const checked = selectedFacets.includes(tag);

  return (
    <label className={checked ? "facet-option is-active" : "facet-option"}>
      <input checked={checked} type="checkbox" onChange={() => onToggle(tag)} />
      <span>{option.label}</span>
    </label>
  );
}

function groupFacetOptions(options: readonly ProductFacetOption[]) {
  if (!options.some((option) => option.group)) {
    return null;
  }

  const groups: Array<{ label: string; options: ProductFacetOption[] }> = [];

  for (const option of options) {
    const label = option.group ?? "其他";
    const lastGroup = groups.at(-1);
    if (lastGroup?.label === label) {
      lastGroup.options.push(option);
    } else {
      groups.push({ label, options: [option] });
    }
  }

  return groups;
}
