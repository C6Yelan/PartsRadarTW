"use client";

import Link from "next/link";
import { type SubmitEvent, useCallback, useEffect, useMemo, useState } from "react";

type SourceStatus = "ok" | "stale" | "unavailable";
type ProductStatus = "active" | "inactive" | "all";
type ProductSort = "price_asc" | "price_desc" | "name_asc" | "updated_desc";
type LoadState = "idle" | "loading" | "ready" | "error";

interface CategoryItem {
  id: string;
  source: "coolpc";
  igrp: number;
  displayName: string;
  sourceName: string;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}

interface CategoriesResponse {
  data: CategoryItem[];
}

interface ProductListItem {
  id: string;
  name: string;
  category: {
    id: string;
    igrp: number;
    displayName: string;
    sourceName: string;
  };
  image: {
    url: string;
    alt: string;
    capturedAt: string;
  };
  price: {
    amount: number;
    currency: "TWD";
    capturedAt: string;
    lastSeenAt: string;
  };
  source: {
    name: "coolpc";
    url: string;
  };
  status: {
    isActive: boolean;
    missingSince: string | null;
  };
}

interface ProductsResponse {
  data: ProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    sourceStatus: SourceStatus;
    lastSuccessAt: string | null;
  };
}

interface QueryState {
  q: string;
  igrp: string;
  minPrice: string;
  maxPrice: string;
  status: ProductStatus;
  sort: ProductSort;
  page: number;
  pageSize: number;
}

const DEFAULT_QUERY: QueryState = {
  q: "",
  igrp: "",
  minPrice: "",
  maxPrice: "",
  status: "active",
  sort: "price_asc",
  page: 1,
  pageSize: 24,
};

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "price_asc", label: "價格低到高" },
  { value: "price_desc", label: "價格高到低" },
  { value: "name_asc", label: "名稱 A 到 Z" },
  { value: "updated_desc", label: "最近更新" },
];

const STATUS_OPTIONS: Array<{ value: ProductStatus; label: string }> = [
  { value: "active", label: "目前上架" },
  { value: "all", label: "全部商品" },
  { value: "inactive", label: "可能已下架" },
];

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

