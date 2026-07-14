// apps/web/app/price-report/components/PriceReportFilters.tsx
// 顯示時間、類型、分類、排序與關鍵字等唯讀報告篩選控制。

import type { FormEvent } from "react";
import { PRICE_REPORT_TYPES } from "../query-state";
import type {
  PriceReportCategory,
  PriceReportQuery,
  PriceReportSort,
  PriceReportType,
  PriceReportWindow,
} from "../types";
import { PriceReportSelect, type PriceReportSelectOption } from "./PriceReportSelect";

interface PriceReportFiltersProps {
  categories: PriceReportCategory[];
  draftKeyword: string;
  query: PriceReportQuery;
  showReset: boolean;
  onCategoryChange: (category: string) => void;
  onDraftKeywordChange: (value: string) => void;
  onKeywordSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onSortChange: (sort: PriceReportSort) => void;
  onTypeToggle: (type: PriceReportType) => void;
  onWindowChange: (window: PriceReportWindow) => void;
}

const TYPE_LABELS: Record<PriceReportType, string> = {
  drop: "降價",
  rise: "漲價",
  new: "新品",
};

const WINDOW_OPTIONS: readonly PriceReportSelectOption<PriceReportWindow>[] = [
  { value: "24h", label: "最近 24 小時" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" },
];

const SORT_OPTIONS: readonly PriceReportSelectOption<PriceReportSort>[] = [
  { value: "changed_desc", label: "最近變動" },
  { value: "drop_percent_desc", label: "降幅最大" },
  { value: "rise_percent_desc", label: "漲幅最大" },
  { value: "delta_amount_desc", label: "金額變動最大" },
];

export function PriceReportFilters({
  categories,
  draftKeyword,
  query,
  showReset,
  onCategoryChange,
  onDraftKeywordChange,
  onKeywordSubmit,
  onReset,
  onSortChange,
  onTypeToggle,
  onWindowChange,
}: PriceReportFiltersProps) {
  return (
    <section className="price-report-filters" aria-labelledby="price-report-filters-title">
      <div className="price-report-section-heading">
        <h2 id="price-report-filters-title">篩選價格變動</h2>
        {showReset ? (
          <button className="price-report-reset" type="button" onClick={onReset}>
            重設
          </button>
        ) : null}
      </div>

      <form className="price-report-filter-grid" onSubmit={onKeywordSubmit}>
        <div className="price-report-control price-report-window-control">
          <span>時間範圍</span>
          <PriceReportSelect
            ariaLabel="時間範圍"
            options={WINDOW_OPTIONS}
            value={query.window}
            onChange={onWindowChange}
          />
        </div>

        <fieldset className="price-report-type-control">
          <legend className="sr-only">變動類型</legend>
          <span aria-hidden="true">變動類型</span>
          <div className="price-report-type-options">
            {PRICE_REPORT_TYPES.map((type) => {
              const checked = query.types.includes(type);

              return (
                <label className={checked ? `is-${type} is-active` : `is-${type}`} key={type}>
                  <input
                    checked={checked}
                    disabled={checked && query.types.length === 1}
                    type="checkbox"
                    onChange={() => onTypeToggle(type)}
                  />
                  <span>{TYPE_LABELS[type]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="price-report-control price-report-category-control">
          <span>商品分類</span>
          <PriceReportSelect
            ariaLabel="商品分類"
            options={[
              { value: "", label: "全部分類" },
              ...categories.map((category) => ({
                value: category.slug,
                label: category.displayName,
              })),
            ]}
            value={query.category}
            onChange={onCategoryChange}
          />
        </div>

        <div className="price-report-control price-report-sort-control">
          <span>排序</span>
          <PriceReportSelect
            ariaLabel="排序"
            options={SORT_OPTIONS}
            value={query.sort}
            onChange={onSortChange}
          />
        </div>

        <label className="price-report-control price-report-keyword-control">
          <span>商品關鍵字</span>
          <span className="price-report-keyword-input">
            <input
              aria-label="搜尋價格變動商品"
              maxLength={100}
              placeholder="例如 RTX、AM5、型號..."
              type="search"
              value={draftKeyword}
              onChange={(event) => onDraftKeywordChange(event.target.value)}
            />
            <button type="submit">查詢</button>
          </span>
        </label>
      </form>
    </section>
  );
}
