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

interface PriceReportFiltersProps {
  categories: PriceReportCategory[];
  draftKeyword: string;
  query: PriceReportQuery;
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

export function PriceReportFilters({
  categories,
  draftKeyword,
  query,
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
        <div>
          <p className="price-report-eyebrow">篩選條件</p>
          <h2 id="price-report-filters-title">查看指定範圍的價格動態</h2>
        </div>
        <button className="price-report-reset" type="button" onClick={onReset}>
          重設
        </button>
      </div>

      <form className="price-report-filter-grid" onSubmit={onKeywordSubmit}>
        <label className="price-report-control">
          <span>時間範圍</span>
          <select
            aria-label="時間範圍"
            value={query.window}
            onChange={(event) => onWindowChange(event.target.value as PriceReportWindow)}
          >
            <option value="24h">最近 24 小時</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </select>
        </label>

        <fieldset className="price-report-type-control">
          <legend>變動類型</legend>
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

        <label className="price-report-control">
          <span>商品分類</span>
          <select
            aria-label="商品分類"
            value={query.category}
            onChange={(event) => onCategoryChange(event.target.value)}
          >
            <option value="">全部分類</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="price-report-control">
          <span>排序</span>
          <select
            aria-label="排序"
            value={query.sort}
            onChange={(event) => onSortChange(event.target.value as PriceReportSort)}
          >
            <option value="changed_desc">最近變動</option>
            <option value="drop_percent_desc">降幅最大</option>
            <option value="rise_percent_desc">漲幅最大</option>
            <option value="delta_amount_desc">金額變動最大</option>
          </select>
        </label>

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
