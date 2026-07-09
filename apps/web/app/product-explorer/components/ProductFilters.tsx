// apps/web/app/product-explorer/components/ProductFilters.tsx
// 呈現商品探索頁左側分類篩選面板，桌面固定展開、手機可收合。

import type { MouseEvent } from "react";
import type { CategoryItem, LoadState } from "../types";
import { CategoryOption } from "./CategoryOption";

interface ProductFiltersProps {
  categories: CategoryItem[];
  categoryState: LoadState;
  filtersOpen: boolean;
  selectedIgrp: string;
  onCategoryChange: (igrp: string) => void;
  onKeepDesktopOpen: (event: MouseEvent<HTMLElement>) => void;
  onToggleOpen: (isOpen: boolean) => void;
}

// 顯示來源分類 radio group，並透過 details / summary 承接響應式收合行為。
export function ProductFilters({
  categories,
  categoryState,
  filtersOpen,
  selectedIgrp,
  onCategoryChange,
  onKeepDesktopOpen,
  onToggleOpen,
}: ProductFiltersProps) {
  return (
    <aside className="filter-panel">
      <details open={filtersOpen} onToggle={(event) => onToggleOpen(event.currentTarget.open)}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: summary is the native details control; the click handler only disables desktop collapse. */}
        <summary onClick={onKeepDesktopOpen}>
          <span>搜尋與篩選</span>
          <span className="filter-summary-meta">
            <span className="filter-chevron" aria-hidden="true" />
          </span>
        </summary>
        <div className="filter-stack">
          <div className="filter-group">
            <span className="filter-title">分類</span>
            <div className="category-list" role="radiogroup" aria-label="分類">
              {categories.map((category) => (
                <CategoryOption
                  checked={selectedIgrp === String(category.igrp)}
                  key={category.id}
                  label={category.displayName}
                  subLabel={category.sourceName}
                  value={String(category.igrp)}
                  onChange={() => onCategoryChange(String(category.igrp))}
                />
              ))}
            </div>
            {categoryState === "error" ? (
              <p className="inline-error">分類暫時無法載入。</p>
            ) : null}
          </div>
        </div>
      </details>
    </aside>
  );
}
