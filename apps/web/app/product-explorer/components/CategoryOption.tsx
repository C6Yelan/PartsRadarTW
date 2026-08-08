// apps/web/app/product-explorer/components/CategoryOption.tsx
// 呈現商品探索頁分類導覽使用的單一路由連結。

import Link from "next/link";

interface CategoryOptionProps {
  href: string;
  label: string;
  selected: boolean;
  subLabel: string;
}

// 顯示分類名稱與來源站分類名稱，並保留可開新分頁的 pathname link semantics。
export function CategoryOption({ href, label, selected, subLabel }: CategoryOptionProps) {
  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={selected ? "category-option is-active" : "category-option"}
      href={href}
    >
      <span className="option-copy">
        <span>{label}</span>
        <small>{subLabel}</small>
      </span>
    </Link>
  );
}