export default function ProductExplorer() {
  const [isReady, setIsReady] = useState(false);
  const [query, setQuery] = useState<QueryState>(DEFAULT_QUERY);
  const [draft, setDraft] = useState<QueryState>(DEFAULT_QUERY);
  const [formError, setFormError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryState, setCategoryState] = useState<LoadState>("idle");
  const [products, setProducts] = useState<ProductsResponse | null>(null);
  const [productState, setProductState] = useState<LoadState>("idle");
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    const initialQuery = readQueryFromLocation();
    setQuery(initialQuery);
    setDraft(initialQuery);
    setIsReady(true);

    const handlePopState = () => {
      const nextQuery = readQueryFromLocation();
      setQuery(nextQuery);
      setDraft(nextQuery);
      setFormError(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 761px)");
    const syncFiltersOpen = () => setFiltersOpen(mediaQuery.matches);

    syncFiltersOpen();
    mediaQuery.addEventListener("change", syncFiltersOpen);

    return () => mediaQuery.removeEventListener("change", syncFiltersOpen);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCategoryState("loading");

    fetch("/api/categories", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load categories.");
        }

        return (await response.json()) as CategoriesResponse;
      })
      .then((body) => {
        setCategories(body.data);
        setCategoryState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCategoryState("error");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const controller = new AbortController();
    setProductState("loading");

    fetch(`/api/products?${toApiSearchParams(query).toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load products.");
        }

        return (await response.json()) as ProductsResponse;
      })
      .then((body) => {
        setProducts(body);
        setProductState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setProductState("error");
      });

    return () => controller.abort();
  }, [isReady, query]);

  const selectedCategoryName = useMemo(() => {
    if (!query.igrp) {
      return "全部分類";
    }

    return (
      categories.find((category) => String(category.igrp) === query.igrp)?.displayName ??
      `IGrp ${query.igrp}`
    );
  }, [categories, query.igrp]);

  const sourceStatus = products?.meta.sourceStatus ?? "unavailable";
  const totalItems = products?.pagination.totalItems ?? 0;
  const totalPages = products?.pagination.totalPages ?? 0;
  const visiblePages = getVisiblePages(query.page, totalPages);
  const hasActiveFilters =
    query.q !== DEFAULT_QUERY.q ||
    query.igrp !== DEFAULT_QUERY.igrp ||
    query.minPrice !== DEFAULT_QUERY.minPrice ||
    query.maxPrice !== DEFAULT_QUERY.maxPrice ||
    query.status !== DEFAULT_QUERY.status;

  const commitQuery = useCallback((nextQuery: QueryState) => {
    const normalizedQuery = {
      ...nextQuery,
      page: Math.max(1, nextQuery.page),
      pageSize: PAGE_SIZE_OPTIONS.includes(nextQuery.pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? nextQuery.pageSize
        : DEFAULT_QUERY.pageSize,
    };
    const nextUrl = toUrl(normalizedQuery);

    window.history.pushState(null, "", nextUrl);
    setQuery(normalizedQuery);
    setDraft(normalizedQuery);
    setFormError(null);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const validationError = validatePriceRange(draft.minPrice, draft.maxPrice);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);

    const minPrice = draft.minPrice.trim();
    const maxPrice = draft.maxPrice.trim();
    if (minPrice === query.minPrice && maxPrice === query.maxPrice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      commitQuery({
        ...query,
        minPrice,
        maxPrice,
        page: 1,
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [commitQuery, draft.minPrice, draft.maxPrice, isReady, query]);

  function updateQuery(partial: Partial<QueryState>) {
    commitQuery({
      ...query,
      ...partial,
      page: partial.page ?? 1,
    });
  }

  function applyTextFilters(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validatePriceRange(draft.minPrice, draft.maxPrice);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    commitQuery({
      ...query,
      q: draft.q.trim().slice(0, 100),
      minPrice: draft.minPrice.trim(),
      maxPrice: draft.maxPrice.trim(),
      page: 1,
    });
  }

  function resetFilters() {
    commitQuery({
      ...query,
      q: DEFAULT_QUERY.q,
      igrp: DEFAULT_QUERY.igrp,
      minPrice: DEFAULT_QUERY.minPrice,
      maxPrice: DEFAULT_QUERY.maxPrice,
      status: DEFAULT_QUERY.status,
      page: 1,
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>

        <form className="topbar-search" onSubmit={applyTextFilters}>
          <label className="sr-only" htmlFor="global-search">
            搜尋商品名稱
          </label>
          <span className="search-glyph" aria-hidden="true" />
          <input
            id="global-search"
            maxLength={100}
            placeholder="搜尋商品名稱、型號..."
            type="search"
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          />
          <button className="control-button primary" type="submit">
            搜尋
          </button>
        </form>

        <div className="topbar-meta" aria-label="來源狀態" role="status">
          <span>最後同步：{formatDateTime(products?.meta.lastSuccessAt, "尚無資料")}</span>
          <StatusBadge status={sourceStatus} />
        </div>
      </header>

      <main className="dashboard-shell">
        <section className="summary-strip" aria-label="資料摘要">
          <SummaryItem
            label="已收錄分類"
            value={categoryState === "ready" ? categories.length : "--"}
          />
          <SummaryItem label="查詢結果" value={formatInteger(totalItems)} />
          <SummaryItem label="目前分類" value={selectedCategoryName} />
          <SummaryItem
            label="資料狀態"
            value={sourceStatusLabel(sourceStatus)}
            tone={sourceStatus}
          />
        </section>

        {sourceStatus === "stale" ? (
          <div className="quiet-alert" role="status">
            最近未成功檢查來源，目前仍顯示最後一次有效資料。
          </div>
        ) : null}

        <div className="workspace-grid">
          <aside className="filter-panel">
            {hasActiveFilters ? (
              <button className="filter-reset-button" type="button" onClick={resetFilters}>
                重設
              </button>
            ) : null}
            <details
              open={filtersOpen}
              onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
            >
              <summary>搜尋與篩選</summary>
              <div className="filter-stack">
                <div className="filter-group">
                  <span className="filter-title">分類</span>
                  <div className="category-list" role="radiogroup" aria-label="分類">
                    <CategoryOption
                      checked={query.igrp === ""}
                      label="全部分類"
                      subLabel={categoryState === "ready" ? `${categories.length} 類` : "讀取中"}
                      value=""
                      onChange={() => updateQuery({ igrp: "" })}
                    />
                    {categories.map((category) => (
                      <CategoryOption
                        checked={query.igrp === String(category.igrp)}
                        key={category.id}
                        label={category.displayName}
                        subLabel={category.sourceName}
                        value={String(category.igrp)}
                        onChange={() => updateQuery({ igrp: String(category.igrp) })}
                      />
                    ))}
                  </div>
                  {categoryState === "error" ? (
                    <p className="inline-error">分類暫時無法載入。</p>
                  ) : null}
                </div>

                <div className="filter-group">
                  <span className="filter-title">價格範圍（NT$）</span>
                  <div className="price-grid">
                    <label>
                      <span className="sr-only">最低價格</span>
                      <input
                        inputMode="numeric"
                        placeholder="最低價格"
                        type="text"
                        value={draft.minPrice}
                        onChange={(event) => setDraft({ ...draft, minPrice: event.target.value })}
                      />
                    </label>
                    <label>
                      <span className="sr-only">最高價格</span>
                      <input
                        inputMode="numeric"
                        placeholder="最高價格"
                        type="text"
                        value={draft.maxPrice}
                        onChange={(event) => setDraft({ ...draft, maxPrice: event.target.value })}
                      />
                    </label>
                  </div>
                  {formError ? <p className="inline-error">{formError}</p> : null}
                </div>

                <div className="filter-group">
                  <span className="filter-title">上架狀態</span>
                  <div className="segmented-control">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        aria-pressed={query.status === option.value}
                        className={query.status === option.value ? "is-active" : ""}
                        key={option.value}
                        type="button"
                        onClick={() => updateQuery({ status: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </aside>

          <section className="results-panel" aria-label="商品列表">
            <div className="results-toolbar">
              <div>
                <p className="eyebrow">搜尋結果</p>
                <h1>{formatInteger(totalItems)} 筆商品</h1>
              </div>
              <div className="toolbar-controls">
                <label>
                  <span>排序</span>
                  <select
                    aria-label="排序"
                    value={query.sort}
                    onChange={(event) => updateQuery({ sort: event.target.value as ProductSort })}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>每頁</span>
                  <select
                    aria-label="每頁顯示"
                    value={query.pageSize}
                    onChange={(event) =>
                      updateQuery({
                        pageSize: Number(event.target.value) || DEFAULT_QUERY.pageSize,
                      })
                    }
                  >
                    {PAGE_SIZE_OPTIONS.map((pageSize) => (
                      <option key={pageSize} value={pageSize}>
                        {pageSize}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="product-table">
              <div className="table-header">
                <span aria-hidden="true" />
                <span>商品</span>
                <span>分類</span>
                <span>目前價格</span>
                <span>價格最後確認</span>
                <span>上架狀態</span>
                <span>來源</span>
              </div>

              {productState === "loading" || productState === "idle" ? <SkeletonRows /> : null}

              {productState === "error" ? (
                <div className="empty-state" role="alert">
                  <h2>商品資料暫時無法載入</h2>
                  <p>請稍後重新整理或檢查本機 API 與資料庫狀態。</p>
                </div>
              ) : null}

              {productState === "ready" && products?.data.length === 0 ? (
                <div className="empty-state">
                  <h2>
                    {sourceStatus === "unavailable" ? "目前沒有可用商品資料" : "查無符合條件的商品"}
                  </h2>
                  <p>
                    {sourceStatus === "unavailable"
                      ? "來源尚未有可顯示的有效資料。"
                      : "保留目前條件，調整關鍵字、分類或價格範圍後再查詢。"}
                  </p>
                </div>
              ) : null}

              {productState === "ready"
                ? products?.data.map((product) => <ProductRow key={product.id} product={product} />)
                : null}
            </div>

            <div className="pagination-bar">
              <button
                className="icon-button"
                disabled={query.page <= 1 || productState === "loading"}
                type="button"
                onClick={() => updateQuery({ page: query.page - 1 })}
              >
                上一頁
              </button>
              <nav className="page-buttons" aria-label="頁碼">
                {visiblePages.map((item) =>
                  typeof item === "string" ? (
                    <span className="page-gap" key={item}>
                      ...
                    </span>
                  ) : (
                    <button
                      aria-current={item === query.page ? "page" : undefined}
                      className={item === query.page ? "is-active" : ""}
                      key={item}
                      type="button"
                      onClick={() => updateQuery({ page: item })}
                    >
                      {item}
                    </button>
                  ),
                )}
              </nav>
              <button
                className="icon-button"
                disabled={query.page >= Math.max(1, totalPages) || productState === "loading"}
                type="button"
                onClick={() => updateQuery({ page: query.page + 1 })}
              >
                下一頁
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function CategoryOption({
  checked,
  label,
  subLabel,
  value,
  onChange,
}: {
  checked: boolean;
  label: string;
  subLabel: string;
  value: string;
  onChange: () => void;
}) {
  return (
    <label className={checked ? "category-option is-active" : "category-option"}>
      <input checked={checked} name="igrp" type="radio" value={value} onChange={onChange} />
      <span className="option-copy">
        <span>{label}</span>
        <small>{subLabel}</small>
      </span>
    </label>
  );
}

function ProductRow({ product }: { product: ProductListItem }) {
  return (
    <article className="product-row">
      <ProductImage
        alt={product.image.alt}
        fallbackLabel={product.category.displayName}
        src={product.image.url}
      />
      <div className="product-main">
        <Link href={`/products/${product.id}`}>{product.name}</Link>
        <span>{product.category.sourceName}</span>
      </div>
      <div className="table-cell row-category">
        <span className="cell-label">分類</span>
        <span>{product.category.displayName}</span>
      </div>
      <div className="table-cell row-price">
        <span className="cell-label">目前價格</span>
        <strong>{formatPrice(product.price.amount)}</strong>
      </div>
      <div className="table-cell row-updated">
        <span className="cell-label">價格最後確認</span>
        <span>{formatDateTime(product.price.lastSeenAt, "尚無時間")}</span>
      </div>
      <div className="table-cell row-status">
        <span className="cell-label">上架狀態</span>
        <span className={product.status.isActive ? "row-state ok" : "row-state warning"}>
          {product.status.isActive ? "目前上架" : "可能已下架"}
        </span>
      </div>
      <a className="source-link" href={product.source.url} rel="noreferrer" target="_blank">
        原價屋
      </a>
    </article>
  );
}

function ProductImage({
  alt,
  fallbackLabel,
  src,
}: {
  alt: string;
  fallbackLabel: string;
  src: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className="product-image fallback"
        aria-label={`${fallbackLabel}圖片暫時無法顯示`}
        role="img"
      >
        <span className="image-fallback-copy">
          <strong>無圖</strong>
          <small>{fallbackLabel}</small>
        </span>
      </div>
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: CoolPC image URLs are validated server-side; plain img keeps referrerPolicy explicit without enabling an image proxy.
    <img
      alt={alt}
      className="product-image"
      loading="lazy"
      referrerPolicy="no-referrer"
      src={src}
      onError={() => setHasError(true)}
    />
  );
}

function SummaryItem({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: SourceStatus;
  value: number | string;
}) {
  return (
    <div className={tone ? `summary-item ${tone}` : "summary-item"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: SourceStatus }) {
  return <span className={`status-badge ${status}`}>{sourceStatusLabel(status)}</span>;
}

function SkeletonRows() {
  return (
    <>
      {SKELETON_ROWS.map((row) => (
        <div className="product-row skeleton-row" key={row}>
          <span className="skeleton-box image" />
          <span className="skeleton-box wide" />
          <span className="skeleton-box short" />
          <span className="skeleton-box short" />
          <span className="skeleton-box medium" />
          <span className="skeleton-box short" />
          <span className="skeleton-box short" />
        </div>
      ))}
    </>
  );
}

function readQueryFromLocation(): QueryState {
  const params = new URLSearchParams(window.location.search);

  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    igrp: parseNonNegativeIntegerParam(params.get("igrp")) ?? "",
    minPrice: parseNonNegativeIntegerParam(params.get("minPrice")) ?? "",
    maxPrice: parseNonNegativeIntegerParam(params.get("maxPrice")) ?? "",
    status: parseAllowedValue(params.get("status"), ["active", "inactive", "all"], "active"),
    sort: parseAllowedValue(
      params.get("sort"),
      ["price_asc", "price_desc", "name_asc", "updated_desc"],
      "price_asc",
    ),
    page: Number(parseNonNegativeIntegerParam(params.get("page")) ?? DEFAULT_QUERY.page),
    pageSize: Number(
      parseNonNegativeIntegerParam(params.get("pageSize")) ?? DEFAULT_QUERY.pageSize,
    ),
  };
}

function toApiSearchParams(query: QueryState) {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", query.q);
  appendIfPresent(params, "igrp", query.igrp);
  appendIfPresent(params, "minPrice", query.minPrice);
  appendIfPresent(params, "maxPrice", query.maxPrice);
  params.set("status", query.status);
  params.set("sort", query.sort);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));

  return params;
}

function toUrl(query: QueryState) {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", query.q);
  appendIfPresent(params, "igrp", query.igrp);
  appendIfPresent(params, "minPrice", query.minPrice);
  appendIfPresent(params, "maxPrice", query.maxPrice);
  if (query.status !== DEFAULT_QUERY.status) {
    params.set("status", query.status);
  }
  if (query.sort !== DEFAULT_QUERY.sort) {
    params.set("sort", query.sort);
  }
  if (query.page !== DEFAULT_QUERY.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize !== DEFAULT_QUERY.pageSize) {
    params.set("pageSize", String(query.pageSize));
  }

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

function appendIfPresent(params: URLSearchParams, name: string, value: string) {
  const trimmed = value.trim();

  if (trimmed) {
    params.set(name, trimmed);
  }
}

function validatePriceRange(minPrice: string, maxPrice: string) {
  const min = minPrice.trim();
  const max = maxPrice.trim();

  if ((min && !isNonNegativeInteger(min)) || (max && !isNonNegativeInteger(max))) {
    return "價格請輸入 0 以上整數。";
  }

  if (min && max && Number(min) > Number(max)) {
    return "最低價格不可大於最高價格。";
  }

  return null;
}

function parseNonNegativeIntegerParam(value: string | null) {
  const normalizedValue = value?.trim();

  if (!normalizedValue || !isNonNegativeInteger(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

function isNonNegativeInteger(value: string) {
  return /^\d+$/.test(value);
}

function parseAllowedValue<T extends string>(value: string | null, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function getVisiblePages(currentPage: number, totalPages: number): Array<number | string> {
  if (totalPages <= 1) {
    return [1];
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | string> = [];

  for (const page of sortedPages) {
    const lastItem = items.at(-1);
    if (typeof lastItem === "number" && page - lastItem > 1) {
      items.push(`gap-${lastItem}-${page}`);
    }
    items.push(page);
  }

  return items;
}

function formatPrice(amount: number) {
  return `NT$ ${formatInteger(amount)}`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

function formatDateTime(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function sourceStatusLabel(status: SourceStatus) {
  switch (status) {
    case "ok":
      return "正常";
    case "stale":
      return "最近未成功";
    case "unavailable":
      return "無可用資料";
  }
}
