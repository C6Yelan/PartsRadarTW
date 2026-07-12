// apps/web/app/product-explorer/components/AdvancedFilter.tsx
// 在商品工具列中以 popover 呈現分類專屬進階篩選。

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "../../_shared/icons";
import type { CategoryItem } from "../types";

export function AdvancedFilter({
  categories,
  selectedCategory,
  selectedFacets,
  onClear,
  onToggle,
}: {
  categories: CategoryItem[];
  selectedCategory: string;
  selectedFacets: string[];
  onClear: () => void;
  onToggle: (tag: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const definitions =
    categories.find((category) => category.slug === selectedCategory)?.facets ?? [];

  useEffect(() => {
    if (!isOpen) return;

    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [isOpen]);

  return (
    <div className="advanced-filter" ref={rootRef}>
      <span>進階篩選</span>
      {definitions.length > 0 ? (
        <div className={isOpen ? "advanced-menu is-open" : "advanced-menu"}>
          <button
            aria-expanded={isOpen}
            className="advanced-menu-trigger"
            type="button"
            onClick={() => setIsOpen((value) => !value)}
          >
            <span>
              {selectedFacets.length > 0 ? `已選 ${selectedFacets.length} 項` : "選擇條件"}
            </span>
            <ChevronDownIcon className="filter-chevron" />
          </button>
          {isOpen ? (
            <div className="advanced-menu-popover">
              <div className="advanced-menu-header">
                <span>{definitions.length} 組條件</span>
                {selectedFacets.length > 0 ? (
                  <button type="button" onClick={onClear}>
                    清除全部
                  </button>
                ) : null}
              </div>
              <div className="advanced-group-list">
                {definitions.map((definition) => (
                  <fieldset className="advanced-group" key={definition.key}>
                    <legend>{definition.label}</legend>
                    <div className="advanced-option-list">
                      {definition.options.map((option) => {
                        const tag = `${definition.key}:${option.value}`;
                        const checked = selectedFacets.includes(tag);
                        return (
                          <label
                            className={checked ? "advanced-option is-active" : "advanced-option"}
                            key={tag}
                          >
                            <input
                              checked={checked}
                              type="checkbox"
                              onChange={() => onToggle(tag)}
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <span className="advanced-filter-disabled">先選分類</span>
      )}
    </div>
  );
}
