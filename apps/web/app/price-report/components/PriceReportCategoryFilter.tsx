// apps/web/app/price-report/components/PriceReportCategoryFilter.tsx
// 提供價格變動總覽專用、可連續勾選分類的 checkbox popover。

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon } from "../../_shared/icons";
import type { CategorySlug } from "../../category-slugs";
import type { PriceReportCategory } from "../types";

interface PriceReportCategoryFilterProps {
  categories: PriceReportCategory[];
  values: CategorySlug[];
  onChange: (values: CategorySlug[]) => void;
}

export function PriceReportCategoryFilter({
  categories,
  values,
  onChange,
}: PriceReportCategoryFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState(values);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const summary = getCategorySummary(categories, selectedValues);

  useEffect(() => {
    setSelectedValues(values);
  }, [values]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isOpen]);

  function closePopover(restoreTriggerFocus = false) {
    setIsOpen(false);
    if (restoreTriggerFocus) triggerRef.current?.focus();
  }

  function toggleCategory(slug: CategorySlug) {
    const nextValues = selectedValues.includes(slug)
      ? selectedValues.filter((value) => value !== slug)
      : [...selectedValues, slug];
    const normalizedValues = nextValues.length === categories.length ? [] : nextValues;
    setSelectedValues(normalizedValues);
    onChange(normalizedValues);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePopover(true);
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  return (
    <div
      className={isOpen ? "price-report-category-filter is-open" : "price-report-category-filter"}
      ref={rootRef}
    >
      <button
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`商品分類，目前${summary}`}
        className="price-report-select-trigger"
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span>{summary}</span>
        <ChevronDownIcon className="price-report-select-chevron" />
      </button>

      {isOpen ? (
        <div
          aria-label="商品分類選項"
          className="price-report-category-popover"
          id={popoverId}
          role="dialog"
          onKeyDown={handleKeyDown}
        >
          <fieldset className="price-report-category-options">
            <legend className="sr-only">商品分類選項</legend>
            {categories.map((category) => {
              const checked = selectedValues.includes(category.slug);

              return (
                <label
                  className={checked ? "price-report-category-option is-active" : "price-report-category-option"}
                  key={category.slug}
                >
                  <input
                    checked={checked}
                    type="checkbox"
                    value={category.slug}
                    onChange={() => toggleCategory(category.slug)}
                  />
                  <span>{category.displayName}</span>
                </label>
              );
            })}
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

function getCategorySummary(
  categories: PriceReportCategory[],
  values: CategorySlug[],
): string {
  if (values.length === 0) return "全部分類";
  if (values.length > 1) return `已選 ${values.length} 項`;

  return categories.find(({ slug }) => slug === values[0])?.displayName ?? "已選 1 項";
}
