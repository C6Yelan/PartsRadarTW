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
  onCategoryChange: (category: string) => void;
  onKeepDesktopOpen: (event: MouseEvent<HTMLElement>) => void;
  onToggleOpen: (isOpen: boolean) => void;
}

// 顯示來源分類 radio group，並透過 details / summary 承接響應式收合行為。
export function ProductFilters({
  categories,
  categoryState,
  filtersOpen,
  selectedCategory,
  onCategoryChange,
  onKeepDesktopOpen,
  onToggleOpen,
}: ProductFiltersProps) {
  return (
    <aside className="filter-panel">
      <details open={filtersOpen} onToggle={(event) => onToggleOpen(event.currentTarget.open)}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: summary is the native details control; the click handler only disables desktop collapse. */}
        <summary onClick={onKeepDesktopOpen}>
          <span>商品分類</span>
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
        </div>
      </details>
    </aside>
  );
}
