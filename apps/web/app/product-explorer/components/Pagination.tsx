// apps/web/app/product-explorer/components/Pagination.tsx
import type { FormEvent } from "react";
import type { LoadState } from "../types";
import { toDigitsOnly } from "../query-state";

interface PaginationProps {
  page: number;
  pageJumpValue: string;
  productState: LoadState;
  shouldShowPageJump: boolean;
  totalPages: number;
  visiblePages: Array<number | string>;
  onGoToPage: (page: number) => void;
  onJumpSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPageJumpValueChange: (value: string) => void;
}

export function Pagination({
  page,
  pageJumpValue,
  productState,
  shouldShowPageJump,
  totalPages,
  visiblePages,
  onGoToPage,
  onJumpSubmit,
  onPageJumpValueChange,
}: PaginationProps) {
  return (
    <div className="pagination-bar">
      <button
        className="icon-button"
        disabled={page <= 1 || productState === "loading"}
        type="button"
        onClick={() => onGoToPage(page - 1)}
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
              aria-current={item === page ? "page" : undefined}
              className={item === page ? "is-active" : ""}
              disabled={item === page}
              key={item}
              type="button"
              onClick={() => onGoToPage(item)}
            >
              {item}
            </button>
          ),
        )}
      </nav>
      <button
        className="icon-button"
        disabled={page >= Math.max(1, totalPages) || productState === "loading"}
        type="button"
        onClick={() => onGoToPage(page + 1)}
      >
        下一頁
      </button>
      {shouldShowPageJump ? (
        <form className="page-jump" onSubmit={onJumpSubmit}>
          <label htmlFor="page-jump-input">跳至</label>
          <input
            id="page-jump-input"
            inputMode="numeric"
            placeholder="頁碼"
            type="text"
            value={pageJumpValue}
            onChange={(event) => onPageJumpValueChange(toDigitsOnly(event.target.value))}
          />
          <span>頁</span>
          <button
            className="icon-button"
            disabled={productState === "loading" || pageJumpValue.trim() === ""}
            type="submit"
          >
            前往
          </button>
        </form>
      ) : null}
    </div>
  );
}
