// apps/web/app/product-explorer/components/ProductFilters.tsx
// 呈現商品探索頁左側分類篩選面板，桌面固定展開、手機可收合。

import type { MouseEvent } from "react";
import { API_RATE_LIMITED_MESSAGE } from "../../_shared/api-client";
import { ChevronDownIcon } from "../../_shared/icons";
import type { CategoryItem, LoadState } from "../types";
import { CategoryOption } from "./CategoryOption";

interface ProductFiltersProps {
  categories: CategoryItem[];
  categoryState: LoadState;
  filtersOpen: boolean;
  selectedCategory: string;
  selectedFacets: string[];
  onCategoryChange: (category: string) => void;
  onKeepDesktopOpen: (event: MouseEvent<HTMLElement>) => void;
  onToggleFacet: (tag: string) => void;
  onToggleOpen: (isOpen: boolean) => void;
}

// 顯示來源分類 radio group，並透過 details / summary 承接響應式收合行為。
export function ProductFilters({
  categories,
  categoryState,
  filtersOpen,
  selectedCategory,
  selectedFacets,
  onCategoryChange,
  onKeepDesktopOpen,
  onToggleFacet,
  onToggleOpen,
}: ProductFiltersProps) {
  const facetDefinitions =
    categories.find((category) => category.slug === selectedCategory)?.facets ?? [];

  return (
    <aside className="filter-panel">
      <details open={filtersOpen} onToggle={(event) => onToggleOpen(event.currentTarget.open)}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: summary is the native details control; the click handler only disables desktop collapse. */}
        <summary onClick={onKeepDesktopOpen}>
          <span>搜尋與篩選</span>
          <span className="filter-summary-meta">
            <ChevronDownIcon className="filter-chevron" />
          </span>
        </summary>
        <div className="filter-stack">
          <div>
            <span className="filter-title">分類</span>
            <div className="category-list" role="radiogroup" aria-label="分類">
              {categories.map((category) => (
                <CategoryOption
                  checked={selectedCategory === category.slug}
                  key={category.id}
                  label={category.displayName}
                  subLabel={category.sourceName}
                  value={category.slug}
                  onChange={() => onCategoryChange(category.slug)}
                />
              ))}
            </div>
            {categoryState === "error" ? <p className="inline-error">分類暫時無法載入。</p> : null}
            {categoryState === "rate_limited" ? (
              <p className="inline-error">{API_RATE_LIMITED_MESSAGE}</p>
            ) : null}
          </div>

          {facetDefinitions.length > 0 ? (
            <section className="facet-groups" aria-labelledby="advanced-filters-title">
              <span className="filter-title" id="advanced-filters-title">
                進階篩選
              </span>

              {facetDefinitions.map((definition) => (
                <fieldset className="facet-group" key={definition.key}>
                  <legend>{definition.label}</legend>
                  <div className="facet-option-list">
                    {definition.options.map((option) => {
                      const tag = `${definition.key}:${option.value}`;
                      const checked = selectedFacets.includes(tag);

                      return (
                        <label
                          className={checked ? "facet-option is-active" : "facet-option"}
                          key={tag}
                        >
                          <input
                            checked={checked}
                            type="checkbox"
                            value={tag}
                            onChange={() => onToggleFacet(tag)}
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </section>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
